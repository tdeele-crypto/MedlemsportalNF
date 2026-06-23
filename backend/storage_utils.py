"""Object storage helper — local filesystem.

Files are stored under UPLOAD_DIR (default: /app/backend/uploads).
For production deployment to your own VPS, set UPLOAD_DIR to a path
OUTSIDE your git repo so uploads aren't committed (e.g. /var/www/medlemsportal/uploads).
"""
import os
import logging
import mimetypes
from pathlib import Path

logger = logging.getLogger(__name__)

# Resolve upload directory. Defaults to ./uploads next to this file.
_default_dir = Path(__file__).parent / "uploads"
UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", str(_default_dir))).resolve()


def init_storage() -> str:
    """Ensure the upload directory exists. Returns the absolute path."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Local storage initialized at %s", UPLOAD_DIR)
    return str(UPLOAD_DIR)


def _safe_path(path: str) -> Path:
    """Resolve `path` inside UPLOAD_DIR; reject traversal attempts."""
    if not path or path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Invalid storage path")
    full = (UPLOAD_DIR / path).resolve()
    # Ensure resolved path stays within UPLOAD_DIR
    try:
        full.relative_to(UPLOAD_DIR)
    except ValueError:
        raise ValueError("Path escapes upload directory")
    return full


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Write bytes to UPLOAD_DIR/path. Returns {'path': path}."""
    init_storage()
    target = _safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": path, "size": len(data), "content_type": content_type}


def get_object(path: str) -> tuple[bytes, str]:
    """Read bytes from UPLOAD_DIR/path. Returns (data, content_type)."""
    target = _safe_path(path)
    if not target.is_file():
        raise FileNotFoundError(f"Object not found: {path}")
    data = target.read_bytes()
    content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    return data, content_type


def delete_object(path: str) -> bool:
    """Delete a stored file. Returns True if deleted."""
    try:
        target = _safe_path(path)
    except ValueError:
        return False
    if target.is_file():
        target.unlink()
        return True
    return False
