"""Platform cron endpoints.

Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
"""

import logging
import os
import secrets

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

from lib.arun import sync_from_arun
from lib.db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cron", tags=["cron"])


def _check_auth(authorization: str | None) -> None:
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret or not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not secrets.compare_digest(authorization.split(" ", 1)[1], secret):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _run_sync(run_id: str) -> None:
    try:
        result = await sync_from_arun()
        logger.info("cron sync %s ok: %s bills", run_id, result["bills"])
    except Exception as exc:  # a cron failure must be visible, never silent
        logger.error("cron sync %s failed: %s", run_id, exc)
        await db.sync_runs.insert_one({"error": str(exc), "run_id": run_id, "synced_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)})


@router.post("/sync-arun")
async def cron_sync_arun(
    background: BackgroundTasks,
    payload: dict | None = None,
    authorization: str | None = Header(default=None),
    x_webhook_id: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _check_auth(authorization)
    run_id = x_webhook_id or (payload or {}).get("run_id") or "manual"
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True, "run_id": run_id}
    await db.cron_runs.insert_one({"run_id": run_id, "job": "sync-arun"})
    background.add_task(_run_sync, run_id)
    return {"ok": True, "queued": True, "run_id": run_id}
