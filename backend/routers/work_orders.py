"""Work orders — READ ONLY.

Work orders are never created here. They are derived from the Arun workflow
portal's bills (workOrderNo / workScope / items) by lib/arun.py.
"""

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import current_user
from lib.db import db
from lib.pdf import work_order_pdf
from models.schemas import WorkOrder

router = APIRouter(prefix="/work-orders", tags=["work-orders"])


@router.get("", response_model=list[WorkOrder])
async def list_work_orders(user=Depends(current_user)):
    q = {} if user.get("role") == "admin" else {"vendor_id": user.get("vendor_id")}
    docs = await db.work_orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [WorkOrder(**d) for d in docs]


@router.get("/{wo_id}", response_model=WorkOrder)
async def get_work_order(wo_id: str, user=Depends(current_user)):
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if user.get("role") != "admin" and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    return WorkOrder(**doc)


@router.get("/{wo_id}/pdf")
async def download_work_order(wo_id: str, user=Depends(current_user)):
    doc = await db.work_orders.find_one({"id": wo_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Work order not found")
    if user.get("role") != "admin" and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    vendor = await db.vendors.find_one({"id": doc["vendor_id"]}, {"_id": 0}) or {}
    pdf = work_order_pdf(doc, vendor)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc["po_number"]}.pdf"'},
    )
