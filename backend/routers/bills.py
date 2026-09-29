"""Bills / invoices and payment status — READ ONLY.

Invoices, their GST/TDS figures and their payment status all come from the Arun
workflow portal (primary key: permanentBillNo) via lib/arun.py. This portal
never creates or edits them.
"""

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.auth import current_user
from lib.db import db
from lib.pdf import invoice_pdf
from models.schemas import Bill

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
