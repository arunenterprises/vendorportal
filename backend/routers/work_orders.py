"""Work orders — READ ONLY.

Work orders are never created here. They are derived from the Arun workflow
portal's bills (workOrderNo / workScope / items) by lib/arun.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Response

import base64
from datetime import datetime, timezone
from uuid import uuid4

from lib.auth import admin_user, current_user, sees_all
from lib.db import db
from lib.pdf import work_order_pdf
from models.schemas import (
    BulkVisibility,
    WorkOrder,
    WorkOrderFileUpload,
    WorkOrderStatusUpdate,
    WorkOrderVisibility,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])

MAX_WO_FILE_BYTES = 500 * 1024


async def _decorate(docs: list[dict]) -> list[dict]:
    """Attach bill match (billed / balance) and duplicate-work-order hints."""
    bills = await db.bills.find({}, {"_id": 0, "work_order_id": 1, "total_amount": 1, "invoice_no": 1}).to_list(2000)
    billed: dict[str, dict] = {}
    for b in bills:
        agg = billed.setdefault(b.get("work_order_id") or "", {"amount": 0.0, "count": 0})
        agg["amount"] += float(b.get("total_amount") or 0)
        agg["count"] += 1

    # same vendor + same order value = most likely the same work order entered twice
    groups: dict[tuple, int] = {}
    for d in docs:
        groups[(d.get("vendor_id"), round(float(d.get("value") or 0), 2))] = (
            groups.get((d.get("vendor_id"), round(float(d.get("value") or 0), 2)), 0) + 1
        )

    out = []
    for d in docs:
        agg = billed.get(d["id"], {"amount": 0.0, "count": 0})
        d["billed_amount"] = round(agg["amount"], 2)
        d["bills_count"] = agg["count"]
        d["balance_value"] = round(float(d.get("value") or 0) - agg["amount"], 2)
        d["possible_duplicate"] = groups.get((d.get("vendor_id"), round(float(d.get("value") or 0), 2)), 0) > 1
        out.append(d)
    return out


@router.get("", response_model=list[WorkOrder])
async def list_work_orders(user=Depends(current_user)):
    if sees_all(user):
        q = {}
    else:
        # a work order the admin has taken off-air is hidden from the vendor
        q = {"vendor_id": user.get("vendor_id"), "live": {"$ne": False}}
    docs = await db.work_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [WorkOrder(**d) for d in await _decorate(docs)]


@router.get("/{wo_id}", response_model=WorkOrder)
async def get_work_order(wo_id: str, user=Depends(current_user)):
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not sees_all(user):
        if doc["vendor_id"] != user.get("vendor_id"):
            raise HTTPException(status_code=403, detail="Not allowed")
        if doc.get("live") is False:
            raise HTTPException(status_code=404, detail="Work order not found")
    return WorkOrder(**(await _decorate([doc]))[0])


@router.patch("/visibility/bulk")
async def bulk_visibility(payload: BulkVisibility, user=Depends(admin_user)):
    """Admin-only: live / off-air every work order of one vendor in one click."""
    res = await db.work_orders.update_many(
        {"vendor_id": payload.vendor_id},
        {"$set": {
            "live": payload.live,
            "live_updated_at": datetime.now(timezone.utc),
            "live_updated_by": user.get("name") or user.get("email"),
        }},
    )
    return {"ok": True, "updated": res.modified_count, "live": payload.live}


@router.patch("/{wo_id}/visibility", response_model=WorkOrder)
async def update_visibility(wo_id: str, payload: WorkOrderVisibility, user=Depends(admin_user)):
    """Admin-only: put a work order live for the vendor, or take it off-air."""
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "live": payload.live,
            "live_updated_at": datetime.now(timezone.utc),
            "live_updated_by": user.get("name") or user.get("email"),
        }},
    )
    fresh = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    return WorkOrder(**fresh)


@router.patch("/{wo_id}/status", response_model=WorkOrder)
async def update_status(wo_id: str, payload: WorkOrderStatusUpdate, user=Depends(admin_user)):
    """Admin-only manual status override; the vendor sees it immediately."""
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if payload.status not in ("active", "completed", "on_hold"):
        raise HTTPException(status_code=400, detail="Status must be active, completed or on_hold")
    before = doc.get("status", "")
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "status": payload.status,
            "status_overridden": True,
            "status_updated_at": datetime.now(timezone.utc),
            "status_updated_by": user.get("name") or user.get("email"),
        }},
    )
    if before != payload.status:
        await db.bill_changes.insert_one({
            "id": str(uuid4()),
            "vendor_id": doc["vendor_id"],
            "bill_id": doc["id"],
            "invoice_no": doc["po_number"],
            "field": "work_order_status",
            "label": "Work order status",
            "from_value": before,
            "to_value": payload.status,
            "changed_at": datetime.now(timezone.utc),
        })
    fresh = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    return WorkOrder(**fresh)


@router.post("/{wo_id}/po-file", response_model=WorkOrder)
async def upload_po_file(wo_id: str, payload: WorkOrderFileUpload, user=Depends(admin_user)):
    """Admin-only: upload the original work order copy (max 500 KB)."""
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0, "id": 1})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    raw = payload.data_base64.split(",", 1)[-1]
    try:
        blob = base64.b64decode(raw, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="File could not be read")
    if len(blob) > MAX_WO_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File larger than 500 KB")
    if not blob:
        raise HTTPException(status_code=400, detail="File is empty")
    await db.work_orders.update_one(
        {"id": wo_id},
        {"$set": {
            "po_file_base64": base64.b64encode(blob).decode(),
            "po_file_name": payload.name.strip() or f"{wo_id}.pdf",
            "po_file_type": payload.content_type or "application/pdf",
            "has_po_file": True,
            "po_file_uploaded_by": user.get("name") or user.get("email"),
            "po_file_uploaded_at": datetime.now(timezone.utc),
        }},
    )
    fresh = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    return WorkOrder(**(await _decorate([fresh]))[0])


@router.get("/{wo_id}/po-file")
async def download_po_file(wo_id: str, user=Depends(current_user)):
    """The original Purchase Order PDF uploaded on the workflow portal."""
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not sees_all(user) and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    raw = doc.get("po_file_base64") or ""
    if not raw:
        raise HTTPException(status_code=404, detail="No purchase order file on the workflow portal")
    name = doc.get("po_file_name") or f"{doc['po_number']}.pdf"
    return Response(
        content=base64.b64decode(raw),
        media_type=doc.get("po_file_type", "application/pdf"),
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/{wo_id}/pdf")
async def download_work_order(wo_id: str, user=Depends(current_user)):
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not sees_all(user) and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    vendor = await db.vendors.find_one({"id": doc["vendor_id"]}, {"_id": 0}) or {}
    pdf = work_order_pdf(doc, vendor)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc["po_number"]}.pdf"'},
    )
