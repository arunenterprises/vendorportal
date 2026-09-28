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
- Max upload size: 100 KB (client-side check in Documents.jsx + server check in routers/documents.py).
- Download: ADMIN ONLY (`GET /api/documents/{id}/download` returns 403 for vendors). Vendors see only a delete action.

## Password Update
- `POST /api/auth/change-password` {current_password, new_password} for the signed-in user (min 6 chars).
- UI: `/change-password` page ("Update Password" in sidebar), available to both admin and vendor.
- Admin can still reset any user's password via `PATCH /api/users/{id}/password`.

## Admin documents view (updated)
- `GET /api/documents` now returns `vendor_code` + `vendor_name` (joined from vendors) so the admin table can show which vendor submitted each document.
- Admin view: full-width fixed-layout table (Vendor | Document Name | Type | Size | Uploaded | Download), single-line truncation, no upload card. Vendor view: upload card + delete only (no download).
