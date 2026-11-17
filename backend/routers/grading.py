from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from backend.auth import get_current_user
from backend.database import db
from backend.schemas import GradeAnswerRequest, TeacherOverrideRequest, RegradeRequest
from backend.services.grading_engine import evaluate_answer
from backend.services.ocr_service import extract_document
from backend.services.regrade_service import compute_rubric_diff, compute_score_deltas
from backend.services.agreement_service import compute_agreement_metrics
from backend.repo.rubric_repo import get_rubric_by_id, get_rubric_version
from backend.repo.audit_repo import log_audit_event
from backend.utils.security import validate_upload

router = APIRouter(prefix="/grading", tags=["AI Grading & Regrading"])

results_col = db["grading_results"]
history_col = db["grading_history"]


def _serialize(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def _get_owned_result(result_id: str, user: dict) -> dict:
    try:
        oid = ObjectId(result_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Grading result not found")
    doc = results_col.find_one({"_id": oid})
    if not doc or str(doc.get("owner_id")) != user["id"]:
        raise HTTPException(status_code=404, detail="Grading result not found")
    return _serialize(doc)


@router.post("/ocr-extract")
async def ocr_extract_endpoint(
    file: UploadFile = File(...),
    provider: str = Form(None),
    user: dict = Depends(get_current_user),
):
    content = await file.read()
    safe_name = validate_upload(
        file.filename or "document.pdf",
        content,
        allowed_exts={".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"},
    )
    mime = file.content_type or "application/octet-stream"
    extracted = extract_document(
        file_bytes=content,
        filename=safe_name,
        mime_type=mime,
        provider_name=provider,
    )
    return extracted


@router.post("/evaluate")
async def evaluate_single_answer(payload: GradeAnswerRequest, user: dict = Depends(get_current_user)):
    criteria = []
    subject_instructions = payload.subject_instructions
    rubric_version_used = payload.rubric_version
    rubric_name = "Custom Criteria"

    if payload.rubric_id:
        rubric = get_rubric_by_id(payload.rubric_id)
        if not rubric:
            raise HTTPException(status_code=404, detail="Rubric not found")
        if rubric.get("owner_id") != user["id"] and rubric.get("creator") != user["email"] and not rubric.get("is_template"):
            raise HTTPException(status_code=404, detail="Rubric not found")
        version_snap = get_rubric_version(payload.rubric_id, payload.rubric_version)
        if not version_snap:
            raise HTTPException(status_code=404, detail="Rubric version not found")
        rubric_version_used = version_snap["version"]
        rubric_name = version_snap["name"]
        subject_instructions = subject_instructions or version_snap.get("subject_instructions", "")
        for q in version_snap.get("questions", []):
            criteria.extend(q.get("criteria", []))
    elif payload.custom_criteria:
        criteria = [c.model_dump() for c in payload.custom_criteria]

    result = evaluate_answer(
        subject=payload.subject,
        topic=payload.topic,
        question=payload.question,
        max_marks=payload.max_marks,
        expected_answer=payload.expected_answer,
        subject_instructions=subject_instructions,
        criteria=criteria,
        student_answer=payload.student_answer,
        ocr_quality_score=payload.ocr_quality_score,
        ocr_warnings=payload.ocr_warnings,
        provider_name=payload.provider,
        calibration_offset=payload.calibration_offset,
    )

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "owner_id": user["id"],
        "exam_id": payload.exam_id,
        "student_name": payload.student_name,
        "subject": payload.subject,
        "topic": payload.topic,
        "question": payload.question,
        "expected_answer": payload.expected_answer,
        "student_answer": payload.student_answer,
        "max_marks": payload.max_marks,
        "rubric_id": payload.rubric_id,
        "rubric_version": rubric_version_used,
        "rubric_name": rubric_name,
        "criteria_snapshot": criteria,
        "grading": result["grading"],
        "ai_original_score": result["grading"]["final_marks"],
        "final_score": result["grading"]["final_marks"],
        "evidence_summary": result["evidence_summary"],
        "reliability": result["reliability"],
        "provider_used": result["provider_used"],
        "teacher_override": None,
        "status": "needs_review" if result["reliability"]["teacher_review_required"] else "pending_approval",
        "created_at": now,
        "updated_at": now,
    }
    inserted = results_col.insert_one(record)
    record["_id"] = str(inserted.inserted_id)

    history_col.insert_one(
        {
            "result_id": record["_id"],
            "owner_id": user["id"],
            "event_type": "initial_grade",
            "rubric_id": payload.rubric_id,
            "rubric_version": rubric_version_used,
            "score": record["final_score"],
            "max_marks": payload.max_marks,
            "grading_snapshot": result["grading"],
            "reliability_snapshot": result["reliability"],
            "created_at": now,
        }
    )
    log_audit_event(
        action="grading.evaluate",
        user=user,
        resource_type="grading_result",
        resource_id=record["_id"],
        details={"rubric_id": payload.rubric_id, "rubric_version": rubric_version_used, "reliability": result["reliability"]["status"]},
    )
    return record


@router.get("/results")
async def list_results(user: dict = Depends(get_current_user)):
    docs = list(results_col.find({"owner_id": user["id"]}).sort("created_at", -1))
    return {"results": [_serialize(d) for d in docs]}


@router.get("/results/{result_id}")
async def get_result_detail(result_id: str, user: dict = Depends(get_current_user)):
    doc = _get_owned_result(result_id, user)
    history = list(history_col.find({"result_id": result_id}).sort("created_at", -1))
    return {"result": doc, "history": [_serialize(h) for h in history]}


@router.post("/results/{result_id}/override")
async def override_result(result_id: str, payload: TeacherOverrideRequest, user: dict = Depends(get_current_user)):
    doc = _get_owned_result(result_id, user)
    if payload.final_marks > float(doc["max_marks"]):
        raise HTTPException(status_code=400, detail="Override score cannot exceed maximum marks")

    now = datetime.now(timezone.utc).isoformat()
    updated_grading = dict(doc["grading"])
    updated_grading["final_marks"] = payload.final_marks
    if payload.criterion_evaluations is not None:
        updated_grading["criterion_evaluations"] = [c.model_dump() for c in payload.criterion_evaluations]
    if payload.general_feedback is not None:
        updated_grading["general_feedback"] = payload.general_feedback

    override_record = {
        "overridden_by": user["email"],
        "previous_score": doc["final_score"],
        "new_score": payload.final_marks,
        "reason": payload.override_reason,
        "timestamp": now,
    }
    results_col.update_one(
        {"_id": ObjectId(result_id)},
        {
            "$set": {
                "grading": updated_grading,
                "final_score": payload.final_marks,
                "teacher_override": override_record,
                "status": "approved" if payload.approve_result else "overridden",
                "updated_at": now,
            }
        },
    )
    history_col.insert_one(
        {
            "result_id": result_id,
            "owner_id": user["id"],
            "event_type": "teacher_override",
            "rubric_id": doc.get("rubric_id"),
            "rubric_version": doc.get("rubric_version"),
            "previous_score": doc["final_score"],
            "score": payload.final_marks,
            "reason": payload.override_reason,
            "created_at": now,
        }
    )
    log_audit_event(
        action="grading.override",
        user=user,
        resource_type="grading_result",
        resource_id=result_id,
        details={"old_score": doc["final_score"], "new_score": payload.final_marks},
    )
    return _get_owned_result(result_id, user)


@router.post("/regrade")
async def regrade_answers(payload: RegradeRequest, user: dict = Depends(get_current_user)):
    rubric = get_rubric_by_id(payload.rubric_id)
    if not rubric or (rubric.get("owner_id") != user["id"] and rubric.get("creator") != user["email"]):
        raise HTTPException(status_code=404, detail="Rubric not found")

    target_snap = get_rubric_version(payload.rubric_id, payload.target_version)
    if not target_snap:
        raise HTTPException(status_code=404, detail="Target rubric version not found")

    query: dict = {"owner_id": user["id"]}
    if payload.result_ids:
        oids = [ObjectId(rid) for rid in payload.result_ids]
        query["_id"] = {"$in": oids}
    elif payload.exam_id:
        query["exam_id"] = payload.exam_id
    else:
        query["rubric_id"] = payload.rubric_id

    targets = list(results_col.find(query))
    if not targets:
        raise HTTPException(status_code=404, detail="No matching grading results found to regrade")
    if len(targets) > 1 and not payload.confirm_bulk:
        raise HTTPException(status_code=400, detail="Bulk regrading requires explicit confirm_bulk=true confirmation")

    new_criteria = [c for q in target_snap.get("questions", []) for c in q.get("criteria", [])]
    comparisons = []
    now = datetime.now(timezone.utc).isoformat()

    for doc in targets:
        rid = str(doc["_id"])
        old_version = doc.get("rubric_version")
        old_snap = get_rubric_version(doc.get("rubric_id"), old_version) if doc.get("rubric_id") else {"version": 0, "questions": [{"criteria": doc.get("criteria_snapshot", [])}]}
        rubric_diff = compute_rubric_diff(old_snap or {"version": 0, "questions": []}, target_snap)

        re_eval = evaluate_answer(
            subject=doc.get("subject", "Other"),
            topic=doc.get("topic", ""),
            question=doc["question"],
            max_marks=float(doc["max_marks"]),
            expected_answer=doc.get("expected_answer", ""),
            subject_instructions=target_snap.get("subject_instructions", ""),
            criteria=new_criteria,
            student_answer=doc["student_answer"],
        )
        score_delta_report = compute_score_deltas(doc["grading"], re_eval["grading"])

        # Preserve immutable history record BEFORE updating active result view
        history_col.insert_one(
            {
                "result_id": rid,
                "owner_id": user["id"],
                "event_type": "regrade",
                "old_rubric_version": old_version,
                "new_rubric_version": target_snap["version"],
                "old_score": doc["final_score"],
                "new_score": re_eval["grading"]["final_marks"],
                "score_delta_report": score_delta_report,
                "rubric_diff": rubric_diff,
                "reason": payload.reason,
                "previous_grading_snapshot": doc["grading"],
                "new_grading_snapshot": re_eval["grading"],
                "created_at": now,
            }
        )

        results_col.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "rubric_id": payload.rubric_id,
                    "rubric_version": target_snap["version"],
                    "rubric_name": target_snap["name"],
                    "criteria_snapshot": new_criteria,
                    "grading": re_eval["grading"],
                    "final_score": re_eval["grading"]["final_marks"],
                    "evidence_summary": re_eval["evidence_summary"],
                    "reliability": re_eval["reliability"],
                    "last_regrade_comparison": score_delta_report,
                    "updated_at": now,
                }
            },
        )
        comparisons.append(
            {
                "result_id": rid,
                "student_name": doc.get("student_name"),
                "old_rubric_version": old_version,
                "new_rubric_version": target_snap["version"],
                "rubric_diff": rubric_diff,
                **score_delta_report,
            }
        )

    log_audit_event(
        action="grading.regrade",
        user=user,
        resource_type="rubric",
        resource_id=payload.rubric_id,
        details={"count": len(comparisons), "target_version": target_snap["version"]},
    )
    return {"regraded_count": len(comparisons), "comparisons": comparisons}


@router.get("/agreement-analytics")
async def teacher_agreement_analytics(user: dict = Depends(get_current_user)):
    docs = list(results_col.find({"owner_id": user["id"], "teacher_override": {"$ne": None}}))
    pairs = []
    for d in docs:
        pairs.append(
            {
                "ai_score": float(d.get("ai_original_score", 0)),
                "human_score": float(d["teacher_override"]["new_score"]),
                "max_marks": float(d.get("max_marks", 10)),
            }
        )
    return compute_agreement_metrics(pairs)
