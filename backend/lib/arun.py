"""Interlink with the Arun Enterprises vendor-workflow portal.

Source of truth for vendor + bill master data. Primary keys:
  vendor  -> `vendorCode`      (e.g. AE0001JV2627)
  bill    -> `permanentBillNo` (e.g. BILL00042627)
Bills carry their work-order data inline (workOrderNo, workScope, items),
so a work order is derived per (vendorCode, workOrderNo).
"""

import logging
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import httpx

from lib.auth import hash_password
from lib.dates import today_iso
from lib.db import db

logger = logging.getLogger(__name__)

TIMEOUT = 45.0


def _cfg():
    return (
        os.environ.get("ARUN_PORTAL_URL", "").rstrip("/"),
        os.environ.get("ARUN_PORTAL_IDENTIFIER", ""),
        os.environ.get("ARUN_PORTAL_PASSWORD", ""),
    )


class ArunPortalError(RuntimeError):
    pass


async def _login(client: httpx.AsyncClient, base: str, identifier: str, password: str) -> str:
    res = await client.post(
        f"{base}/api/auth/login",
        json={"identifier": identifier, "password": password},
    )
    if res.status_code != 200:
        raise ArunPortalError(f"Arun portal login failed ({res.status_code})")
    token = res.json().get("token")
    if not token:
        raise ArunPortalError("Arun portal login returned no token")
    return token


def _num(value, default=0.0) -> float:
    try:
        return float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return default


def _vendor_address(src: dict) -> str:
    parts = [src.get("streetAddress"), src.get("city"), src.get("state"), src.get("pincode")]
    return ", ".join(str(p).strip() for p in parts if str(p or "").strip())


def map_vendor(src: dict) -> dict:
    """External vendor -> our `vendors` document. Keyed on vendorCode."""
    code = str(src.get("vendorCode") or "").strip()
    return {
        "id": f"arun-{code}",
        "code": code,
        "company_name": src.get("firmName") or src.get("accountHolder") or code,
        "contact_person": src.get("contactPerson") or "",
        "email": (src.get("email") or "").strip().lower(),
        "phone": src.get("mobileNo") or "",
        "gstin": src.get("gstNo") or "",
        "pan": src.get("panNo") or "",
        "msme_no": "",
        "address": _vendor_address(src),
        "bank_name": " · ".join(
            p for p in [src.get("bankName"), src.get("branchName")] if p
        ),
        "account_no": str(src.get("accountNumber") or ""),
        "ifsc": src.get("ifscCode") or "",
        "status": "verified",
        # interlink metadata
        "source": "arun_portal",
        "external_id": src.get("id"),
        "vendor_type": src.get("vendorType") or "",
        "project_code": src.get("projectCode") or "",
        "site_name": src.get("siteName") or "",
        "account_type": src.get("accountType") or "",
        "expiry_date": src.get("expiryDate") or "",
        # full mirror of the upstream vendor record
        "account_holder": src.get("accountHolder") or "",
        "branch_name": src.get("branchName") or "",
        "bank_address": src.get("bankAddress") or "",
        "bank_city": src.get("bankCity") or "",
        "bank_state": src.get("bankState") or "",
        "city": src.get("city") or "",
        "state": (src.get("state") or "").strip(),
        "pincode": str(src.get("pincode") or ""),
        "street_address": src.get("streetAddress") or "",
        "creation_date": src.get("creationDate") or "",
        "approval_date": src.get("approvalDate") or "",
        "approved_by": src.get("approvedByName") or "",
        "checked_by": src.get("checkedByName") or "",
        "prepared_by": src.get("preparedByName") or "",
        "created_by": src.get("createdByName") or "",
        "revision": int(_num(src.get("revision"))),
        "step": int(_num(src.get("step"))),
        "updated_at": str(src.get("updatedAt") or ""),
        "history": src.get("history") or [],
        "synced_at": datetime.now(timezone.utc),
    }


# External approval wording -> our four payment statuses.
def map_bill_status(src: dict) -> str:
    approval = str(src.get("approvalStatus") or "").lower()
    release = str(src.get("finalReleaseStatus") or "").lower()

    if "paid" in release and "unpaid" not in release:
        return "paid"
    if "reject" in approval or "reject" in release:
        return "rejected"
    if "approved" in approval:
        return "under_review"
    return "pending"


def map_items(src: dict) -> list[dict]:
    """Bill / work-order line items, mirrored from the upstream `items` array."""
    items = []
    for it in src.get("items") or []:
        items.append({
            "description": it.get("description") or it.get("categoryScope") or "",
            "hsn": it.get("hsn") or "",
            "qty": _num(it.get("woQty")),
            "rate": _num(it.get("woRate")),
            "unit": it.get("unit") or src.get("uom") or "",
            "billed_qty": _num(it.get("billedQty")),
            "category_scope": it.get("categoryScope") or "",
        })
    if not items and src.get("itemDescription"):
        items = [{
            "description": src.get("itemDescription"),
            "hsn": "",
            "qty": _num(src.get("quantity")),
            "rate": 0.0,
            "unit": src.get("uom") or "",
            "billed_qty": _num(src.get("quantity")),
            "category_scope": "",
        }]
    return items


def map_bill(src: dict, vendor: dict) -> dict:
    """External bill -> our `bills` document. Keyed on permanentBillNo."""
    basic = _num(src.get("basicAmount"))
    gst_rate = _num(src.get("gstSlab"))
    tds_rate = _num(src.get("tdsRate"))
    gst_amount = round(basic * gst_rate / 100, 2)
    tds_amount = round(basic * tds_rate / 100, 2)
    deductions = _num(src.get("otherDeductions")) + _num(src.get("previousAdvance"))
    perm = str(src.get("permanentBillNo") or src.get("billNo") or "").strip()
    status = map_bill_status(src)

    return {
        "id": f"arun-bill-{perm}",
        "invoice_no": perm,
        "vendor_id": vendor["id"],
        "vendor_name": vendor["company_name"],
        "work_order_id": _wo_slug(vendor["code"], str(src.get("workOrderNo") or "NA")),
        "po_number": str(src.get("workOrderNo") or ""),
        "invoice_date": src.get("billDate") or "",
        "description": src.get("itemDescription") or src.get("workScope") or "",
        "taxable_amount": basic,
        "gst_rate": gst_rate,
        "gst_amount": gst_amount,
        "tds_amount": tds_amount,
        "total_amount": round(basic + gst_amount - tds_amount - deductions, 2),
        "status": status,
        # exact wording from the workflow portal, shown verbatim in the UI/PDF
        "status_label": (src.get("finalReleaseStatus") or src.get("approvalStatus") or "").strip(),
        "utr": "",
        "paid_date": src.get("approvalDate") if status == "paid" else "",
        "remarks": " · ".join(
            p for p in [src.get("approvalStatus"), src.get("finalReleaseStatus"), src.get("todoNotes")] if p
        ),
        "created_at": datetime.now(timezone.utc),
        # interlink metadata
        "source": "arun_portal",
        "external_id": src.get("id"),
        "bill_no": src.get("billNo") or "",
        "ref_no": src.get("refNo") or "",
        "due_date": src.get("dueDate") or "",
        "scheduled_due_date": src.get("scheduledDueDate") or "",
        "payment_mode": src.get("paymentMode") or "",
        "priority_level": src.get("priorityLevel") or "",
        "approval_status": src.get("approvalStatus") or "",
        "final_release_status": src.get("finalReleaseStatus") or "",
        "project_code": src.get("projectCodeLocation") or "",
        "other_deductions": _num(src.get("otherDeductions")),
        "previous_advance": _num(src.get("previousAdvance")),
        # "Final" section of the workflow portal, mirrored verbatim
        "approver_name": src.get("approverName") or "",
        "approval_date": src.get("approvalDate") or "",
        "account_incharge": src.get("accountInchargeName") or "",
        "purchase_incharge": src.get("purchaseInchargeName") or "",
        "site_incharge": src.get("siteInchargeName") or "",
        "measurement_status": src.get("measurementStatus") or "",
        "gst_tds_check": src.get("gstTdsCheck") or "",
        "wo_rate_status": src.get("woRateStatus") or "",
        "process_date": src.get("processDate") or "",
        "todo_notes": src.get("todoNotes") or "",
        "tds_rate": tds_rate,
        "uom": src.get("uom") or "",
        "quantity": _num(src.get("quantity")),
        "bill_serial": int(_num(src.get("billSerial"))),
        "step": int(_num(src.get("step"))),
        "revision": int(_num(src.get("revision"))),
        "updated_at": str(src.get("updatedAt") or ""),
        "items": map_items(src),
        "history": src.get("history") or [],
        "synced_at": datetime.now(timezone.utc),
    }


def _wo_slug(vendor_code: str, wo_no: str) -> str:
    """URL-safe work-order id (upstream WO numbers contain '/')."""
    safe = re.sub(r"[^A-Za-z0-9]+", "-", wo_no).strip("-") or "NA"
    return f"arun-wo-{vendor_code}-{safe}"


def map_work_order(src: dict, vendor: dict) -> dict:
    """Work-order data is embedded in each external bill."""
    wo_no = str(src.get("workOrderNo") or "NA")
    items = map_items(src)

    # the work-order status is derived from the bill section of the workflow portal
    bill_status = map_bill_status(src)
    label = (src.get("finalReleaseStatus") or src.get("approvalStatus") or "").strip()
    low = label.lower()
    if bill_status == "paid":
        status = "completed"
    elif any(k in low for k in ("hold", "reject", "reopen", "query")):
        status = "on_hold"
    else:
        status = "active"
    # live stage of the work order, straight from the workflow portal's bill section
    today = today_iso("Asia/Kolkata")
    expiry = str(src.get("workOrderExpiryDate") or "")
    stages = [
        ("Work order issued", bool(src.get("workOrderNo")), src.get("workOrderDate") or ""),
        ("Bill submitted", bool(src.get("billDate")), src.get("billDate") or ""),
        ("Measurement verified", bool(src.get("measurementStatus")), src.get("processDate") or ""),
        ("Bill approved", "approved" in str(src.get("approvalStatus") or "").lower(), src.get("approvalDate") or ""),
        ("Payment released", bill_status == "paid", src.get("scheduledDueDate") or ""),
    ]
    done = [s for s in stages if s[1]]
    live_stage = done[-1][0] if done else "Work order issued"
    live_stage_date = done[-1][2] if done else ""
    next_stage = next((s[0] for s in stages if not s[1]), "")
    expired = bool(expiry and expiry < today and bill_status != "paid")

    return {
        "id": _wo_slug(vendor["code"], wo_no),
        "status_label": label,
        "live_stage": live_stage,
        # "Work Order Status (Auto)" as shown in the workflow portal's bill section
        "wo_auto_status": (src.get("woRateStatus") or "").strip() or ("Expired" if expired else "Active"),
        "live_stage_date": live_stage_date,
        "next_stage": next_stage,
        "stages_done": len(done),
        "stages_total": len(stages),
        "expired": expired,
        "po_number": wo_no,
        "vendor_id": vendor["id"],
        "vendor_name": vendor["company_name"],
        "title": src.get("workScope") or f"Work Order {wo_no}",
        "scope": " · ".join(
            p for p in [src.get("workScope"), src.get("projectCodeLocation")] if p
        ),
        "value": _num(src.get("totalWOValue")),
        "status": status,
        "issued_date": src.get("workOrderDate") or "",
        "due_date": src.get("dueDate") or "",
        "milestones": [
            {"title": "Measurement verified", "done": bool(src.get("measurementStatus")), "due_date": src.get("processDate") or ""},
            {"title": "Bill approved for payment", "done": "approved" in str(src.get("approvalStatus") or "").lower(), "due_date": src.get("approvalDate") or ""},
            {"title": "Payment released", "done": map_bill_status(src) == "paid", "due_date": src.get("scheduledDueDate") or ""},
        ],
        "items": items,
        "created_at": datetime.now(timezone.utc),
        "source": "arun_portal",
        "uom": src.get("uom") or "",
        "expiry_date": src.get("workOrderExpiryDate") or "",
        "revision": int(_num(src.get("revision"))),
        "updated_at": str(src.get("updatedAt") or ""),
        "po_file_name": (src.get("workOrderFile") or {}).get("name") or "",
        "po_file_base64": ((src.get("workOrderFile") or {}).get("dataUrl") or "").split(",", 1)[-1],
        "po_file_type": (src.get("workOrderFile") or {}).get("type") or "application/pdf",
        "has_po_file": bool((src.get("workOrderFile") or {}).get("dataUrl")),
        "synced_at": datetime.now(timezone.utc),
    }


def map_purchase_wo(src: dict, vendor: dict) -> dict:
    """APPROVED work order from the workflow portal's Purchase Department section.

    Linked to this portal by vendorCode + woNo.
    """
    wo_no = str(src.get("woNo") or "NA")
    items = [
        {
            "description": it.get("description") or "",
            "hsn": it.get("hsn") or "",
            "qty": _num(it.get("qty")),
            "rate": _num(it.get("rate")),
            "unit": it.get("unit") or "",
            "billed_qty": 0.0,
            "category_scope": "",
        }
        for it in src.get("items") or []
    ]
    expiry = str(src.get("expiryDate") or "")
    expired = bool(expiry and expiry < today_iso("Asia/Kolkata"))
    approved = bool(str(src.get("approvalDate") or "").strip()) or int(_num(src.get("step"))) >= 4
    first = items[0]["description"] if items else (src.get("scopeOfWork") or "")
    title = f"{first} (+{len(items) - 1} more)" if len(items) > 1 else (first or wo_no)

    return {
        "id": _wo_slug(vendor["code"], wo_no),
        "vendor_id": vendor["id"],
        "vendor_name": vendor["company_name"],
        "vendor_code": vendor["code"],
        "po_number": wo_no,
        "title": title,
        "scope": src.get("scopeOfWork") or src.get("termsAndConditions") or "",
        "value": _num(src.get("total")),
        "status": "completed" if expired else "active",
        "wo_auto_status": "Approved Work Order" if approved else "Work order in process",
        "status_label": "Approved" if approved else "Pending approval",
        "approved": approved,
        "issued_date": str(src.get("woDate") or ""),
        "due_date": expiry,
        "expiry_date": expiry,
        "expired": expired,
        "milestones": [
            {"title": "Work order approved", "done": bool(src.get("approvalDate")), "due_date": str(src.get("approvalDate") or "")},
            {"title": "Delivery at site", "done": False, "due_date": str(src.get("woDate") or "")},
            {"title": "Work order expiry", "done": expired, "due_date": expiry},
        ],
        "items": items,
        "created_at": datetime.now(timezone.utc),
        "source": "arun_portal",
        "origin": "purchase_department",
        "approved_by": src.get("approvedByName") or "",
        "approval_date": str(src.get("approvalDate") or ""),
        "prepared_by": src.get("preparedBy") or "",
        "client_name": src.get("clientName") or "",
        "project_site": src.get("projectSite") or "",
        "boq_ref_no": src.get("boqRefNo") or "",
        "payment_terms": src.get("paymentTerms") or "",
        "delivery_terms": src.get("deliveryTerms") or "",
        "warranty_clause": src.get("warrantyClause") or "",
        "penalty_clause": src.get("penaltyClause") or "",
        "retention_pct": _num(src.get("retentionPct")),
        "gst_slab": _num(src.get("gstSlab")),
        "uom": items[0]["unit"] if items else "",
        "updated_at": str(src.get("updatedAt") or ""),
        "po_file_name": src.get("attachmentName") or "",
        "po_file_base64": str(src.get("attachmentData") or "").split(",", 1)[-1],
        "po_file_type": "application/pdf",
        "has_po_file": bool(src.get("attachmentData")),
        "synced_at": datetime.now(timezone.utc),
    }


async def fetch_remote() -> tuple[list[dict], list[dict], list[dict]]:
    base, identifier, password = _cfg()
    if not base or not identifier or not password:
        raise ArunPortalError("Arun portal credentials are not configured in backend/.env")

    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        token = await _login(client, base, identifier, password)
        headers = {"Authorization": f"Bearer {token}"}
        v_res = await client.get(f"{base}/api/vendors", headers=headers)
        b_res = await client.get(f"{base}/api/bills", headers=headers)
        w_res = await client.get(f"{base}/api/work_orders", headers=headers)

    if v_res.status_code != 200:
        raise ArunPortalError(f"Could not read vendors from Arun portal ({v_res.status_code})")
    if b_res.status_code != 200:
        raise ArunPortalError(f"Could not read bills from Arun portal ({b_res.status_code})")

    vendors = [v for v in v_res.json() if str(v.get("vendorCode") or "").strip()]
    bills = [b for b in b_res.json() if str(b.get("permanentBillNo") or b.get("billNo") or "").strip()]
    # purchase department work orders — every work order, approved or still in process
    purchase_wos = []
    if w_res.status_code == 200:
        purchase_wos = [
            w for w in w_res.json()
            if str(w.get("woNo") or "").strip() and str(w.get("vendorCode") or "").strip()
        ]
    return vendors, bills, purchase_wos


async def sync_from_arun() -> dict:
    """Idempotent upsert of the Arun portal's vendors / work orders / bills.

    A vendor's portal login is created on first sync with their vendorCode as the
    password, so each firm can sign in and see only its own records.
    """
    remote_vendors, remote_bills, remote_purchase_wos = await fetch_remote()

    vendors_by_code: dict[str, dict] = {}
    for src in remote_vendors:
        mapped = map_vendor(src)
        vendors_by_code[mapped["code"]] = mapped
        await db.vendors.update_one({"code": mapped["code"]}, {"$set": mapped}, upsert=True)

    logins = []
    for code, vendor in vendors_by_code.items():
        # every synced vendor gets a portal login: vendor code is BOTH the id and the password
        raw_email = (vendor["email"] or "").strip().lower()
        # upstream sometimes sends junk ("nil", "na", "-") — never use it as a unique login id
        if "@" not in raw_email or raw_email in {"nil", "na", "n/a", "-", "none"}:
            raw_email = ""
        email = raw_email or f"{code.lower()}@arunenterprises.local"
        existing = await db.users.find_one({"vendor_id": vendor["id"]})
        if existing:
            await db.users.update_one(
                {"vendor_id": vendor["id"]},
                {"$set": {"name": vendor["contact_person"] or vendor["company_name"]}},
            )
        else:
            # another account already owns this email -> fall back to the code-based address
            if await db.users.find_one({"email": email}):
                email = f"{code.lower()}@arunenterprises.local"
            await db.users.insert_one({
                "id": f"arun-user-{code}",
                "email": email,
                "name": vendor["contact_person"] or vendor["company_name"],
                "role": "vendor",
                "vendor_id": vendor["id"],
                "password_hash": hash_password(code),
                "source": "arun_portal",
            })
            logins.append({"vendor_code": code, "password": code, "vendor": vendor["company_name"]})

    work_orders, bills, skipped, changes = 0, 0, [], 0
    seen_wo_ids: set[str] = set()
    seen_invoice_nos: set[str] = set()

    # ---- approved work orders from the purchase department ----
    purchase_count = 0
    for src in remote_purchase_wos:
        code = str(src.get("vendorCode") or "").strip()
        vendor = vendors_by_code.get(code) or await db.vendors.find_one({"code": code}, {"_id": 0})
        if not vendor:
            continue
        wo = map_purchase_wo(src, vendor)
        seen_wo_ids.add(wo["id"])
        existing = await db.work_orders.find_one(
            {"id": wo["id"]}, {"_id": 0, "status": 1, "status_overridden": 1, "live": 1}
        )
        if existing and existing.get("status_overridden"):
            wo["status"] = existing["status"]
            wo["status_overridden"] = True
        if existing and existing.get("live") is not None:
            wo["live"] = existing["live"]
        await db.work_orders.update_one({"id": wo["id"]}, {"$set": wo}, upsert=True)
        purchase_count += 1

    for src in remote_bills:
        code = str(src.get("vendorCode") or "").strip()
        vendor = vendors_by_code.get(code)
        if not vendor:
            doc = await db.vendors.find_one({"code": code}, {"_id": 0})
            if not doc:
                skipped.append(str(src.get("permanentBillNo") or src.get("billNo")))
                continue
            vendor = doc

        wo = map_work_order(src, vendor)
        seen_wo_ids.add(wo["id"])
        # an admin's manual status override wins over the upstream-derived status
        existing = await db.work_orders.find_one(
            {"id": wo["id"]},
            {"_id": 0, "status": 1, "status_overridden": 1, "po_file_base64": 1, "po_file_name": 1, "po_file_type": 1, "live": 1},
        )
        if existing and existing.get("live") is not None:
            wo["live"] = existing["live"]
        if existing and existing.get("status_overridden"):
            wo["status"] = existing["status"]
            wo["status_overridden"] = True
        # a later bill on the same work order may not carry the WO copy — keep the one we have
        if not wo.get("po_file_base64") and existing and existing.get("po_file_base64"):
            wo["po_file_base64"] = existing["po_file_base64"]
            wo["po_file_name"] = existing.get("po_file_name", "")
            wo["po_file_type"] = existing.get("po_file_type", "application/pdf")
            wo["has_po_file"] = True
        await db.work_orders.update_one({"id": wo["id"]}, {"$set": wo}, upsert=True)
        work_orders = len(seen_wo_ids)

        bill = map_bill(src, vendor)
        # never clobber a UTR / payment already recorded inside this portal
        local = await db.bills.find_one({"invoice_no": bill["invoice_no"]}, {"_id": 0})
        if local and local.get("utr"):
            bill["utr"] = local["utr"]
            bill["status"] = local.get("status", bill["status"])
            bill["paid_date"] = local.get("paid_date", bill["paid_date"])
        # record what changed upstream so the vendor can be told about it
        if local:
            for field, label in (
                ("status_label", "Payment status"),
                ("approval_status", "Approval status"),
                ("final_release_status", "Final release"),
                ("total_amount", "Payable total"),
                ("utr", "UTR"),
            ):
                before, after = local.get(field), bill.get(field)
                if str(before or "") != str(after or ""):
                    changes += 1
                    await db.bill_changes.insert_one({
                        "id": str(uuid4()),
                        "vendor_id": vendor["id"],
                        "bill_id": bill["id"],
                        "invoice_no": bill["invoice_no"],
                        "field": field,
                        "label": label,
                        "from_value": str(before or ""),
                        "to_value": str(after or ""),
                        "changed_at": datetime.now(timezone.utc),
                    })
        await db.bills.update_one({"invoice_no": bill["invoice_no"]}, {"$set": bill}, upsert=True)
        seen_invoice_nos.add(bill["invoice_no"])
        bills = len(seen_invoice_nos)

    # the workflow portal is the single source of truth: drop anything it no longer has
    # (this also clears rows left behind by an older id scheme, which showed up as duplicates)
    removed_wo = await db.work_orders.delete_many(
        {"source": "arun_portal", "id": {"$nin": list(seen_wo_ids)}}
    )
    removed_bills = await db.bills.delete_many(
        {"source": "arun_portal", "invoice_no": {"$nin": list(seen_invoice_nos)}}
    )

    result = {
        "vendors": len(vendors_by_code),
        "work_orders": work_orders,
        "purchase_work_orders": purchase_count,
        "bills": bills,
        "changes": changes,
        "removed_work_orders": removed_wo.deleted_count,
        "removed_bills": removed_bills.deleted_count,
        "new_logins": logins,
        "skipped_bills": skipped,
        "synced_at": datetime.now(timezone.utc),
    }
    await db.sync_runs.insert_one(dict(result))
    logger.info("arun sync: %s", {k: v for k, v in result.items() if k != "synced_at"})
    return result
