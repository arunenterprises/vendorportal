"""Session auth: httpOnly cookie -> sessions collection -> user document."""

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, HTTPException

from lib.db import auth_db, db

COOKIE_NAME = "vp_session"
SESSION_DAYS = 14


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


async def create_session(user_id: str) -> str:
    token = str(uuid.uuid4())
    await auth_db.sessions.insert_one(
        {
            "token": token,
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc),
            "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        }
    )
    return token


async def destroy_session(token: str) -> None:
    await auth_db.sessions.delete_one({"token": token})


async def current_user(vp_session: str | None = Cookie(default=None)):
    if not vp_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sess = await auth_db.sessions.find_one({"token": vp_session})
    if not sess:
        raise HTTPException(status_code=401, detail="Session expired")
    user = await auth_db.users.find_one({"id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def admin_user(user=None, vp_session: str | None = Cookie(default=None)):
    """Only a role that may CHANGE things in this portal."""
    user = await current_user(vp_session)
    if user.get("role") not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def superadmin_user(user=None, vp_session: str | None = Cookie(default=None)):
    """SuperAdmin only: portal users, their roles and their permissions."""
    user = await current_user(vp_session)
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return user


async def staff_user(user=None, vp_session: str | None = Cookie(default=None)):
    """Admin or staff: sees every vendor's data, but staff may not change anything."""
    user = await current_user(vp_session)
    if user.get("role") not in ("superadmin", "admin", "staff"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


def sees_all(user: dict) -> bool:
    """Roles whose reads are NOT scoped to a single vendor."""
    return user.get("role") in ("superadmin", "admin", "staff")


def allowed_vendor_ids(user: dict) -> list[str] | None:
    """Vendor ids this login may read. None = every vendor (no restriction).

    A SuperAdmin may limit a Staff login to chosen vendors (`vendor_ids`);
    an empty/absent list keeps the old behaviour of seeing all vendors.
    """
    if user.get("role") == "staff":
        ids = [v for v in (user.get("vendor_ids") or []) if v]
        return ids or None
    if sees_all(user):
        return None
    return [user.get("vendor_id")]


def scope_filter(user: dict, field: str = "vendor_id") -> dict:
    """Mongo filter restricting reads to the vendors this login may see."""
    ids = allowed_vendor_ids(user)
    if ids is None:
        return {}
    return {field: {"$in": ids}}


def can_see_vendor(user: dict, vendor_id: str | None) -> bool:
    ids = allowed_vendor_ids(user)
    return ids is None or vendor_id in ids


async def allowed_vendor_codes(user: dict) -> list[str] | None:
    """Same restriction expressed as vendor codes (payment vouchers key on code)."""
    ids = allowed_vendor_ids(user)
    if ids is None:
        return None
    rows = await db.vendors.find({"id": {"$in": ids}}, {"_id": 0, "code": 1}).to_list(500)
    return [r.get("code", "") for r in rows] or ["__none__"]
