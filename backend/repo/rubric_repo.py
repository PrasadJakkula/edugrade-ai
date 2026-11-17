import uuid
from datetime import datetime, timezone
from bson import ObjectId
from backend.database import db

rubrics_col = db["rubrics"]
versions_col = db["rubric_versions"]


def _normalize_questions(questions: list) -> list:
    normalized = []
    for q_idx, q in enumerate(questions, start=1):
        q_copy = dict(q)
        q_copy["question_id"] = q_copy.get("question_id") or f"q_{q_idx}_{uuid.uuid4().hex[:6]}"
        crits = []
        total_pts = 0.0
        for c_idx, c in enumerate(q_copy.get("criteria", []), start=1):
            c_copy = dict(c)
            c_copy["criterion_id"] = c_copy.get("criterion_id") or f"c_{q_idx}_{c_idx}_{uuid.uuid4().hex[:6]}"
            c_copy["points"] = float(c_copy.get("points") or 0)
            total_pts += c_copy["points"]
            crits.append(c_copy)
        q_copy["criteria"] = crits
        q_copy["max_marks"] = float(q_copy.get("max_marks") or total_pts)
        normalized.append(q_copy)
    return normalized


def create_rubric_with_version(rubric_data: dict, owner_id: str, owner_email: str) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    questions = _normalize_questions(rubric_data.get("questions", []))
    doc = {
        "name": rubric_data["name"],
        "subject": rubric_data.get("subject", "Other"),
        "topic": rubric_data.get("topic", ""),
        "subject_instructions": rubric_data.get("subject_instructions", ""),
        "partial_credit_policy": rubric_data.get("partial_credit_policy", "proportional"),
        "is_template": bool(rubric_data.get("is_template", False)),
        "questions": questions,
        "owner_id": owner_id,
        "creator": owner_email,
        "current_version": 1,
        "created_at": now,
        "updated_at": now,
    }
    res = rubrics_col.insert_one(doc)
    rubric_id = str(res.inserted_id)

    version_doc = {
        "rubric_id": rubric_id,
        "version": 1,
        "name": doc["name"],
        "subject": doc["subject"],
        "topic": doc["topic"],
        "subject_instructions": doc["subject_instructions"],
        "partial_credit_policy": doc["partial_credit_policy"],
        "questions": questions,
        "change_note": rubric_data.get("change_note", "Initial rubric version"),
        "created_by": owner_email,
        "created_at": now,
    }
    versions_col.insert_one(version_doc)
    doc["_id"] = rubric_id
    return doc


def create_rubric(rubric_json: dict) -> str:
    # Backward-compatible helper
    res = rubrics_col.insert_one(rubric_json)
    return str(res.inserted_id)


def get_rubrics(owner_email: str, owner_id: str | None = None) -> list:
    query = {"$or": [{"creator": owner_email}, {"is_template": True}]}
    if owner_id:
        query = {"$or": [{"owner_id": owner_id}, {"creator": owner_email}, {"is_template": True}]}
    docs = list(rubrics_col.find(query).sort("updated_at", -1))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


def get_rubric_by_id(rubric_id: str) -> dict | None:
    try:
        oid = ObjectId(rubric_id)
    except Exception:
        return None
    doc = rubrics_col.find_one({"_id": oid})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


def get_rubric_version(rubric_id: str, version: int | None = None) -> dict | None:
    if version is None:
        doc = versions_col.find_one({"rubric_id": rubric_id}, sort=[("version", -1)])
    else:
        doc = versions_col.find_one({"rubric_id": rubric_id, "version": int(version)})
    if doc:
        doc["_id"] = str(doc["_id"])
    return doc


def list_rubric_versions(rubric_id: str) -> list:
    docs = list(versions_col.find({"rubric_id": rubric_id}).sort("version", -1))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


def update_rubric_create_version(rubric_id: str, new_data: dict, editor_email: str) -> dict | None:
    current = get_rubric_by_id(rubric_id)
    if not current:
        return None
    now = datetime.now(timezone.utc).isoformat()
    next_version = int(current.get("current_version", 1)) + 1
    questions = _normalize_questions(new_data.get("questions") or current.get("questions", []))

    updated_fields = {
        "name": new_data.get("name", current["name"]),
        "subject": new_data.get("subject", current.get("subject", "Other")),
        "topic": new_data.get("topic", current.get("topic", "")),
        "subject_instructions": new_data.get("subject_instructions", current.get("subject_instructions", "")),
        "partial_credit_policy": new_data.get("partial_credit_policy", current.get("partial_credit_policy", "proportional")),
        "is_template": new_data.get("is_template", current.get("is_template", False)),
        "questions": questions,
        "current_version": next_version,
        "updated_at": now,
    }
    rubrics_col.update_one({"_id": ObjectId(rubric_id)}, {"$set": updated_fields})

    version_doc = {
        "rubric_id": rubric_id,
        "version": next_version,
        "name": updated_fields["name"],
        "subject": updated_fields["subject"],
        "topic": updated_fields["topic"],
        "subject_instructions": updated_fields["subject_instructions"],
        "partial_credit_policy": updated_fields["partial_credit_policy"],
        "questions": questions,
        "change_note": new_data.get("change_note", f"Updated to v{next_version}"),
        "created_by": editor_email,
        "created_at": now,
    }
    versions_col.insert_one(version_doc)
    return get_rubric_by_id(rubric_id)


def update_rubric(rubric_id: str, new_data: dict) -> bool:
    result = rubrics_col.update_one({"_id": ObjectId(rubric_id)}, {"$set": new_data})
    return result.modified_count > 0


def delete_rubric(rubric_id: str) -> bool:
    try:
        oid = ObjectId(rubric_id)
    except Exception:
        return False
    result = rubrics_col.delete_one({"_id": oid})
    return result.deleted_count > 0
