"""Self-healing login bootstrap — runs on every boot (preview AND production).

Logins live in their own database (AUTH_DB_NAME). A fresh deployment starts with
an empty auth database, so nobody could sign in until someone ran
`migrate_auth_db.py` by hand. This module does the same work idempotently at
startup:

1. copies any login still sitting in the app database into the auth database,
2. makes sure the owner account (ARUN_PORTAL_IDENTIFIER) exists as SuperAdmin,
   using ARUN_PORTAL_PASSWORD as its password when it has to be created.

Nothing is ever overwritten: an existing login keeps its password and role.
"""

import logging
import os

from lib.auth import hash_password
from lib.db import auth_db, db

logger = logging.getLogger(__name__)

OWNER_ID = "u-admin-arun"


async def _resolve_auth_db() -> str:
    """Fall back to the main database when the auth database is not reachable.

    Managed production Mongo often authorizes a single provisioned database, so
    reading `arun_vendor_auth` raises 'not authorized'. In that case every login
    already lives in the main database — point `auth_db` there instead of
    crashing the whole backend.
    """
    try:
        await auth_db.users.count_documents({})
        return auth_db.name
    except Exception as exc:
        logger.error("auth database %s unusable (%s) — using %s", auth_db.name, exc, db.name)
        auth_db.use(db)
        return db.name


async def _copy_logins() -> int:
    """Move logins that still sit in the app database into the auth database."""
    copied = 0
    try:
        for doc in await db.users.find({}, {"_id": 0}).to_list(2000):
            if await auth_db.users.find_one({"id": doc["id"]}):
                continue
            doc.setdefault("mobile", "")
            doc.setdefault("permissions", ["view"])
            await auth_db.users.insert_one(doc)
            copied += 1
    except Exception as exc:  # never block boot
        logger.error("ensure_logins(copy): %s", exc)
    return copied


async def ensure_logins() -> dict:
    await _resolve_auth_db()
    # when auth and app share one database there is nothing to copy
    copied = 0 if auth_db.name == db.name else await _copy_logins()

    owner_email = os.environ.get("ARUN_PORTAL_IDENTIFIER", "").strip().lower()
    owner_created = False
    try:
        if owner_email:
            owner = await auth_db.users.find_one({"email": owner_email}, {"_id": 0})
            if owner:
                if owner.get("role") != "superadmin":
                    await auth_db.users.update_one(
                        {"id": owner["id"]},
                        {"$set": {"role": "superadmin", "permissions": ["view", "edit", "approve"]}},
                    )
            else:
                password = os.environ.get("ARUN_PORTAL_PASSWORD", "").strip()
                if password:
                    await auth_db.users.insert_one({
                        "id": OWNER_ID,
                        "email": owner_email,
                        "name": "Arun Enterprises",
                        "mobile": "",
                        "role": "superadmin",
                        "permissions": ["view", "edit", "approve"],
                        "vendor_id": None,
                        "vendor_ids": [],
                        "password_hash": hash_password(password),
                        "source": "local",
                    })
                    owner_created = True
    except Exception as exc:
        logger.error("ensure_logins(owner): %s", exc)

    total = await auth_db.users.count_documents({})
    logger.info(
        "ensure_logins: copied=%s owner_created=%s auth_users=%s", copied, owner_created, total
    )
    return {"copied": copied, "owner_created": owner_created, "auth_users": total}
