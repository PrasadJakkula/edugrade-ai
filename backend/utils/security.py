import os
import re
import uuid
import unicodedata
from pathlib import Path
try:
    from fastapi import HTTPException
except ImportError:
    class HTTPException(ValueError):  # type: ignore
        def __init__(self, status_code: int = 400, detail: str = "Validation error"):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # 15 MB
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".json"}


def sanitize_filename(filename: str) -> str:
    if not filename:
        return f"upload_{uuid.uuid4().hex[:8]}"
    base = os.path.basename(filename)
    normalized = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", normalized).strip("._")
    return cleaned[:120] or f"upload_{uuid.uuid4().hex[:8]}"


def validate_upload(filename: str, content: bytes, allowed_exts=None) -> str:
    allowed = allowed_exts or ALLOWED_EXTENSIONS
    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension '{ext}'. Allowed: {', '.join(sorted(allowed))}",
        )
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds 15 MB size limit")
    if ext == ".pdf" and not content.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Invalid PDF file header")
    return safe_name


def safe_temp_path(base_dir: str, filename: str) -> str:
    os.makedirs(base_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}_{sanitize_filename(filename)}"
    target = os.path.abspath(os.path.join(base_dir, safe_name))
    root = os.path.abspath(base_dir)
    if not target.startswith(root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return target


def strip_prompt_injection_delimiters(text: str) -> str:
    if not text:
        return ""
    # Neutralize attempts to close our XML/tag boundary around student submissions
    return text.replace("</student_answer>", "[/student_answer]").replace("<student_answer>", "[student_answer]")
