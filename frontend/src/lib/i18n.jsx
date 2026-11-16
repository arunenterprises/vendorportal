import { createContext, useContext } from "react";

const DICT = {
  app_name: { en: "Arun Enterprises Vendor Portal" },
  app_tagline: { en: "Our Quality Oriented Service's Is First Priority" },
  company_addr: { en: "209H/1F/1, Ops Nagar, Kalindipuram, Prayagraj, UP 211011" },
  toll_free: { en: "Toll Free" },
  sync_arun: { en: "Sync from ERP Portal" },
  syncing: { en: "Syncing…" },
  sync_done: { en: "Synced from Arun workflow portal" },
  sync_failed: { en: "Could not reach the workflow portal" },
  linked_records: { en: "Linked from Workflow Portal" },
  source_linked: { en: "Workflow Portal" },
  ref_no: { en: "Ref No." },
  bill_no: { en: "Bill No." },
  nav_dashboard: { en: "Dashboard" },
  nav_work_orders: { en: "Work Orders" },
  nav_bills: { en: "Bills & Invoices" },
  nav_profile: { en: "Vendor Details" },
  nav_documents: { en: "Compliance & Docs" },
  nav_admin: { en: "Admin Command Center" },

  login_brand_heading: { en: "Vendor Portal FOR ARUN ENTERPRISES" },
  vendor_code_or_email: { en: "Vendor Code / Email" },
  vendor_code_hint: { en: "Vendors: your vendor code is both your login ID and password." },
  nav_users: { en: "Portal Users" },
  users_note: { en: "Logins are the only records created in this portal. All vendor, work order and bill data is fetched from the workflow portal." },
  read_only_note: { en: "Fetched from the Arun workflow portal — read only." },
  admin_subtitle: { en: "Create portal logins and review data fetched from the workflow portal" },
  create_user: { en: "Create User" },
  create_user_hint: { en: "Pick a synced vendor code; the code becomes the login ID and password." },
  user_created: { en: "Portal user created" },
  user_create_failed: { en: "Could not create user" },
  user_deleted: { en: "User deleted" },
  password_reset_done: { en: "Password updated" },
  vendor_code_required: { en: "Select a vendor code" },
  password_required_admin: { en: "An admin user needs a password" },
  select_vendor: { en: "Select vendor" },
  reset_password: { en: "Reset Password" },
  new_password: { en: "New password" },
  role: { en: "Role" },
  optional: { en: "optional" },
  login_title: { en: "Sign in to your portal" },
  login_sub: { en: "Access work orders, invoices and payment status in one place." },
  email: { en: "Email address" },
  password: { en: "Password" },
  sign_in: { en: "Sign In" },
  signing_in: { en: "Signing in…" },
  logout: { en: "Log out" },
  demo_logins: { en: "Demo one-click logins" },
  demo_vendor: { en: "Vendor: Premier Industrial" },
  demo_admin: { en: "Admin: Procurement Officer" },
  login_failed: { en: "Invalid vendor code / email or password — vendors: use your vendor code as BOTH the ID and the password" },
  welcome_back: { en: "Welcome back" },

  stat_total_billed: { en: "Total Billed Amount" },
  stat_pending: { en: "Payment Pending" },
  stat_cleared: { en: "Cleared Payments" },
  stat_active_orders: { en: "Active Work Orders" },
  recent_bills: { en: "Recent Invoices" },
  active_work: { en: "Ongoing Work Orders" },

  po_number: { en: "PO Number" },
  title: { en: "Title" },
  vendor: { en: "Vendor" },
  value: { en: "Order Value" },
  status: { en: "Status" },
  due_date: { en: "Due Date" },
  issued_date: { en: "Issued Date" },
  progress: { en: "Milestones" },
  actions: { en: "Actions" },
  view: { en: "View" },
  scope: { en: "Scope of Work" },
  boq: { en: "Bill of Quantities" },
  description: { en: "Description" },
  qty: { en: "Qty" },
  rate: { en: "Rate" },
  amount: { en: "Amount" },
  back: { en: "Back" },

  invoice_no: { en: "Invoice No." },
  invoice_date: { en: "Invoice Date" },
  taxable: { en: "Taxable Value" },
  gst: { en: "GST" },
  tds: { en: "TDS" },
  total: { en: "Invoice Total" },
  utr: { en: "UTR / Ref" },
  paid_date: { en: "Paid On" },
  remarks: { en: "Remarks" },
  download_pdf: { en: "Download PDF" },
  download_po: { en: "Download Work Order" },
  submit_bill: { en: "Submit New Bill" },
  submit: { en: "Submit" },
  cancel: { en: "Cancel" },
  save: { en: "Save Changes" },

  status_pending: { en: "Pending Approval" },
  status_under_review: { en: "Under Finance Review" },
  status_paid: { en: "Paid / Settled" },
  status_rejected: { en: "Revision Needed" },
  status_active: { en: "Active" },
  status_completed: { en: "Completed" },
  status_on_hold: { en: "On Hold" },
  all: { en: "All" },

  company_name: { en: "Company Name" },
  contact_person: { en: "Contact Person" },
  phone: { en: "Phone" },
  gstin: { en: "GSTIN" },
  pan: { en: "PAN" },
  msme: { en: "MSME / Udyam No." },
  address: { en: "Registered Address" },
  bank_details: { en: "Bank Details" },
  bank_name: { en: "Bank Name" },
  account_no: { en: "Account Number" },
  ifsc: { en: "IFSC Code" },
  vendor_code: { en: "Vendor Code" },
  verified: { en: "KYC Verified" },
  profile_saved: { en: "Vendor details updated" },

  upload_doc: { en: "Upload Document" },
  doc_name: { en: "Document Name" },
  doc_type: { en: "Document Type" },
  choose_file: { en: "Choose File" },
  uploaded_on: { en: "Uploaded On" },
  size: { en: "Size" },
  download: { en: "Download" },
  delete: { en: "Delete" },
  no_docs: { en: "No compliance documents uploaded yet." },
  doc_uploaded: { en: "Document uploaded" },
  doc_deleted: { en: "Document deleted" },

  admin_vendors: { en: "Vendor Directory" },
  admin_new_vendor: { en: "Add Vendor" },
  admin_new_po: { en: "Issue Work Order" },
  admin_review: { en: "Invoice Approvals" },
  approve_pay: { en: "Mark Paid" },
  set_review: { en: "Send to Review" },
  reject: { en: "Reject" },
  update_status: { en: "Update Payment Status" },
  status_updated: { en: "Payment status updated" },
  vendor_created: { en: "Vendor created with portal login" },
  po_created: { en: "Work order issued" },
  bill_created: { en: "Invoice submitted for approval" },

  no_data: { en: "No records to display yet." },
  loading: { en: "Loading…" },
  offline_note: { en: "Live data unavailable right now." },
  search: { en: "Search…" },
  select_wo: { en: "Select Work Order" },
  gst_rate: { en: "GST Rate (%)" },
  role_admin: { en: "Administrator" },
  role_vendor: { en: "Vendor" },
  required_fields: { en: "Please fill all required fields" },
};

// English-only portal: `t` resolves the English copy for every key.
const translate = (key) => DICT[key]?.en ?? key;

const I18nContext = createContext({ t: translate });

export function I18nProvider({ children }) {
  return <I18nContext.Provider value={{ t: translate }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

export function formatINR(value) {
  const n = Number(value || 0);
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

// Dates everywhere in the UI read dd/mm/yyyy (Indian convention).
export function formatDMY(value) {
  if (!value) return "";
  const raw = String(value).slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB");
}

export function formatCompactINR(value) {  const n = Number(value || 0);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  return formatINR(n);
}
