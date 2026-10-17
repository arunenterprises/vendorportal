import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from lib.arun import ArunPortalError, sync_from_arun
from lib.auth import admin_user, current_user
from lib.db import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sync", tags=["sync"])

# Auto sync: the workflow portal is the source of truth, so the portal re-pulls it
# whenever someone opens a page — but at most once every AUTO_SYNC_MIN_GAP.
AUTO_SYNC_MIN_GAP = timedelta(minutes=3)
_auto_lock = asyncio.Lock()


@router.post("/arun")
async def run_arun_sync(user=Depends(admin_user)):
    """Pull vendors / work orders / bills from the Arun Enterprises workflow portal."""
    try:
        result = await sync_from_arun()
    except ArunPortalError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # network/shape surprises must not 500 silently
        raise HTTPException(status_code=502, detail=f"Arun portal sync failed: {exc}")
    return {
        "vendors": result["vendors"],
        "work_orders": result["work_orders"],
        "purchase_work_orders": result.get("purchase_work_orders", 0),
        "bills": result["bills"],
        "payments": result.get("payments", 0),
        "changes": result.get("changes", 0),
        "removed_work_orders": result.get("removed_work_orders", 0),
        "removed_bills": result.get("removed_bills", 0),
        "new_logins": result["new_logins"],
        "skipped_bills": result["skipped_bills"],
        "duplicate_vendors": result.get("duplicate_vendors", []),
        "synced_at": result["synced_at"],
    }


@router.post("/auto")
async def auto_sync(user=Depends(current_user)):
    """Refresh upstream data on page load (any signed-in user), throttled + single-flight.

    Returns {"synced": bool} so the caller knows whether to refetch its queries.
    """
    if _auto_lock.locked():
        return {"synced": False, "reason": "in_progress"}
    async with _auto_lock:
        last = await db.sync_runs.find_one({"error": {"$exists": False}}, {"_id": 0, "synced_at": 1}, sort=[("synced_at", -1)])
        last_at = last.get("synced_at") if last else None
        if last_at is not None:
            if last_at.tzinfo is None:
                last_at = last_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - last_at < AUTO_SYNC_MIN_GAP:
                return {"synced": False, "reason": "fresh", "last_sync": last_at}
        try:
            result = await sync_from_arun()
        except Exception as exc:  # a stale page must never break on an upstream hiccup
            logger.error("auto sync failed: %s", exc)
            return {"synced": False, "reason": "error", "detail": str(exc)}
        return {
            "synced": True,
            "vendors": result["vendors"],
            "work_orders": result["work_orders"],
            "bills": result["bills"],
            "changes": result.get("changes", 0),
            "synced_at": result["synced_at"],
        }


@router.get("/runs")
async def sync_runs(user=Depends(admin_user)):
    """Last 10 sync runs — counts, skipped bills and new logins."""
    runs = await db.sync_runs.find({}, {"_id": 0}).sort("synced_at", -1).to_list(10)
    return runs


@router.get("/status")
async def sync_status(user=Depends(current_user)):
    """Last sync run + how many records in this portal came from the Arun portal."""
    last = await db.sync_runs.find_one({}, {"_id": 0}, sort=[("synced_at", -1)])
    return {
        "last_sync": last,
        "linked_vendors": await db.vendors.count_documents({"source": "arun_portal"}),
        "linked_work_orders": await db.work_orders.count_documents({"source": "arun_portal"}),
        "linked_bills": await db.bills.count_documents({"source": "arun_portal"}),
    }
