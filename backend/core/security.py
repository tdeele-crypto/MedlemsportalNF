"""Auth primitives: password hashing, JWT encode/decode, request → user dependency,
and a simple Mongo-backed brute-force lockout."""
import os
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt as pyjwt
from bson import ObjectId
from fastapi import HTTPException, Request, Depends

JWT_ALGO = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_access_token(token: str) -> dict:
    """Decode and validate an access token. Raises HTTPException on failure."""
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session udløbet")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Ugyldigt token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Ugyldigt token")
    return payload


# `db` is bound at import time via core.db
def _get_db():
    from .db import db
    return db


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Ikke logget ind")
    payload = decode_access_token(token)
    user = await _get_db().users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="Bruger ikke fundet")
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
    }


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Kun administratorer har adgang")
    return user


async def require_admin_or_editor(user: dict = Depends(get_current_user)) -> dict:
    """Allow both admins and editors. Editors can manage participants
    but cannot create/edit/delete events or view the member list."""
    if user.get("role") not in ("admin", "editor"):
        raise HTTPException(status_code=403, detail="Du har ikke rettigheder til denne handling")
    return user


# ----- Brute-force lockout -----
async def check_lockout(identifier: str):
    db = _get_db()
    rec = await db.login_attempts.find_one({"_id": identifier})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if not locked_until:
        return
    try:
        lu = datetime.fromisoformat(locked_until)
    except Exception:
        return
    if lu > datetime.now(timezone.utc):
        mins = max(1, int((lu - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
        raise HTTPException(
            status_code=429,
            detail=f"For mange mislykkede forsøg. Prøv igen om {mins} min.",
        )


async def record_failed_login(identifier: str):
    db = _get_db()
    now = datetime.now(timezone.utc)
    rec = await db.login_attempts.find_one({"_id": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "last_at": now.isoformat()}
    if count >= MAX_LOGIN_ATTEMPTS:
        update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        update["count"] = 0
    await db.login_attempts.update_one(
        {"_id": identifier}, {"$set": update}, upsert=True
    )


async def clear_failed_login(identifier: str):
    await _get_db().login_attempts.delete_one({"_id": identifier})
