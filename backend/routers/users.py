from fastapi import APIRouter, HTTPException, Depends
from backend.auth import get_current_user, validate_password_strength
from backend.repo.user_repo import create_user, validate_user, get_user_by_email
from backend.repo.audit_repo import log_audit_event, get_user_audit_logs

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/register")
async def register(user: dict):
    email = (user.get("email") or "").strip().lower()
    name = (user.get("name") or "").strip()
    password = user.get("password") or ""
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email address is required")
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    try:
        validate_password_strength(password)
        # Never trust client-supplied role escalation
        user_payload = {
            "name": name,
            "email": email,
            "password": password,
            "role": "teacher",
        }
        user_id = create_user(user_payload)
        return {"message": "User created successfully", "id": user_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(data: dict):
    from backend.auth import create_access_token

    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    if validate_user(email, password):
        user_info = get_user_by_email(email)
        if not user_info:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = str(user_info["_id"])
        token = create_access_token({
            "id": user_id,
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "role": user_info.get("role", "teacher"),
        })
        log_audit_event(
            action="user.login",
            user={"id": user_id, "email": user_info.get("email")},
            resource_type="user",
            resource_id=user_id,
        )
        return {
            "message": "Login successful",
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user_id,
                "name": user_info.get("name"),
                "email": user_info.get("email"),
                "role": user_info.get("role", "teacher"),
            },
        }
    raise HTTPException(status_code=401, detail="Invalid email or password")


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": user}


@router.get("/audit-logs")
async def my_audit_logs(user: dict = Depends(get_current_user)):
    return {"logs": get_user_audit_logs(user["id"])}
