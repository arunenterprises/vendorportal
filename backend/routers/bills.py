"""Bills / invoices and payment status — READ ONLY.

Invoices, their GST/TDS figures and their payment status all come from the Arun
workflow portal (primary key: permanentBillNo) via lib/arun.py. This portal
never creates or edits them.
"""

from fastapi import APIRouter, Depends, HTTPException, Response

from datetime import datetime, timezone
from uuid import uuid4

from lib.auth import (
    admin_user,
    allowed_vendor_codes,
    can_see_vendor,
    current_user,
    scope_filter,
    staff_user,
)
from lib.dates import today_iso
from lib.db import db
from lib.pdf import invoice_pdf, payment_advice_pdf
from models.schemas import Bill, BillPaymentUpdate

router = APIRouter(prefix="/bills", tags=["bills"])


@router.get("", response_model=list[Bill])
async def list_bills(user=Depends(current_user)):
    q = scope_filter(user)
    docs = await db.bills.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Bill(**d) for d in docs]


@router.get("/changes")
async def bill_changes(user=Depends(current_user)):
    """What changed on the workflow portal recently — newest first."""
    q = scope_filter(user)
    rows = await db.bill_changes.find(q, {"_id": 0}).sort("changed_at", -1).to_list(25)
    return rows


@router.get("/payments-register")
async def payments_register(user=Depends(current_user)):
    """Payments Register mirror (upstream Accounts & Vouchers -> Payment Vouchers / Due List).

    Admin sees every voucher; a vendor sees only its own. Fields are the register's
    own: PV/GPV no, bill ref no, bill no, amount, payment date, UTR and status.
    """
    codes = await allowed_vendor_codes(user)
    q = {} if codes is None else {"vendor_code": {"$in": codes}}
    rows = await db.payment_vouchers.find(q, {"_id": 0}).sort("payment_date", -1).to_list(500)
    return rows


@router.get("/export.xlsx")
async def export_bills_xlsx(
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    user=Depends(staff_user),
):
    """Admin/staff: bills + payment details as an Excel sheet (optional filters)."""
    from io import BytesIO

    from openpyxl import Workbook
    from openpyxl.styles import Font

    q: dict = dict(scope_filter(user))
    if status and status != "all":
        q["status"] = status
    docs = await db.bills.find(q, {"_id": 0}).sort("invoice_date", -1).to_list(5000)

    def _in_range(bill: dict) -> bool:
        day = str(bill.get("filling_date") or bill.get("invoice_date") or "")[:10]
        if date_from and (not day or day < date_from):
            return False
        if date_to and (not day or day > date_to):
            return False
        return True

    rows = [b for b in docs if _in_range(b)]

    headers = [
        "Bill Ref No", "Vendor", "Bill No", "Work Order No", "Filling Date", "Due Date",
        "Taxable Value", "GST", "Gross Bill Amount", "TDS", "Total Bill Value", "Other Deductions / Penalties", "Previous Advance", "Invoice Total",
        "GPV / PV No", "Payment Date", "UTR No", "Payment Mode", "Current Status",
        "Approval Status", "Approval Date",
    ]
    wb = Workbook()
    ws = wb.active
    ws.title = "Bills"
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for b in rows:
        ws.append([
            b.get("invoice_no", ""),
            b.get("vendor_name", ""),
            b.get("bill_no", ""),
            b.get("po_number", ""),
            b.get("filling_date") or b.get("invoice_date", ""),
            b.get("due_date", ""),
            b.get("taxable_amount", 0),
            b.get("gst_amount", 0),
            b.get("gross_amount", 0),
            b.get("tds_amount", 0),
            b.get("bill_value", 0),
            b.get("other_deductions", 0),
            b.get("previous_advance_note", ""),
            b.get("total_amount", 0),
            b.get("pv_no", ""),
            b.get("payment_date", ""),
            b.get("utr", ""),
            b.get("payment_mode", ""),
            (f"Paid via {b.get('payment_mode') or 'NEFT'}" if b.get("utr") else (b.get("status_label") or b.get("status", ""))),
            b.get("approval_status", ""),
            b.get("approval_date", ""),
        ])
    for i, width in enumerate([16, 26, 20, 20, 13, 13, 14, 12, 18, 10, 16, 26, 24, 14, 20, 13, 24, 16, 28, 22, 13], start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = width

    buf = BytesIO()
    wb.save(buf)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="arun-bills.xlsx"'},
    )


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
    if not can_see_vendor(user, doc["vendor_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    return Bill(**doc)


@router.get("/{bill_id}/payment-advice")
async def download_payment_advice(bill_id: str, user=Depends(current_user)):
    """Payment advice PDF (PV number + UTR). Available once payment is released."""
    doc = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    if not can_see_vendor(user, doc["vendor_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    if not (doc.get("utr") or doc.get("pv_no")):
        raise HTTPException(status_code=400, detail="Payment not released yet for this invoice")
    vendor = await db.vendors.find_one({"id": doc["vendor_id"]}, {"_id": 0}) or {}
    return Response(
        content=payment_advice_pdf(doc, vendor), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Payment Advice {doc["invoice_no"]}.pdf"'},
    )


@router.get("/{bill_id}/pdf")
async def download_bill(bill_id: str, user=Depends(current_user)):
    doc = await db.bills.find_one({"id": bill_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Bill not found")
    if not can_see_vendor(user, doc["vendor_id"]):
        raise HTTPException(status_code=403, detail="Not allowed")
    vendor = await db.vendors.find_one({"id": doc["vendor_id"]}, {"_id": 0}) or {}
    pdf = invoice_pdf(doc, vendor)
    return Response(
        content=pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{doc["invoice_no"]}.pdf"'},
    )
