"""One-time migration: move logins into their own database (AUTH_DB_NAME).

Copies `users` + `sessions` out of the ERP-synced app database into the dedicated
auth database, backfills role/permissions defaults, and promotes the owner
account to SuperAdmin. Safe to re-run: it never overwrites an existing login.

    python migrate_auth_db.py
"""

import asyncio
import os
import sys

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from lib.db import auth_db, db  # noqa: E402
from routers.users import DEFAULT_PERMISSIONS  # noqa: E402

OWNER_EMAIL = os.environ.get("ARUN_PORTAL_IDENTIFIER", "").strip().lower()


async def main() -> None:
    moved = skipped = 0
    for doc in await db.users.find({}, {"_id": 0}).to_list(2000):
        if await auth_db.users.find_one({"id": doc["id"]}):
            skipped += 1
            continue
        doc.setdefault("mobile", "")
        role = doc.get("role", "vendor")
        doc.setdefault("permissions", DEFAULT_PERMISSIONS.get(role, ["view"]))
        await auth_db.users.insert_one(doc)
        moved += 1
    print(f"users -> auth db: copied {moved}, already present {skipped}")

    if OWNER_EMAIL:
        res = await auth_db.users.update_one(
            {"email": OWNER_EMAIL},
            {"$set": {"role": "superadmin", "permissions": ["view", "edit", "approve"]}},
        )
        print(f"owner {OWNER_EMAIL} -> superadmin: matched {res.matched_count}")
        owner = await auth_db.users.find_one({"email": OWNER_EMAIL}, {"_id": 0, "id": 1})
        if owner:  # only this login signs in again, everyone else keeps their session
            await auth_db.sessions.delete_many({"user_id": owner["id"]})

    print("auth users:", await auth_db.users.count_documents({}))
    print("by role:", {
        r: await auth_db.users.count_documents({"role": r})
        for r in ("superadmin", "admin", "staff", "vendor")
    })


asyncio.run(main())
