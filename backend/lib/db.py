"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# Logins live in their OWN database so ERP-synced data can never disturb them
# (AUTH_DB_NAME, default arun_vendor_auth). `auth_db.users` / `auth_db.sessions`
# are the only source of truth for who may sign in.
auth_db = client[os.environ.get("AUTH_DB_NAME", "arun_vendor_auth")]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "users": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("vendor_id", ASCENDING)], name="vendor_id"),
    ],
    "sync_runs": [IndexModel([("synced_at", DESCENDING)], name="synced_at_desc")],
    "sessions": [
        IndexModel([("token", ASCENDING)], name="token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "vendors": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("company_name", ASCENDING)], name="company_name"),
    ],
    "work_orders": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("vendor_id", ASCENDING), ("created_at", DESCENDING)], name="vendor_created"),
    ],
    "bills": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("vendor_id", ASCENDING), ("created_at", DESCENDING)], name="vendor_created"),
        IndexModel([("status", ASCENDING)], name="status"),
    ],
    "documents": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("vendor_id", ASCENDING), ("uploaded_at", DESCENDING)], name="vendor_uploaded"),
    ],
}


AUTH_INDEXES: dict[str, list[IndexModel]] = {
    "users": INDEXES["users"],
    "sessions": INDEXES["sessions"],
}


async def ensure_indexes() -> None:
    for collection, models in AUTH_INDEXES.items():
        for model in models:
            try:
                await auth_db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(auth.%s.%s): %s", collection, model.document["name"], exc)
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
