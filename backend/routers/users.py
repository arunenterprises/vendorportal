"""Portal user (login) management — the ONLY records this portal creates itself.

Vendor / work-order / bill data is never created here: it is fetched from the
Arun workflow portal via lib/arun.py.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_user, hash_password
from lib.db import db
from models.schemas import PasswordReset, PortalUserCreate, UserRow

router = APIRouter(prefix="/users", tags=["users"])


async def _row(user: dict) -> UserRow:
    vendor = None
    if user.get("vendor_id"):
        vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    return UserRow(
        id=user["id"],
        email=user.get("email", ""),
        name=user.get("name", ""),
        role=user.get("role", "vendor"),
        vendor_id=user.get("vendor_id"),
        vendor_code=(vendor or {}).get("code", ""),
        vendor_name=(vendor or {}).get("company_name", ""),
        source=user.get("source", "local"),
    )


@router.get("", response_model=list[UserRow])
async def list_users(user=Depends(admin_user)):
    docs = await db.users.find({}, {"_id": 0}).sort("role", 1).to_list(500)
    return [await _row(d) for d in docs]


@router.post("", response_model=UserRow)
async def create_user(payload: PortalUserCreate, user=Depends(admin_user)):
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    if payload.role not in ("admin", "vendor"):
        raise HTTPException(status_code=400, detail="Role must be admin or vendor")

    vendor_id = None
    password = (payload.password or "").strip()

    if payload.role == "vendor":
        code = (payload.vendor_code or "").strip()
        if not code:
            raise HTTPException(status_code=400, detail="Vendor code is required for a vendor user")
        vendor = await db.vendors.find_one(
            {"code": {"$regex": f"^{code}$", "$options": "i"}}, {"_id": 0}
        )
        if not vendor:
            raise HTTPException(
                status_code=404,
                detail=f"Vendor code '{code}' not found. Press 'Sync from Workflow Portal' first.",
            )
        if await db.users.find_one({"vendor_id": vendor["id"]}):
            raise HTTPException(
                status_code=400, detail=f"A login already exists for vendor {vendor['code']}"
            )
        vendor_id = vendor["id"]
        # convention: vendor code is BOTH the login id and the password
        password = password or vendor["code"]
    elif not password:
        raise HTTPException(status_code=400, detail="Password is required for an admin user")

    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name.strip() or email,
        "role": payload.role,
        "vendor_id": vendor_id,
        "password_hash": hash_password(password),
        "source": "local",
    }
    await db.users.insert_one(dict(doc))
    return await _row(doc)


@router.patch("/{user_id}/password", response_model=UserRow)
async def reset_password(user_id: str, payload: PasswordReset, user=Depends(admin_user)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty")
    await db.users.update_one(
        {"id": user_id}, {"$set": {"password_hash": hash_password(payload.password.strip())}}
    )
    await db.sessions.delete_many({"user_id": user_id})  # force a fresh sign-in
    return await _row(target)


@router.delete("/{user_id}")
async def delete_user(user_id: str, user=Depends(admin_user)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await db.sessions.delete_many({"user_id": user_id})
    return {"ok": True}
