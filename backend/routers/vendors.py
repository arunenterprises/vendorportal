"""Vendor master data — READ ONLY.

Vendors are never created or edited here; they are fetched from the Arun
workflow portal by lib/arun.py (primary key: vendorCode).
"""

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import current_user, sees_all
from lib.db import db
from models.schemas import Summary, Vendor

router = APIRouter(tags=["vendors"])


async def vendor_scope(user) -> dict:
    """Mongo filter restricting a vendor user to its own rows; admin/staff see all."""
    if sees_all(user):
        return {}
    return {"vendor_id": user.get("vendor_id")}


@router.get("/vendors", response_model=list[Vendor])
async def list_vendors(user=Depends(current_user)):
    q = {} if sees_all(user) else {"id": user.get("vendor_id")}
    docs = await db.vendors.find(q, {"_id": 0}).sort("company_name", 1).to_list(500)
    return [Vendor(**d) for d in docs]


@router.get("/vendors/me", response_model=Vendor)
async def my_vendor(user=Depends(current_user)):
    if not user.get("vendor_id"):
        raise HTTPException(status_code=404, detail="No vendor profile for this account")
    doc = await db.vendors.find_one({"id": user["vendor_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return Vendor(**doc)


@router.get("/summary", response_model=Summary)
async def summary(user=Depends(current_user)):
    scope = await vendor_scope(user)
    bills = await db.bills.find(scope, {"_id": 0}).to_list(2000)
    orders = await db.work_orders.find(scope, {"_id": 0}).to_list(2000)
    total_billed = sum(b.get("total_amount", 0) for b in bills)
    pending = sum(b.get("total_amount", 0) for b in bills if b.get("status") in ("pending", "under_review"))
    cleared = sum(b.get("paid_amount") or b.get("total_amount", 0) for b in bills if b.get("status") == "paid")

    def _amount(bill: dict) -> float:
        """What the vendor actually sees for a bill: the released voucher amount if any."""
        return round(bill.get("paid_amount") or bill.get("total_amount", 0) or 0, 2)

    def _newest(rows: list[dict], date_field: str = "invoice_date") -> dict:
        """Latest row by its date field (ISO strings sort correctly)."""
        return max(rows, key=lambda r: str(r.get(date_field) or ""), default={})

    # all blocks come straight from the upstream Accounts -> Vendor Bill Process
    # fields: billNo, billDate (filling), submittedAt, approvalDate/Status, paidAt/settledAt.
    current = _newest(bills, "filling_date") or _newest(bills)
    approved = _newest([b for b in bills if str(b.get("approval_date") or "").strip()], "approval_date")
    paid_bills = sorted(
        [b for b in bills if b.get("status") == "paid"],
        key=lambda r: str(r.get("paid_date") or ""),
        reverse=True,
    )
    cleared_bill = paid_bills[0] if paid_bills else {}
    previous_paid = paid_bills[1] if len(paid_bills) > 1 else {}
    balance_bill = _newest([b for b in bills if b.get("status") in ("pending", "under_review")], "due_date")

    return Summary(
        total_billed=round(total_billed, 2),
        pending_payment=round(pending, 2),
        cleared_payment=round(cleared, 2),
        active_orders=len([o for o in orders if o.get("status") == "active"]),
        total_bills=len(bills),
        vendors_count=await db.vendors.count_documents(
            {} if sees_all(user) else {"id": user.get("vendor_id")}
        ),
        current_bill_amount=_amount(current),
        current_bill_no=str(current.get("bill_no") or current.get("invoice_no") or ""),
        current_bill_date=str(current.get("filling_date") or current.get("invoice_date") or ""),
        current_bill_status=str(current.get("status_label") or current.get("approval_status") or ""),
        current_bill_submitted=str(current.get("submitted_at") or current.get("filling_date") or ""),
        approved_bill_amount=round(approved.get("total_amount", 0) or 0, 2),
        approved_bill_no=str(approved.get("bill_no") or approved.get("invoice_no") or ""),
        approved_bill_date=str(approved.get("approval_date") or ""),
        cleared_bill_date=str(cleared_bill.get("paid_date") or cleared_bill.get("payment_date") or ""),
        cleared_bill_no=str(cleared_bill.get("bill_no") or cleared_bill.get("invoice_no") or ""),
        cleared_bill_submitted=str(cleared_bill.get("submitted_at") or cleared_bill.get("filling_date") or ""),
        last_bill_amount=_amount(previous_paid),
        last_bill_no=str(previous_paid.get("bill_no") or previous_paid.get("invoice_no") or ""),
        last_bill_paid_date=str(previous_paid.get("paid_date") or previous_paid.get("payment_date") or ""),
        last_bill_submitted=str(previous_paid.get("submitted_at") or previous_paid.get("filling_date") or ""),
        balance_bill_amount=round(pending, 2),
        balance_bill_date=str(balance_bill.get("due_date") or balance_bill.get("filling_date") or ""),
        balance_bill_no=str(balance_bill.get("bill_no") or balance_bill.get("invoice_no") or ""),
        balance_bill_status=str(balance_bill.get("status_label") or balance_bill.get("approval_status") or ""),
        balance_bill_submitted=str(balance_bill.get("submitted_at") or balance_bill.get("filling_date") or ""),
    )
