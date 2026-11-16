import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response

from lib.auth import (
    COOKIE_NAME,
    SESSION_DAYS,
    create_session,
    current_user,
    destroy_session,
    hash_password,
    verify_password,
)
from lib.db import auth_db, db
from routers.users import DEFAULT_PERMISSIONS, ROLE_LABELS
from models.schemas import LoginRequest, PasswordChange, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _resolve_user(identifier: str):
    """A vendor may sign in with their vendor code; an admin with their email."""
    ident = identifier.strip()
    if not ident:
        return None

    user = await auth_db.users.find_one({"email": ident.lower()})
    if user:
        return user

    # vendor code (case-insensitive exact match) -> that vendor's portal user
    vendor = await db.vendors.find_one(
        {"code": {"$regex": f"^{re.escape(ident)}$", "$options": "i"}}, {"_id": 0}
    )
    if vendor:
        return await auth_db.users.find_one({"vendor_id": vendor["id"]})
    return None


def _user_out(user: dict) -> UserOut:
    """Signed-in identity, including the role label + permissions the UI shows."""
    role = user.get("role", "vendor")
    return UserOut(
        id=user["id"],
        email=user.get("email", ""),
        name=user.get("name", ""),
        mobile=user.get("mobile", ""),
        role=role,
        role_label=ROLE_LABELS.get(role, role),
        permissions=user.get("permissions") or DEFAULT_PERMISSIONS.get(role, ["view"]),
        vendor_id=user.get("vendor_id"),
    )


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response):
    user = await _resolve_user(payload.who())
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid vendor code / email or password")
    token = await create_session(user["id"])
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, samesite="lax",
        max_age=SESSION_DAYS * 86400, path="/",
    )
    return _user_out(user)


@router.get("/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return _user_out(user)


@router.post("/change-password")
async def change_password(payload: PasswordChange, user=Depends(current_user)):
    if not verify_password(payload.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new = payload.new_password.strip()
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await auth_db.users.update_one(
        {"id": user["id"]}, {"$set": {"password_hash": hash_password(new)}}
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response, vp_session: str | None = Cookie(default=None)):
    if vp_session:
        await destroy_session(vp_session)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
