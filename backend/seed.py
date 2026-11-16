"""Reset the portal and load REAL data from the Arun Enterprises workflow portal.

Run: cd /app/backend && python seed.py

Creates the Arun Enterprises admin login, then pulls vendors / work orders /
bills from https://vendor-workflow-sys.emergent.host via lib/arun.py.
Each synced vendor signs in with their vendor code as BOTH id and password.
Idempotent: safe to re-run.
"""

import asyncio

from lib.arun import ArunPortalError, sync_from_arun
from lib.auth import hash_password
from lib.db import auth_db, db, ensure_indexes

ADMIN = {
    "id": "u-admin-arun",
    "email": "arunenterprises2023@gmail.com",
    "name": "Arun Enterprises",
    "role": "admin",
    "vendor_id": None,
    "password": "Arun2023@12",
}


async def main():
    # wipe demo/stale rows; keep nothing that did not come from the real portal
    for coll in ("vendors", "users", "work_orders", "bills", "sessions", "sync_runs"):
        await db[coll].delete_many({})
    await ensure_indexes()

    await auth_db.users.insert_one({
        "id": ADMIN["id"],
        "email": ADMIN["email"],
        "name": ADMIN["name"],
        "role": ADMIN["role"],
        "vendor_id": None,
        "password_hash": hash_password(ADMIN["password"]),
    })
    print(f"admin login: {ADMIN['email']} / {ADMIN['password']}")

    try:
        r = await sync_from_arun()
    except ArunPortalError as exc:
        print(f"!! Arun portal sync skipped: {exc}")
        print("   Admin can still sign in and press 'Sync from Workflow Portal'.")
        return

    print(f"synced from Arun portal: {r['vendors']} vendors, "
          f"{r['work_orders']} work orders, {r['bills']} bills")
    for login in r["new_logins"]:
        print(f"  vendor login -> id/password: {login['vendor_code']}  ({login['vendor']})")
    if r["skipped_bills"]:
        print(f"  skipped bills (no matching vendor): {r['skipped_bills']}")


if __name__ == "__main__":
    asyncio.run(main())
