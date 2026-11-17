from fastapi import APIRouter, HTTPException, Depends
from backend.auth import get_current_user
from backend.schemas import RubricCreateRequest, RubricUpdateRequest
from backend.repo.rubric_repo import (
    create_rubric_with_version,
    get_rubrics,
    update_rubric_create_version,
    delete_rubric,
    get_rubric_by_id,
    get_rubric_version,
    list_rubric_versions,
)
from backend.repo.audit_repo import log_audit_event

router = APIRouter(prefix="/rubrics", tags=["Rubrics"])


def _get_owned_rubric(rubric_id: str, user: dict, allow_template: bool = False):
    rubric = get_rubric_by_id(rubric_id)
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")
    is_owner = rubric.get("owner_id") == user["id"] or rubric.get("creator") == user["email"]
    if not is_owner and not (allow_template and rubric.get("is_template")):
        raise HTTPException(status_code=404, detail="Rubric not found")
    return rubric


@router.post("/create")
async def create_rubric_endpoint(payload: RubricCreateRequest, user: dict = Depends(get_current_user)):
    created = create_rubric_with_version(payload.model_dump(), user["id"], user["email"])
    log_audit_event(
        action="rubric.create",
        user=user,
        resource_type="rubric",
        resource_id=created["_id"],
        details={"version": 1, "name": created["name"]},
    )
    return {"message": "Rubric created successfully", "id": created["_id"], "rubric": created}


@router.get("/mine")
async def get_rubrics_endpoint(user: dict = Depends(get_current_user)):
    return get_rubrics(user["email"], user["id"])


@router.get("/get/{rubric_id}")
async def get_rubric_by_id_endpoint(rubric_id: str, user: dict = Depends(get_current_user)):
    return _get_owned_rubric(rubric_id, user, allow_template=True)


@router.get("/{rubric_id}/versions")
async def get_rubric_versions_endpoint(rubric_id: str, user: dict = Depends(get_current_user)):
    _get_owned_rubric(rubric_id, user, allow_template=True)
    return {"rubric_id": rubric_id, "versions": list_rubric_versions(rubric_id)}


@router.get("/{rubric_id}/versions/{version}")
async def get_specific_rubric_version_endpoint(rubric_id: str, version: int, user: dict = Depends(get_current_user)):
    _get_owned_rubric(rubric_id, user, allow_template=True)
    snap = get_rubric_version(rubric_id, version)
    if not snap:
        raise HTTPException(status_code=404, detail="Rubric version not found")
    return snap


@router.post("/{rubric_id}/duplicate")
async def duplicate_rubric_endpoint(rubric_id: str, user: dict = Depends(get_current_user)):
    src = _get_owned_rubric(rubric_id, user, allow_template=True)
    clone_payload = {
        "name": f"{src['name']} (Copy)",
        "subject": src.get("subject", "Other"),
        "topic": src.get("topic", ""),
        "subject_instructions": src.get("subject_instructions", ""),
        "partial_credit_policy": src.get("partial_credit_policy", "proportional"),
        "is_template": False,
        "questions": src.get("questions", []),
        "change_note": f"Duplicated from {src['name']} v{src.get('current_version', 1)}",
    }
    created = create_rubric_with_version(clone_payload, user["id"], user["email"])
    log_audit_event(
        action="rubric.duplicate",
        user=user,
        resource_type="rubric",
        resource_id=created["_id"],
        details={"source_rubric_id": rubric_id},
    )
    return {"message": "Rubric duplicated", "rubric": created}


@router.put("/{rubric_id}")
async def update_rubric_endpoint(rubric_id: str, new_data: RubricUpdateRequest, user: dict = Depends(get_current_user)):
    _get_owned_rubric(rubric_id, user)
    payload = {k: v for k, v in new_data.model_dump().items() if v is not None}
    updated = update_rubric_create_version(rubric_id, payload, user["email"])
    if not updated:
        raise HTTPException(status_code=404, detail="Rubric not found")
    log_audit_event(
        action="rubric.version_created",
        user=user,
        resource_type="rubric",
        resource_id=rubric_id,
        details={"version": updated["current_version"], "change_note": payload.get("change_note")},
    )
    return {"message": "Rubric updated with new version", "rubric": updated}


@router.delete("/{rubric_id}")
async def delete_rubric_endpoint(rubric_id: str, user: dict = Depends(get_current_user)):
    _get_owned_rubric(rubric_id, user)
    if delete_rubric(rubric_id):
        log_audit_event(action="rubric.delete", user=user, resource_type="rubric", resource_id=rubric_id)
        return {"message": "Rubric deleted"}
    raise HTTPException(status_code=404, detail="Rubric not found")
