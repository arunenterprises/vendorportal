"""Pydantic v2 models for the vendor portal."""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field


def _id() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class LoginRequest(BaseModel):
    """Vendors sign in with their vendor code; admins with their email.

    Accepts `identifier` (preferred) or `email` so either field name works.
    """

    identifier: Optional[str] = None
    email: Optional[str] = None
    password: str

    def who(self) -> str:
        return (self.identifier or self.email or "").strip()


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    vendor_id: Optional[str] = None


class Vendor(BaseModel):
    id: str = Field(default_factory=_id)
    code: str
    company_name: str
    contact_person: str
    email: str
    phone: str
    gstin: str
    pan: str
    msme_no: str = ""
    address: str = ""
    bank_name: str = ""
    account_no: str = ""
    ifsc: str = ""
    status: str = "verified"
    # interlink (Arun workflow portal) — empty for locally created vendors
    source: str = "local"
    vendor_type: str = ""
    project_code: str = ""
    site_name: str = ""
    account_type: str = ""
    expiry_date: str = ""
    # full mirror of the workflow portal's vendor record
    account_holder: str = ""
    branch_name: str = ""
    bank_address: str = ""
    bank_city: str = ""
    bank_state: str = ""
    city: str = ""
    state: str = ""
    pincode: str = ""
    street_address: str = ""
    creation_date: str = ""
    approval_date: str = ""
    approved_by: str = ""
    checked_by: str = ""
    prepared_by: str = ""
    created_by: str = ""
    revision: int = 0
    step: int = 0
    updated_at: str = ""
    history: List[dict] = []


class PortalUserCreate(BaseModel):
    """The only thing this portal creates: a login."""

    email: str
    name: str = ""
    role: str = "vendor"
    vendor_code: Optional[str] = None
    password: Optional[str] = None


class WorkOrderStatusUpdate(BaseModel):
    """Admin-only manual status override for a work order."""

    status: str


class WorkOrderVisibility(BaseModel):
    """Admin-only: show (live) or hide (off-air) a work order for the vendor."""

    live: bool


class BulkVisibility(BaseModel):
    """Admin-only: put every work order of one vendor live / off-air at once."""

    vendor_id: str
    live: bool


class PasswordReset(BaseModel):
    password: str


class PasswordChange(BaseModel):
    """Self-service password update for the signed-in portal user."""

    current_password: str
    new_password: str


class UserRow(BaseModel):
    id: str
    email: str
    name: str
    role: str
    vendor_id: Optional[str] = None
    vendor_code: str = ""
    vendor_name: str = ""
    source: str = "local"


class Milestone(BaseModel):
    title: str
    done: bool = False
    due_date: str = ""


class LineItem(BaseModel):
    description: str
    hsn: str = "998719"
    qty: float = 1
    rate: float = 0
    unit: str = ""
    billed_qty: float = 0
    category_scope: str = ""


class WorkOrder(BaseModel):
    id: str = Field(default_factory=_id)
    po_number: str
    vendor_id: str
    vendor_name: str = ""
    title: str
    scope: str = ""
    value: float = 0
    status: str = "active"  # active | completed | on_hold
    issued_date: str = ""
    due_date: str = ""
    milestones: List[Milestone] = []
    items: List[LineItem] = []
    created_at: datetime = Field(default_factory=_now)
    # interlink (Arun workflow portal)
    source: str = "local"
    uom: str = ""
    expiry_date: str = ""
    revision: int = 0
    updated_at: str = ""
    po_file_name: str = ""
    has_po_file: bool = False
    status_label: str = ""
    live_stage: str = ""
    wo_auto_status: str = ""
    live_stage_date: str = ""
    next_stage: str = ""
    stages_done: int = 0
    stages_total: int = 0
    expired: bool = False
    approved: bool = False
    live: bool = True
    live_updated_by: str = ""
    billed_amount: float = 0
    bills_count: int = 0
    balance_value: float = 0
    possible_duplicate: bool = False
    status_overridden: bool = False
    status_updated_by: str = ""
    origin: str = ""
    vendor_code: str = ""
    approved_by: str = ""
    approval_date: str = ""
    client_name: str = ""
    project_site: str = ""
    boq_ref_no: str = ""
    payment_terms: str = ""
    delivery_terms: str = ""
    warranty_clause: str = ""
    penalty_clause: str = ""
    retention_pct: float = 0
    gst_slab: float = 0
    synced_at: datetime | None = None


class Bill(BaseModel):
    id: str = Field(default_factory=_id)
    invoice_no: str
    vendor_id: str
    vendor_name: str = ""
    work_order_id: str = ""
    po_number: str = ""
    invoice_date: str = ""
    description: str = ""
    taxable_amount: float = 0
    gst_rate: float = 18
    gst_amount: float = 0
    tds_amount: float = 0
    total_amount: float = 0
    status: str = "pending"  # pending | under_review | paid | rejected
    status_label: str = ""   # verbatim upstream wording, when synced
    utr: str = ""
    paid_date: str = ""
    remarks: str = ""
    created_at: datetime = Field(default_factory=_now)
    # interlink (Arun workflow portal)
    source: str = "local"
    bill_no: str = ""
    ref_no: str = ""
    due_date: str = ""
    scheduled_due_date: str = ""
    payment_mode: str = ""
    priority_level: str = ""
    approval_status: str = ""
    final_release_status: str = ""
    project_code: str = ""
    # "Final" section of the workflow portal, mirrored verbatim
    approver_name: str = ""
    approval_date: str = ""
    account_incharge: str = ""
    purchase_incharge: str = ""
    site_incharge: str = ""
    measurement_status: str = ""
    gst_tds_check: str = ""
    wo_rate_status: str = ""
    process_date: str = ""
    todo_notes: str = ""
    other_deductions: float = 0
    previous_advance: float = 0
    tds_rate: float = 0
    uom: str = ""
    quantity: float = 0
    bill_serial: int = 0
    step: int = 0
    revision: int = 0
    updated_at: str = ""
    items: List[LineItem] = []
    history: List[dict] = []


class DocumentOut(BaseModel):
    id: str
    vendor_id: str
    vendor_code: str = ""
    vendor_name: str = ""
    name: str
    doc_type: str
    content_type: str
    size: int
    uploaded_at: datetime


class DocumentCreate(BaseModel):
    name: str
    doc_type: str
    content_type: str = "application/pdf"
    data_base64: str


class Summary(BaseModel):
    total_billed: float
    pending_payment: float
    cleared_payment: float
    active_orders: int
    total_bills: int
    vendors_count: int
