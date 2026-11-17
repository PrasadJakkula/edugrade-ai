import asyncio
import csv
import io
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.auth import get_current_user
from backend.database import db
from backend.services.grading_engine import evaluate_answer
from backend.repo.rubric_repo import get_rubric_by_id, get_rubric_version

router = APIRouter(prefix="/batch", tags=["Batch Grading Jobs"])
jobs_col = db["batch_jobs"]
results_col = db["grading_results"]


def _ser(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def _execute_batch_job(job_id: str, owner_id: str) -> None:
    job = jobs_col.find_one({"_id": ObjectId(job_id)})
    if not job:
        return
    jobs_col.update_one({"_id": ObjectId(job_id)}, {"$set": {"status": "running"}})
    rubric_snap = get_rubric_version(job["rubric_id"], job.get("rubric_version"))
    criteria = [c for q in rubric_snap.get("questions", []) for c in q.get("criteria", [])] if rubric_snap else []

    items = job.get("items", [])
    completed = 0
    failed = 0
    for idx, item in enumerate(items):
        if item.get("status") == "completed":
            completed += 1
            continue
        try:
            res = await asyncio.to_thread(
                evaluate_answer,
                subject=job.get("subject", "Other"),
                topic=job.get("topic", ""),
                question=job["question"],
                max_marks=float(job["max_marks"]),
                expected_answer=job.get("expected_answer", ""),
                subject_instructions=rubric_snap.get("subject_instructions", "") if rubric_snap else "",
                criteria=criteria,
                student_answer=item["student_answer"],
            )
            now = datetime.now(timezone.utc).isoformat()
            result_doc = {
                "owner_id": owner_id,
                "exam_id": job.get("exam_id"),
                "batch_job_id": job_id,
                "student_name": item["student_name"],
                "subject": job.get("subject", "Other"),
                "topic": job.get("topic", ""),
                "question": job["question"],
                "expected_answer": job.get("expected_answer", ""),
                "student_answer": item["student_answer"],
                "max_marks": float(job["max_marks"]),
                "rubric_id": job.get("rubric_id"),
                "rubric_version": rubric_snap["version"] if rubric_snap else None,
                "rubric_name": rubric_snap["name"] if rubric_snap else "Custom",
                "criteria_snapshot": criteria,
                "grading": res["grading"],
                "ai_original_score": res["grading"]["final_marks"],
                "final_score": res["grading"]["final_marks"],
                "evidence_summary": res["evidence_summary"],
                "reliability": res["reliability"],
                "provider_used": res["provider_used"],
                "teacher_override": None,
                "status": "needs_review" if res["reliability"]["teacher_review_required"] else "pending_approval",
                "created_at": now,
                "updated_at": now,
            }
            ins = results_col.insert_one(result_doc)
            items[idx]["status"] = "completed"
            items[idx]["result_id"] = str(ins.inserted_id)
            items[idx]["score"] = res["grading"]["final_marks"]
            items[idx]["reliability_status"] = res["reliability"]["status"]
            items[idx]["error"] = None
            completed += 1
        except Exception as exc:
            items[idx]["status"] = "failed"
            items[idx]["error"] = str(exc)
            failed += 1
        jobs_col.update_one(
            {"_id": ObjectId(job_id)},
            {"$set": {"items": items, "completed_count": completed, "failed_count": failed, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )

    final_status = "completed_with_errors" if failed > 0 else "completed"
    jobs_col.update_one({"_id": ObjectId(job_id)}, {"$set": {"status": final_status}})


@router.post("/jobs")
async def create_batch_job(body: dict, user: dict = Depends(get_current_user)):
    submissions = body.get("submissions") or []
    if not submissions:
        raise HTTPException(status_code=400, detail="At least one student submission is required")
    rubric_id = body.get("rubric_id")
    if rubric_id:
        rubric = get_rubric_by_id(rubric_id)
        if not rubric:
            raise HTTPException(status_code=404, detail="Rubric not found")

    now = datetime.now(timezone.utc).isoformat()
    job_doc = {
        "owner_id": user["id"],
        "title": body.get("title") or "Batch Evaluation",
        "exam_id": body.get("exam_id"),
        "subject": body.get("subject", "Other"),
        "topic": body.get("topic", ""),
        "question": body.get("question", ""),
        "expected_answer": body.get("expected_answer", ""),
        "max_marks": float(body.get("max_marks") or 10),
        "rubric_id": rubric_id,
        "rubric_version": body.get("rubric_version"),
        "status": "queued",
        "total_count": len(submissions),
        "completed_count": 0,
        "failed_count": 0,
        "items": [
            {
                "student_name": s.get("student_name", f"Student {i}"),
                "student_answer": s.get("student_answer", ""),
                "status": "pending",
                "result_id": None,
                "score": None,
                "error": None,
            }
            for i, s in enumerate(submissions, start=1)
        ],
        "created_at": now,
        "updated_at": now,
    }
    res = jobs_col.insert_one(job_doc)
    job_id = str(res.inserted_id)
    asyncio.create_task(_execute_batch_job(job_id, user["id"]))
    job_doc["_id"] = job_id
    return job_doc


@router.get("/jobs")
async def list_batch_jobs(user: dict = Depends(get_current_user)):
    docs = list(jobs_col.find({"owner_id": user["id"]}).sort("created_at", -1))
    return {"jobs": [_ser(d) for d in docs]}


@router.get("/jobs/{job_id}")
async def get_batch_job(job_id: str, user: dict = Depends(get_current_user)):
    doc = jobs_col.find_one({"_id": ObjectId(job_id), "owner_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Batch job not found")
    return _ser(doc)


@router.post("/jobs/{job_id}/retry-failed")
async def retry_failed_items(job_id: str, user: dict = Depends(get_current_user)):
    doc = jobs_col.find_one({"_id": ObjectId(job_id), "owner_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Batch job not found")
    asyncio.create_task(_execute_batch_job(job_id, user["id"]))
    return {"message": "Retrying failed batch items", "job_id": job_id}


@router.get("/jobs/{job_id}/export.csv")
async def export_batch_csv(job_id: str, user: dict = Depends(get_current_user)):
    doc = jobs_col.find_one({"_id": ObjectId(job_id), "owner_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Batch job not found")
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["student_name", "status", "score", "max_marks", "reliability_status", "result_id", "error"])
    for item in doc.get("items", []):
        writer.writerow([
            item.get("student_name"),
            item.get("status"),
            item.get("score"),
            doc.get("max_marks"),
            item.get("reliability_status", ""),
            item.get("result_id", ""),
            item.get("error", ""),
        ])
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=batch_{job_id}.csv"},
    )
