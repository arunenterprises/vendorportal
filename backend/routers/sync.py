from fastapi import APIRouter, Depends, HTTPException

from lib.arun import ArunPortalError, sync_from_arun
from lib.auth import admin_user, current_user
from lib.db import db

router = APIRouter(prefix="/sync", tags=["sync"])


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
