"""Portal user (login) management — the ONLY records this portal creates itself.

Vendor / work-order / bill data is never created here: it is fetched from the
Arun workflow portal via lib/arun.py.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import admin_user, hash_password, staff_user, superadmin_user
from lib.db import auth_db, db
from models.schemas import (
    PasswordReset,
    PortalUserCreate,
    RoleUpdate,
    UserRow,
    VendorScopeUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])

# admin = may change anything · staff = non-admin, sees everything read-only · vendor = own data
# superadmin = admin + may create/remove portal users and decide their role & permissions
ROLES = ("superadmin", "admin", "staff", "vendor")
PERMISSIONS = ("view", "edit", "approve")

# the ERP is case-loose about role names — accept every spelling the user types
ROLE_ALIASES = {
    "superadmin": "superadmin", "super_admin": "superadmin", "super admin": "superadmin",
    "supradmin": "superadmin", "sadmin": "superadmin",
    "admin": "admin", "administrator": "admin",
    "staff": "staff", "viewer": "staff",
    "vendor": "vendor",
}


ROLE_LABELS = {
    "superadmin": "SuperAdmin",
    "admin": "Admin",
    "staff": "Staff (view only)",
    "vendor": "Vendor",
}

# what a role may do unless the SuperAdmin narrows it down
DEFAULT_PERMISSIONS = {
    "superadmin": ["view", "edit", "approve"],
    "admin": ["view", "edit", "approve"],
    "staff": ["view"],
    "vendor": ["view"],
}


def normalize_role(value: str) -> str | None:
    """'SuperAdmin', 'SUPRADMIN', 'Super Admin' -> 'superadmin'. None when unknown."""
    return ROLE_ALIASES.get(str(value or "").strip().lower().replace("-", "_"))


async def _clean_scope(vendor_ids: list[str]) -> list[str]:
    """Keep only ids that really exist as vendors; 404 on anything unknown."""
    ids = [str(v).strip() for v in (vendor_ids or []) if str(v).strip()]
    if not ids:
        return []
    rows = await db.vendors.find({"id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(500)
    found = {r["id"] for r in rows}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(status_code=404, detail="Some selected vendors no longer exist")
    return list(dict.fromkeys(ids))


async def _row(user: dict) -> UserRow:
    vendor = None
    if user.get("vendor_id"):
        vendor = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    scope_ids = [v for v in (user.get("vendor_ids") or []) if v]
    scope_labels: list[str] = []
    if scope_ids:
        rows = await db.vendors.find(
            {"id": {"$in": scope_ids}}, {"_id": 0, "code": 1, "company_name": 1}
        ).to_list(500)
        scope_labels = [f"{r.get('code', '')} · {r.get('company_name', '')}".strip(" ·") for r in rows]
    return UserRow(
        vendor_ids=scope_ids,
        vendor_scope_labels=scope_labels,
        id=user["id"],
        email=user.get("email", ""),
        name=user.get("name", ""),
        mobile=user.get("mobile", ""),
        role=user.get("role", "vendor"),
        role_label=ROLE_LABELS.get(user.get("role", "vendor"), user.get("role", "vendor")),
        permissions=user.get("permissions") or DEFAULT_PERMISSIONS.get(user.get("role", "vendor"), ["view"]),
        vendor_id=user.get("vendor_id"),
        vendor_code=(vendor or {}).get("code", ""),
        vendor_name=(vendor or {}).get("company_name", ""),
        source=user.get("source", "local"),
    )


@router.get("", response_model=list[UserRow])
async def list_users(user=Depends(staff_user)):
    docs = await auth_db.users.find({}, {"_id": 0}).sort("role", 1).to_list(500)
    return [await _row(d) for d in docs]


@router.post("", response_model=UserRow)
async def create_user(payload: PortalUserCreate, user=Depends(superadmin_user)):
    """SuperAdmin only: create a login and decide its role + permissions."""
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if await auth_db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    role = normalize_role(payload.role)
    if role is None:
        raise HTTPException(status_code=400, detail="Role must be SuperAdmin, Admin, Staff or Vendor")
    bad = [p for p in payload.permissions if p not in PERMISSIONS]
    if bad:
        raise HTTPException(status_code=400, detail=f"Unknown permission: {', '.join(bad)}")
    if payload.confirm_password is not None and (payload.password or "") != payload.confirm_password:
        raise HTTPException(status_code=400, detail="Password and confirm password do not match")

    vendor_id = None
    password = (payload.password or "").strip()

    if role == "vendor":
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
        if await auth_db.users.find_one({"vendor_id": vendor["id"]}):
            raise HTTPException(
                status_code=400, detail=f"A login already exists for vendor {vendor['code']}"
            )
        vendor_id = vendor["id"]
        # convention: vendor code is BOTH the login id and the password
        password = password or vendor["code"]
    elif not password:
        raise HTTPException(status_code=400, detail="Password is required for this role")

    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name.strip() or email,
        "mobile": (payload.mobile or "").strip(),
        "role": role,
        "permissions": payload.permissions or DEFAULT_PERMISSIONS[role],
        "vendor_id": vendor_id,
        # staff scope: only meaningful for a staff login; empty list = every vendor
        "vendor_ids": await _clean_scope(payload.vendor_ids) if role == "staff" else [],
        "password_hash": hash_password(password),
        "source": "local",
    }
    await auth_db.users.insert_one(dict(doc))
    return await _row(doc)


@router.patch("/{user_id}/role", response_model=UserRow)
async def change_role(user_id: str, payload: RoleUpdate, user=Depends(superadmin_user)):
    """SuperAdmin only: move a portal user between SuperAdmin / Admin / Staff / Vendor."""
    role = normalize_role(payload.role)
    if role is None:
        raise HTTPException(status_code=400, detail="Role must be SuperAdmin, Admin, Staff or Vendor")
    if payload.permissions is not None:
        bad = [p for p in payload.permissions if p not in PERMISSIONS]
        if bad:
            raise HTTPException(status_code=400, detail=f"Unknown permission: {', '.join(bad)}")
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    target = await auth_db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if role == "vendor" and not target.get("vendor_id"):
        raise HTTPException(
            status_code=400,
            detail="This login is not linked to a vendor, so it cannot become a vendor user",
        )
    update = {"role": role, "permissions": payload.permissions or DEFAULT_PERMISSIONS[role]}
    if role != "staff":
        update["vendor_ids"] = []  # scope only applies to staff logins
    await auth_db.users.update_one({"id": user_id}, {"$set": update})
    await auth_db.sessions.delete_many({"user_id": user_id})  # the new role must apply immediately
    target.update(update)
    return await _row(target)


@router.patch("/{user_id}/vendor-scope", response_model=UserRow)
async def change_vendor_scope(
    user_id: str, payload: VendorScopeUpdate, user=Depends(superadmin_user)
):
    """SuperAdmin only: limit a staff login to chosen vendors (empty list = all vendors)."""
    target = await auth_db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != "staff":
        raise HTTPException(
            status_code=400, detail="Vendor scope applies to staff logins only"
        )
    ids = await _clean_scope(payload.vendor_ids)
    await auth_db.users.update_one({"id": user_id}, {"$set": {"vendor_ids": ids}})
    target["vendor_ids"] = ids
    return await _row(target)


@router.patch("/{user_id}/password", response_model=UserRow)
async def reset_password(user_id: str, payload: PasswordReset, user=Depends(admin_user)):
    target = await auth_db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not payload.password.strip():
        raise HTTPException(status_code=400, detail="Password cannot be empty")
    await auth_db.users.update_one(
        {"id": user_id}, {"$set": {"password_hash": hash_password(payload.password.strip())}}
    )
    await auth_db.sessions.delete_many({"user_id": user_id})  # force a fresh sign-in
    return await _row(target)


@router.delete("/{user_id}")
async def delete_user(user_id: str, user=Depends(admin_user)):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target = await auth_db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await auth_db.users.delete_one({"id": user_id})
    await auth_db.sessions.delete_many({"user_id": user_id})
    return {"ok": True}
