# Arun Enterprises Vendor Portal — Living Spec

## What the app does
Cloud vendor portal for **ARUN ENTERPRISES** (Prayagraj, UP).

**This portal creates ONLY portal users (logins).** Every other record — vendor
details, work orders, bills and payment status — is **fetched from the Arun
workflow portal** and is strictly READ ONLY here. There are no create/edit
screens for vendors, work orders or bills, and the mutating routes were removed
(`POST /vendors`, `PUT /vendors/{id}`, `POST /work-orders`, `POST /bills`,
`PATCH /bills/{id}/status` all return 405/404).

Vendors sign in with their **vendor code** (code is both id and password) to view
their Work Orders, Vendor Details, Bills/Invoices and live Payment Status, and to
download branded A4 PDF tax invoices / work orders. Vendors may still upload
their own compliance documents (local-only data).

**UI is English-only** (all Hindi strings and the EN/HI toggle removed).
There are **no demo one-click login buttons**.

## Company branding
ARUN ENTERPRISES · "Our Quality Oriented Service's Is First Priority"
209H/1F/1, Ops Nagar, Kalindipuram, Prayagraj, UP 211011
Toll Free 9429694552 · info@arunenterprises.online · www.arunenterprises.com.in
Logo: `frontend/public/arun-logo.jpg` (also embedded in every generated PDF).

## Stack
FastAPI + motor/MongoDB backend (all routes on `api_router`, prefix `/api`),
Vite + React 19 + Tailwind v4 + shadcn (base-ui) frontend. PDFs generated
server-side with reportlab (`backend/lib/pdf.py`).

## Auth
Single login field accepts a **vendor code OR an email** (`identifier`, `email`
also accepted). Session is an httpOnly cookie `vp_session` backed by the
`sessions` collection (14-day TTL index). `GET /api/auth/me` answers "who am I".
Roles: `admin` (sees/mutates everything) and `vendor` (scoped to own `vendor_id`
on every list/detail/download route; 403 otherwise).
Vendor codes resolve case-insensitively (`routers/auth.py#_resolve_user`).
Frontend gates pages with `components/RequireAuth.jsx`; logout goes through
`lib/session.js#endSession`. Downloads use `lib/download.js#downloadFile`
(anchor click, not `window.open`, so Safari/iOS popup blockers can't break them).

## THE INTERLINK — upstream workflow portal
`backend/lib/arun.py` pulls live master data from
`https://vendor-workflow-sys.emergent.host` (config in `backend/.env`:
`ARUN_PORTAL_URL`, `ARUN_PORTAL_IDENTIFIER`, `ARUN_PORTAL_PASSWORD`).

- Upstream login is `POST /api/auth/login` with **`identifier`** + `password`
  (NOT `email`) and returns a JWT used as `Authorization: Bearer`.
- Upstream reads: `GET /api/vendors`, `GET /api/bills` (`/api/payments` is empty).
- **Primary keys**: vendor = `vendorCode` (e.g. `AE0001JV2627`);
  bill = `permanentBillNo` (e.g. `BILL00042627`); the two join on `vendorCode`.
- Work orders are **embedded inside each bill** (`workOrderNo`, `workOrderDate`,
  `workScope`, `totalWOValue`, `items[]`), so one work order is derived per
  (vendorCode, workOrderNo) with id `arun-wo-<code>-<workOrderNo>`.
- Every synced vendor gets a portal login with **vendor code as both id and
  password**. Vendors without an upstream email get `<code>@arunenterprises.local`.
- Sync is **idempotent** (upsert on `code` / `invoice_no` / work-order id) and it
  never clobbers a UTR already recorded locally.
- Status mapping: release contains "paid" (not "unpaid") -> `paid`;
  "reject" -> `rejected`; approval contains "approved" -> `under_review`;
  else `pending`.
- Synced rows carry `source: "arun_portal"` plus `bill_no`, `ref_no`, `due_date`,
  `payment_mode`, `priority_level`, `project_code`, etc.
- Trigger: admin button "Sync from Workflow Portal" -> `POST /api/sync/arun`.

## Data model (Mongo, string uuid/derived `id`, never ObjectId)
- `users`: id, email (unique), name, role (admin|vendor), vendor_id, password_hash, source
- `vendors`: id, code, company_name, contact_person, email, phone, gstin, pan,
  msme_no, address, bank_name, account_no, ifsc, status, source, vendor_type,
  project_code, site_name, account_type, expiry_date
- `work_orders`: id, po_number, vendor_id, vendor_name, title, scope, value,
  status (active|completed|on_hold), issued_date, due_date, milestones[], items[], source, uom
- `bills`: id, invoice_no, vendor_id, vendor_name, work_order_id, po_number,
  invoice_date, description, taxable_amount, gst_rate, gst_amount, tds_amount,
  total_amount, status (pending|under_review|paid|rejected), utr, paid_date,
  remarks, source, bill_no, ref_no, due_date, scheduled_due_date, payment_mode,
  priority_level, approval_status, final_release_status, project_code
- `documents`: id, vendor_id, name, doc_type, content_type, size, uploaded_at,
  data_base64 (max 4 MB, inline)
- `sessions`: token, user_id, expires_at (TTL) · `sync_runs`: one doc per sync

## API (all under /api) — data routes are READ ONLY
POST /auth/login (accepts `identifier` = vendor code OR email; `email` also accepted)
GET /auth/me · POST /auth/logout
GET /users (admin) · POST /users (admin — **the only create in this portal**)
PATCH /users/{id}/password (admin) · DELETE /users/{id} (admin)
GET /vendors · GET /vendors/me · GET /summary (role-scoped KPIs)
GET /work-orders · GET /work-orders/{id} · GET /work-orders/{id}/pdf
GET /bills · GET /bills/{id} · GET /bills/{id}/pdf
GET /documents · POST /documents · GET /documents/{id}/download · DELETE /documents/{id}
POST /sync/arun (admin) · GET /sync/status

Creating a vendor user: admin picks a **synced vendor code**; that code becomes
both the login id and the password (a custom password may be supplied). Creating
an admin user requires an explicit password. A vendor code with no matching
synced vendor is rejected with 404 ("press Sync first").

## PDFs (`backend/lib/pdf.py`)
A4 (595x842) with the Arun logo, tagline, address, toll free, email and website.
The tax invoice shows **normal details only** — invoice/PO/UTR/paid date, vendor
statutory + bank block, one particulars row and the tax totals — plus the
**final status only** (e.g. "Under Review"); the upstream approval/workflow chain
is deliberately NOT printed. `_cell()` guards against double-wrapping Paragraphs
(that bug printed raw `Paragraph(...)` repr into the tables).

## Key flows
1. Vendor enters vendor code as id AND password -> /dashboard with KPIs.
2. /work-orders (search + status filter) -> detail with milestones and BOQ -> PO PDF.
3. /bills — read-only ledger with status filters + GST invoice PDF download.
4. /vendor-profile — read-only company/statutory/bank dossier from upstream;
   /documents uploads and downloads compliance certificates (local only).
5. Admin -> /admin: **Portal Users** tab (create login / reset password / delete),
   plus read-only Vendors, Work Orders and Invoices tabs, and
   **Sync from Workflow Portal** to re-pull upstream data.

## Seed (`cd /app/backend && python seed.py`)
Wipes local rows, creates the Arun admin, then syncs live upstream data.
Currently yields: 1 vendor (Annapurna Steels / AE0001JV2627), 1 work order
(P00020), 1 bill (BILL00042627, under_review). Counts grow as the upstream
portal grows. Credentials: see `memory/test_credentials.md`.

## Compliance & Documents (updated)
- Allowed doc types (vendor upload only): Sale Invoice, Aadhaar Card, PAN Card, Cancelled Cheque, GST Certificate, Udyam Certificate, Photo.
- Max upload size: 350 KB (client-side check in Documents.jsx + server check in routers/documents.py).
- Download: ADMIN ONLY (`GET /api/documents/{id}/download` returns 403 for vendors). Vendors see only a delete action.

## Password Update
- `POST /api/auth/change-password` {current_password, new_password} for the signed-in user (min 6 chars).
- UI: `/change-password` page ("Update Password" in sidebar), available to both admin and vendor.
- Admin can still reset any user's password via `PATCH /api/users/{id}/password`.

## Admin documents view (updated)
- `GET /api/documents` now returns `vendor_code` + `vendor_name` (joined from vendors) so the admin table can show which vendor submitted each document.
- Admin view: full-width fixed-layout table (Vendor | Document Name | Type | Size | Uploaded | Download), single-line truncation, no upload card. Vendor view: upload card + delete only (no download).

## Sync fix (workflow portal)
- Upstream vendors sometimes send junk emails ("nil", "na", "-"). These are now ignored and replaced with `<vendorcode>@arunenterprises.local`, otherwise the unique email index raised E11000 and the sync returned 502 "Could not reach the workflow portal".
- Existing bad user records were repaired in the DB.

## Full workflow-portal mirror (Vendor / Bill / Final)
- `lib/arun.py` now mirrors EVERY upstream field:
  - Vendor: account holder, branch, bank address/city/state, city/state/pincode/street, creation & approval dates, approved/checked/prepared/created by, revision, step, updatedAt, change history.
  - Bill (incl. "Final" section): approver, approval date, account/purchase/site incharge, measurement status, WO rate check, GST-TDS check, process date, notes, other deductions, previous advance, TDS rate, UOM, quantity, bill serial, step, revision, updatedAt, line items (category, HSN, WO qty, billed qty, unit, rate), change history.
  - Work order: WO expiry date, revision, UOM, and the ORIGINAL Purchase Order PDF uploaded upstream -> `GET /api/work-orders/{id}/po-file`.
- Every sync re-upserts these, so any change made on the workflow portal reflects in the vendor portal on the next sync.
- UI: Bills row click -> full bill detail dialog (amounts, verification & final release, items, history); Vendor Details -> bank + registration/approval + history; Work Order detail -> expiry/revision/PO file + expanded BOQ.

## Auto sync, change alerts, payment timeline, sync log
- **Auto sync**: `.emergent/crons.yml` -> `nightly-arun-sync`, daily 01:00 Asia/Kolkata, POST `/api/cron/sync-arun`.
  Endpoint requires `Authorization: Bearer $WEBHOOK_CRON_SECRET` (backend/.env), de-dupes on `X-Webhook-Id` via `cron_runs`, acks 2xx and runs the sync in a BackgroundTask.
- **Change alerts**: each sync diffs status_label / approval_status / final_release_status / total_amount / utr against the stored bill and writes `bill_changes`. `GET /api/bills/changes` (vendor-scoped) feeds the "Recent Updates" card on the dashboard.
- **Payment timeline**: `components/PaymentTimeline.jsx` inside the bill detail dialog — submitted -> measurement -> approved -> scheduled -> released, with each upstream date.
- **Sync log**: `GET /api/sync/runs` (admin only, 403 for vendors) -> Admin "Sync Log" tab with counts, changes, new logins and skipped bills.

## Work order fixes
- Work-order ids are now slugified (`arun-wo-<code>-<wo-no-slug>`); upstream WO numbers contain '/', which broke the /work-orders/:id route and looked like an auto-logout. Bill.work_order_id uses the same slug.
- Work Orders "Actions" downloads the ORIGINAL work order file uploaded in the workflow portal's bill section (`/api/work-orders/{id}/po-file`); falls back to the generated PDF only when no file exists upstream.
- Work-order status is derived from the upstream bill section: paid -> completed, hold/reject/reopen/query -> on_hold, else active; the verbatim upstream label is shown as `status_label`.

## Live work-order status
- `map_work_order` derives a live 5-stage pipeline from the upstream bill section: Work order issued -> Bill submitted -> Measurement verified -> Bill approved -> Payment released.
- Fields on WorkOrder: `live_stage`, `live_stage_date`, `next_stage`, `stages_done`/`stages_total`, `expired` (WO expiry date passed and not paid), `status_label` (verbatim upstream label).
- UI: Work Orders status column shows badge + live stage with date + "Next: ..." + upstream label; progress bar uses stages_done/stages_total. Detail page shows Live Stage / Next Stage fields.

## Admin work-order status control
- `PATCH /api/work-orders/{id}/status` (ADMIN ONLY, 403 for vendors; 400 for a status outside active/completed/on_hold) sets `status`, `status_overridden=True`, `status_updated_by/at` and writes a `bill_changes` alert (field `work_order_status`) so the vendor sees it on the dashboard "Recent Updates" immediately.
- Sync never clobbers an overridden status, and keeps an existing WO copy if a later bill on the same work order has none.
- Badge colours (both roles): active = green, completed/closed = red, on hold = yellow. Admin rows carry a status dropdown (Active / Closed / On Hold); vendors see the badge only.

## Duplicate work orders fix
- Sync is now authoritative: after upserting, any `source: arun_portal` work order / bill NOT present in the current upstream response is deleted (`removed_work_orders`, `removed_bills` in the sync result + Sync Log). This clears rows left behind by an older id scheme, which the admin panel showed as 1-1 duplicates.
- Admin Command Center Work Orders tab also de-dupes client side on `vendor_id::po_number` (Work Orders page already de-duped on po_number).
- There is NO upstream "Work Order & Project Allocation" API (only /api/vendors and /api/bills), so work orders are derived from the bill section and only change when that upstream data changes.

## UI trims (user requests)
- Change History removed from Vendor Details and the bill detail dialog; "Revision"/"Rev" fields removed from Vendor Details, Work Order detail and the bill dialog header (data still present in the API, just not shown).
- Page header: title 38px, subtitle (firm name · vendor code) 16px semibold slate-700.

## Purchase department approved work orders
- Upstream endpoint `GET /api/work_orders` (purchase department section) is now synced. Only APPROVED ones are taken (approvalDate set or step >= 4).
- Linked by vendorCode + woNo -> local id `arun-wo-<vendorCode>-<woNo slug>`, `origin: "purchase_department"`.
- Mapped fields: woNo -> po_number, total -> value, woDate -> issued_date, expiryDate -> due_date/expiry_date, items (description/qty/unit/rate), approvedByName, approvalDate, preparedBy, clientName, projectSite, boqRefNo, paymentTerms, deliveryTerms, warrantyClause, penaltyClause, retentionPct, gstSlab, attachmentData -> WO copy.
- UI: Work Orders list shows an "Approved WO" tag under the PO number; detail page shows Vendor Code, approval block (status/approved by/date/client/site/BOQ ref) and a "Work Order Terms" card. Sync result + Sync Log carry `purchase_work_orders`.
- UPDATE: the purchase-department sync now takes EVERY work order (not only approved ones). `approved` flag = approvalDate set or step >= 4; the list tag reads "Approved WO" (green) or "WO in process" (amber), status_label = Approved / Pending approval.

## Admin live / unlive control for work orders
- `PATCH /api/work-orders/{id}/visibility` {live: bool} — ADMIN ONLY (403 for vendors, 404 for unknown id). Sets `live`, `live_updated_by/at`.
- Vendor list query filters `live: {$ne: false}` and the detail endpoint returns 404 for an off-air work order; the admin always sees everything with a Live / Unlive toggle button in the Actions column.
- Sync preserves the admin's `live` flag.

## WO vs Bill match, duplicate hint, bulk live control
- `_decorate()` in routers/work_orders.py adds to every work order: `billed_amount`, `bills_count`, `balance_value` (value - billed, from bills whose work_order_id matches) and `possible_duplicate` (same vendor_id + same order value appears more than once).
- UI: Work Orders list has a "Billed / Balance" column (balance green when fully billed, amber otherwise); the detail page has Billed So Far / Bills / Balance Value. Admin rows show a red "POSSIBLE DUPLICATE" tag — the fix for a double-entered work order is to take one off-air with the Unlive toggle (nothing is deleted locally; the upstream portal stays the source of truth).
- Bulk live control: `PATCH /api/work-orders/visibility/bulk` {vendor_id, live} (admin only, 403 for vendors) + vendor picker with "All Live" / "All Off-Air" buttons in the Work Orders summary bar.
- The "Approved WO / WO in process" tag is auto from the upstream purchase department and is NOT editable here; admins can only change status and live/off-air.

## Admin upload of the original work order copy
- `POST /api/work-orders/{id}/po-file` (ADMIN ONLY; 403 vendor, 404 unknown id, 400 for empty or >500 KB) stores base64 in the work order (`po_file_*`, `has_po_file`, `po_file_uploaded_by/at`).
- UI: Admin Command Center -> Work Orders tab -> "Upload Original Work Order" card: vendor Select -> work order Select -> file input (pdf/image, client-side 500 KB guard) -> Upload. Shows the currently attached copy name.
- Sync preserves an admin-uploaded copy when the upstream portal has no attachment (both the purchase-department and bill-section branches).
- UPDATE: the work order detail page now has ONE download button ("Download Work Order") which serves the ORIGINAL copy (`/po-file`, upstream or admin-uploaded) and only falls back to the generated PDF when no copy exists. The separate "Original PO File" button was removed.
- The Live / Off-Air toggle now also exists in Admin Command Center -> Work Orders tab ("Vendor Visibility" column, testid admin-order-live-toggle-<po>), in addition to the Work Orders page row toggle and the bulk control.
- The WO copy upload card also supports MANUAL work order entry: "Enter manually" toggle -> type the WO number; it is matched (case-insensitive) against the selected vendor's work orders and shows "No work order with this number for the selected vendor" when it does not exist.

## Admin payment status / UTR maintenance
- `PATCH /api/bills/{id}/payment` {status, utr, paid_date?} — ADMIN ONLY (403 vendor, 404 unknown bill, 400 for a status outside pending/under_review/paid/rejected). Sets status, utr, payment_updated_by/at and auto-fills paid_date (Asia/Kolkata today) when marking paid; writes `bill_changes` alerts for status and UTR so the vendor's dashboard shows them.
- Bills list: admin rows carry a status dropdown + UTR input + Save button in the Status column; vendors just see the badge and the UTR text (read-only).
- Sync keeps a locally maintained payment (preserved when `utr` or `payment_updated_by` is set).
- Saving a bill payment also invalidates the `summary` and `work-orders` query keys, so the dashboard "Cleared Payments" / "Payment Pending" KPIs update immediately for admin and vendor (verified: 0.00 <-> 1.44 L both ways).

## Payments Register sync (Reports & Vouchers)
- Upstream `GET /api/payments` (Reports & Vouchers -> Payments Register) is synced after bills. Each voucher is matched to a bill by `billRefNo` == our `invoice_no`.
- Updates on the bill: `pv_no`, `payment_mode`, `payment_date`, `payment_status` (voucher status), `payment_approved_by`, `utr`, and `status` -> "paid" when a UTR exists (paid_date = voucher date), else "under_review". Status/UTR diffs are written to `bill_changes` so the vendor sees them in Recent Updates, and the dashboard Cleared/Pending KPIs follow.
- An admin's manual payment entry (`payment_updated_by`) is never overwritten by the register.
- Sync result + Admin Sync Log carry a `payments` column (vouchers applied).
- When a voucher releases payment, `status_label` is rewritten to "Paid · <mode> · <pvNo>" so the badge no longer shows the stale upstream "Added to Due List (Unpaid)" wording.

## Auto refresh from the workflow portal (data freshness fix)
- Problem: upstream data only landed here on the 1 AM cron or an admin's manual
  "Sync from Workflow Portal" click, so vendors/bills added during the day
  (e.g. AE0015/AE0016) were missing from the portal.
- `POST /api/sync/auto` (any signed-in user): single-flight (`asyncio.Lock`) +
  throttled to once per 3 minutes (`AUTO_SYNC_MIN_GAP`, checks the newest
  error-free `sync_runs` doc). Returns `{synced: bool, reason?}`; upstream
  failures are logged and returned as `synced:false`, never a 5xx.
- `frontend/src/lib/useAutoSync.js` -> called from `components/AppLayout.jsx`,
  so EVERY page open re-pulls upstream and invalidates summary / vendors /
  vendor / bills / work-orders / bill-changes / sync-status / sync-runs when
  something changed.
- `.emergent/crons.yml` `nightly-arun-sync` now runs **every 15 minutes**
  (`*/15 * * * *`) instead of once nightly.

## Duplicate vendorCode protection (wrong vendor data fix)
- The workflow portal can hold MORE THAN ONE record on the same `vendorCode`
  (a new vendor entered under an existing code before getting its own code).
  Our upsert is keyed on `code`, so the newest draft overwrote the real vendor —
  AE0001JV2627 (Annapurna Steels) showed PRAVEEN SINGH's details.
- `lib/arun.py#dedupe_vendors()` now keeps ONE record per code: the **oldest**
  upstream record (sorted by the epoch-ms suffix of its `id`) owns the code; the
  later duplicates are ignored and returned as `duplicate_vendors`
  [{vendor_code, firm_name, external_id}] in the sync result + `sync_runs`.
- Admin -> Sync Log has a red **Duplicate Codes** column listing them, so the
  duplicate can be cleaned up in the upstream portal.

## Payments Register mirror (Admin → Bills & Invoices)
- Every sync mirrors the upstream register (`GET /api/payments`, ERP → Accounts &
  Vouchers → Payment Vouchers & Due List → Payments Register) verbatim into the
  `payment_vouchers` collection: `pv_no`, `bill_ref_no`, `bill_no`, `vendor_code`,
  `vendor_name`, `amount`, `payment_date`, `utr_no`, `status`, `mode`, `source`,
  `approved_by`. Vouchers the register no longer has are deleted each sync.
- `GET /api/bills/payments-register` — admin sees all, a vendor only its own
  `vendor_code` rows, 401 unauthenticated.
- UI: Admin Command Center → Bills & Invoices tab now opens with a **Payments
  Register** card (GPV/PV No · Bill Ref No · Bill No · Vendor · Amount · Payment
  Date · UTR No · Current Status; green "Paid · <mode>" once a UTR exists),
  above the existing read-only bills table.
- Bills page table has a **Vendor** column (`vendor_name`) next to Invoice No.

## Payment Advice PDF
- `GET /api/bills/{id}/payment-advice` -> branded A4 PDF (lib/pdf.py `payment_advice_pdf`): PV No., UTR/Ref, payment date & mode, voucher status, invoice no/date, PO number, Paid To block (company, vendor code, bank, IFSC, account no, GSTIN), payment summary with taxable/GST/TDS/amount paid and the approver name.
- Access: own vendor or admin (403 cross-vendor); 400 when no UTR/PV exists yet; 404 unknown bill.
- UI: bill detail dialog shows a blue "Payment Advice" button next to "Download Invoice PDF", only when the bill has a UTR or PV number.
