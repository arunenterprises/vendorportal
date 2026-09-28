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
from lib.db import db
from models.schemas import LoginRequest, PasswordChange, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


async def _resolve_user(identifier: str):
    """A vendor may sign in with their vendor code; an admin with their email."""
    ident = identifier.strip()
    if not ident:
        return None

    user = await db.users.find_one({"email": ident.lower()})
    if user:
        return user

    # vendor code (case-insensitive exact match) -> that vendor's portal user
    vendor = await db.vendors.find_one(
        {"code": {"$regex": f"^{re.escape(ident)}$", "$options": "i"}}, {"_id": 0}
    )
    if vendor:
        return await db.users.find_one({"vendor_id": vendor["id"]})
    return None


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
    return UserOut(**{k: user.get(k) for k in ("id", "email", "name", "role", "vendor_id")})


@router.get("/me", response_model=UserOut)
async def me(user=Depends(current_user)):
    return UserOut(**{k: user.get(k) for k in ("id", "email", "name", "role", "vendor_id")})


@router.post("/change-password")
async def change_password(payload: PasswordChange, user=Depends(current_user)):
    if not verify_password(payload.current_password, user.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new = payload.new_password.strip()
    if len(new) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"password_hash": hash_password(new)}}
    )
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response, vp_session: str | None = Cookie(default=None)):
    if vp_session:
        await destroy_session(vp_session)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
