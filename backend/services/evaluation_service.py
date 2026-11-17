import csv
import hashlib
import io
import json
from typing import Dict, Any, List, Tuple

from backend.services.agreement_service import compute_agreement_metrics


def parse_dataset_upload(filename: str, content: bytes) -> List[Dict[str, Any]]:
    """
    Parses CSV or JSON dataset containing:
      question, student_answer, human_score, max_marks, subject, topic, expected_answer, sample_id
    """
    lower = filename.lower()
    rows: List[Dict[str, Any]] = []
    text = content.decode("utf-8", errors="replace")

    if lower.endswith(".json"):
        data = json.loads(text)
        raw_list = data if isinstance(data, list) else data.get("items") or data.get("samples") or []
    elif lower.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(text))
        raw_list = list(reader)
    else:
        raise ValueError("Dataset must be .csv or .json")

    for idx, row in enumerate(raw_list, start=1):
        question = (row.get("question") or "").strip()
        student_answer = (row.get("student_answer") or "").strip()
        if not question or not student_answer:
            continue
        max_marks = float(row.get("max_marks") or 10.0)
        human_score = float(row.get("human_score") or row.get("score") or 0.0)
        rows.append(
            {
                "sample_id": str(row.get("sample_id") or row.get("id") or f"s_{idx}"),
                "subject": (row.get("subject") or "Other").strip(),
                "topic": (row.get("topic") or "").strip(),
                "question": question,
                "expected_answer": (row.get("expected_answer") or "").strip(),
                "student_answer": student_answer,
                "human_score": max(0.0, min(max_marks, human_score)),
                "max_marks": max_marks,
            }
        )

    if len(rows) < 3:
        raise ValueError("Dataset must contain at least 3 valid rows with question and student_answer.")
    return rows


def split_dataset_leakage_safe(
    samples: List[Dict[str, Any]],
    *,
    train_ratio: float = 0.6,
    val_ratio: float = 0.2,
    seed: str = "evaluai-split-v1",
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Deterministic hash-based splitting by normalized (question + student_answer) fingerprint.
    Prevents duplicate or near-identical answers from leaking across train/validation/test splits.
    """
    if train_ratio + val_ratio >= 0.95:
        raise ValueError("Test split must remain strictly non-empty (>= 5%).")

    seen_fingerprints: Dict[str, str] = {}
    train: List[Dict[str, Any]] = []
    validation: List[Dict[str, Any]] = []
    test: List[Dict[str, Any]] = []

    for item in samples:
        fingerprint_src = f"{item['question'].strip().lower()}||{item['student_answer'].strip().lower()}"
        fp = hashlib.sha256(fingerprint_src.encode("utf-8")).hexdigest()

        if fp in seen_fingerprints:
            bucket = seen_fingerprints[fp]
        else:
            digest = hashlib.sha256(f"{seed}:{fp}".encode("utf-8")).hexdigest()
            u = int(digest[:8], 16) / 0xFFFFFFFF
            if u < train_ratio:
                bucket = "train"
            elif u < train_ratio + val_ratio:
                bucket = "validation"
            else:
                bucket = "test"
            seen_fingerprints[fp] = bucket

        item_copy = dict(item)
        item_copy["split"] = bucket
        item_copy["fingerprint"] = fp[:12]
        if bucket == "train":
            train.append(item_copy)
        elif bucket == "validation":
            validation.append(item_copy)
        else:
            test.append(item_copy)

    # Guarantee non-empty test & validation sets when total >= 3
    if not test and len(train) > 1:
        moved = train.pop()
        moved["split"] = "test"
        test.append(moved)
    if not validation and len(train) > 1:
        moved = train.pop()
        moved["split"] = "validation"
        validation.append(moved)

    return {"train": train, "validation": validation, "test": test}


def verify_no_split_leakage(splits: Dict[str, List[Dict[str, Any]]]) -> Tuple[bool, List[str]]:
    fps_by_split = {
        name: {item.get("fingerprint") for item in items if item.get("fingerprint")}
        for name, items in splits.items()
    }
    overlaps: List[str] = []
    names = list(fps_by_split.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            inter = fps_by_split[names[i]] & fps_by_split[names[j]]
            if inter:
                overlaps.append(f"Leakage detected between {names[i]} and {names[j]}: {len(inter)} overlapping sample(s)")
    return (len(overlaps) == 0), overlaps


def fit_safe_calibration_offset(validation_pairs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes a simple additive score bias correction on the validation split ONLY.
    Does NOT modify or fine-tune underlying foundation model weights.
    """
    if len(validation_pairs) < 3:
        return {
            "calibration_offset": 0.0,
            "applied": False,
            "note": "Insufficient validation samples (<3) to compute a reliable calibration offset; offset remains 0.0.",
            "model_fine_tuned": False,
        }
    residuals = [float(p["human_score"]) - float(p["ai_score"]) for p in validation_pairs]
    mean_residual = sum(residuals) / len(residuals)
    # Clamp offset to safe [-1.5, +1.5] marks to prevent overcorrection
    clamped = round(max(-1.5, min(1.5, mean_residual)), 2)
    return {
        "calibration_offset": clamped,
        "applied": abs(clamped) >= 0.1,
        "note": (
            f"Estimated additive post-scoring calibration offset ({clamped:+.2f} marks) from {len(validation_pairs)} validation samples. "
            "Underlying foundation LLM weights are NOT fine-tuned."
        ),
        "model_fine_tuned": False,
    }


def summarize_evaluation_run(
    *,
    evaluated_items: List[Dict[str, Any]],
    override_count: int = 0,
) -> Dict[str, Any]:
    pairs = [
        {
            "ai_score": item["ai_score"],
            "human_score": item["human_score"],
            "max_marks": item["max_marks"],
        }
        for item in evaluated_items
    ]
    agreement = compute_agreement_metrics(pairs)
    n = len(evaluated_items)
    validity_rates = [float(item.get("evidence_validity_rate", 1.0)) for item in evaluated_items]
    warning_count = sum(1 for item in evaluated_items if item.get("reliability_status") != "reliable")

    return {
        "agreement": agreement,
        "evidence_validity": round(sum(validity_rates) / n, 4) if n else None,
        "reliability_warning_rate": round(warning_count / n, 4) if n else None,
        "teacher_override_rate": round(override_count / n, 4) if n else None,
        "model_fine_tuned": False,
    }
