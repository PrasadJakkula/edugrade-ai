from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from backend.auth import get_current_user
from backend.database import db
from backend.services.grading_engine import evaluate_answer
from backend.services.evaluation_service import (
    parse_dataset_upload,
    split_dataset_leakage_safe,
    verify_no_split_leakage,
    fit_safe_calibration_offset,
    summarize_evaluation_run,
)
from backend.repo.audit_repo import log_audit_event
from backend.utils.security import validate_upload

router = APIRouter(prefix="/evaluation", tags=["Dataset Evaluation & Calibration"])

datasets_col = db["datasets"]
prompts_col = db["prompt_versions"]
runs_col = db["evaluation_runs"]


def _ser(doc: dict) -> dict:
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


@router.post("/datasets/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    train_ratio: float = Form(0.6),
    val_ratio: float = Form(0.2),
    user: dict = Depends(get_current_user),
):
    content = await file.read()
    safe_name = validate_upload(file.filename or "dataset.csv", content, allowed_exts={".csv", ".json"})
    try:
        samples = parse_dataset_upload(safe_name, content)
        splits = split_dataset_leakage_safe(samples, train_ratio=train_ratio, val_ratio=val_ratio)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    ok, leakage_warnings = verify_no_split_leakage(splits)
    if not ok:
        raise HTTPException(status_code=400, detail="; ".join(leakage_warnings))

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "owner_id": user["id"],
        "name": name.strip(),
        "filename": safe_name,
        "total_samples": len(samples),
        "counts": {
            "train": len(splits["train"]),
            "validation": len(splits["validation"]),
            "test": len(splits["test"]),
        },
        "splits": splits,
        "leakage_verified": True,
        "created_at": now,
    }
    res = datasets_col.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    log_audit_event(action="evaluation.dataset_upload", user=user, resource_type="dataset", resource_id=doc["_id"])
    return doc


@router.get("/datasets")
async def list_datasets(user: dict = Depends(get_current_user)):
    docs = list(datasets_col.find({"owner_id": user["id"]}).sort("created_at", -1))
    return {"datasets": [_ser(d) for d in docs]}


@router.post("/prompts")
async def create_prompt_version(body: dict, user: dict = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    instructions = (body.get("instructions") or "").strip()
    if not name or not instructions:
        raise HTTPException(status_code=400, detail="Prompt name and instructions are required")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "owner_id": user["id"],
        "name": name,
        "instructions": instructions,
        "provider": body.get("provider", "gemini"),
        "calibration_offset": float(body.get("calibration_offset") or 0.0),
        "created_at": now,
    }
    res = prompts_col.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return doc


@router.get("/prompts")
async def list_prompts(user: dict = Depends(get_current_user)):
    docs = list(prompts_col.find({"owner_id": user["id"]}).sort("created_at", -1))
    return {"prompts": [_ser(d) for d in docs]}


@router.post("/run")
async def run_evaluation(body: dict, user: dict = Depends(get_current_user)):
    dataset_id = body.get("dataset_id")
    split_name = body.get("split", "validation")
    provider_name = body.get("provider", "gemini")
    prompt_override = body.get("prompt_instructions", "")
    calibration_offset = float(body.get("calibration_offset") or 0.0)
    fit_calibration = bool(body.get("fit_calibration_on_validation", False))

    if split_name not in {"train", "validation", "test"}:
        raise HTTPException(status_code=400, detail="Split must be train, validation, or test")

    ds = datasets_col.find_one({"_id": ObjectId(dataset_id), "owner_id": user["id"]})
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if fit_calibration and split_name == "test":
        raise HTTPException(
            status_code=400,
            detail="Leakage guard: calibration offset cannot be fitted on the held-out test split. Fit on validation first.",
        )

    samples = ds["splits"].get(split_name, [])
    evaluated = []
    for sample in samples:
        res = evaluate_answer(
            subject=sample.get("subject", "Other"),
            topic=sample.get("topic", ""),
            question=sample["question"],
            max_marks=float(sample["max_marks"]),
            expected_answer=sample.get("expected_answer", ""),
            subject_instructions=prompt_override,
            criteria=[
                {
                    "criterion_id": "overall",
                    "title": "Conceptual Accuracy & Completeness",
                    "description": "Evaluate against expected answer and domain correctness.",
                    "points": float(sample["max_marks"]),
                }
            ],
            student_answer=sample["student_answer"],
            provider_name=provider_name,
            prompt_override=prompt_override,
            calibration_offset=calibration_offset,
        )
        evaluated.append(
            {
                "sample_id": sample["sample_id"],
                "human_score": sample["human_score"],
                "ai_score": res["grading"]["final_marks"],
                "max_marks": sample["max_marks"],
                "evidence_validity_rate": res["evidence_summary"]["evidence_validity_rate"],
                "reliability_status": res["reliability"]["status"],
            }
        )

    summary = summarize_evaluation_run(evaluated_items=evaluated)
    calibration_report = fit_safe_calibration_offset(evaluated) if fit_calibration else None
    now = datetime.now(timezone.utc).isoformat()
    run_doc = {
        "owner_id": user["id"],
        "dataset_id": dataset_id,
        "dataset_name": ds["name"],
        "split": split_name,
        "provider": provider_name,
        "calibration_offset_used": calibration_offset,
        "calibration_recommendation": calibration_report,
        "summary": summary,
        "items": evaluated,
        "created_at": now,
    }
    res = runs_col.insert_one(run_doc)
    run_doc["_id"] = str(res.inserted_id)
    return run_doc


@router.get("/runs")
async def list_evaluation_runs(user: dict = Depends(get_current_user)):
    docs = list(runs_col.find({"owner_id": user["id"]}).sort("created_at", -1))
    return {"runs": [_ser(d) for d in docs]}
