"""Bills / invoices and payment status — READ ONLY.

Invoices, their GST/TDS figures and their payment status all come from the Arun
workflow portal (primary key: permanentBillNo) via lib/arun.py. This portal
never creates or edits them.
"""

from fastapi import APIRouter, Depends, HTTPException, Response

from datetime import datetime, timezone
from uuid import uuid4

from lib.auth import admin_user, current_user
from lib.dates import today_iso
from lib.db import db
from lib.pdf import invoice_pdf
from models.schemas import Bill, BillPaymentUpdate

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=list[Bill])
async def list_bills(user=Depends(current_user)):
    q = {} if user.get("role") == "admin" else {"vendor_id": user.get("vendor_id")}
    docs = await db.bills.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Bill(**d) for d in docs]


@router.get("/changes")
async def bill_changes(user=Depends(current_user)):
    """What changed on the workflow portal recently — newest first."""
    q = {} if user.get("role") == "admin" else {"vendor_id": user.get("vendor_id")}
    rows = await db.bill_changes.find(q, {"_id": 0}).sort("changed_at", -1).to_list(25)
    return rows


@router.patch("/{bill_id}/payment", response_model=Bill)
async def update_payment(bill_id: str, payload: BillPaymentUpdate, user=Depends(admin_user)):
    """Admin-only: set the payment status and UTR of a bill.

    The workflow portal stays the source of truth for the invoice figures; only
    the payment status / UTR can be maintained here and a sync keeps them.
    """
    doc = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    if payload.status not in ("pending", "under_review", "paid", "rejected"):
        raise HTTPException(status_code=400, detail="Status must be pending, under_review, paid or rejected")

    update = {
        "status": payload.status,
        "utr": payload.utr.strip(),
        "payment_updated_by": user.get("name") or user.get("email"),
        "payment_updated_at": datetime.now(timezone.utc),
    }
    if payload.status == "paid":
        update["paid_date"] = payload.paid_date.strip() or doc.get("paid_date") or today_iso("Asia/Kolkata")
    for field, label in (("status", "Payment status"), ("utr", "UTR")):
        if str(doc.get(field) or "") != str(update[field] or ""):
            await db.bill_changes.insert_one({
                "id": str(uuid4()),
                "vendor_id": doc["vendor_id"],
                "bill_id": doc["id"],
                "invoice_no": doc["invoice_no"],
                "field": field,
                "label": label,
                "from_value": str(doc.get(field) or ""),
                "to_value": str(update[field] or ""),
                "changed_at": datetime.now(timezone.utc),
            })
    await db.bills.update_one({"id": bill_id}, {"$set": update})
    fresh = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    return Bill(**fresh)


@router.get("/{bill_id}", response_model=Bill)
async def get_bill(bill_id: str, user=Depends(current_user)):
    doc = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    if user.get("role") != "admin" and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    return Bill(**doc)


@router.get("/{bill_id}/pdf")
async def download_bill(bill_id: str, user=Depends(current_user)):
    doc = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    if user.get("role") != "admin" and doc["vendor_id"] != user.get("vendor_id"):
        raise HTTPException(status_code=403, detail="Not allowed")
    vendor = await db.vendors.find_one({"id": doc["vendor_id"]}, {"_id": 0}) or {}
    pdf = invoice_pdf(doc, vendor)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc["invoice_no"]}.pdf"'},
    )
