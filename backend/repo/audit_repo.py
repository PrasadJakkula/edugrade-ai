from datetime import datetime, timezone
from typing import Dict, Any, Optional
from backend.database import db

audit_col = db["audit_logs"]


def log_audit_event(
    *,
    action: str,
    user: Dict[str, Any],
    resource_type: str,
    resource_id: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        audit_col.insert_one(
            {
                "action": action,
                "owner_id": user.get("id"),
                "user_email": user.get("email"),
                "resource_type": resource_type,
                "resource_id": resource_id,
                "details": details or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        # Audit log failure should never crash primary request unless strict mode
        pass


def get_user_audit_logs(owner_id: str, limit: int = 100) -> list:
    docs = list(audit_col.find({"owner_id": owner_id}).sort("timestamp", -1).limit(limit))
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs
