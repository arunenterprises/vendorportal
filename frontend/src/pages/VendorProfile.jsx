import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Building2, Landmark } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm text-slate-900 mt-1.5 break-words ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function VendorProfileInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: vendor, isLoading, isError } = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => apiGet("/vendors/me"),
    retry: false,
    enabled: !isAdmin,
  });

  if (isAdmin) {
    return (
      <AppLayout title={t("nav_profile")} subtitle={t("admin_vendors")}>
        <Card className="p-10 bg-white border-slate-200 rounded-xl text-center" data-testid="vendor-profile-admin-note">
          <p className="text-slate-600 text-sm">
            Admin accounts have no vendor profile. Open the Admin Command Center to see the
            vendor directory fetched from the workflow portal.
          </p>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title={t("nav_profile")}
      subtitle={vendor?.company_name || t("read_only_note")}
      action={
        vendor && (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold"
            data-testid="vendor-verified-badge"
          >
            <BadgeCheck size={14} /> {t("verified")}
          </span>
        )
      }
    >
      {!vendor && (
        <Card className="p-12 text-center text-slate-400 bg-white border-slate-200" data-testid="vendor-profile-empty">
          {isLoading ? t("loading") : isError ? t("offline_note") : t("no_data")}
        </Card>
      )}

      {vendor && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6" data-testid="vendor-statutory-block">
          <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm h-fit">
            <div className="flex items-center gap-2 mb-5">
              <Building2 size={17} className="text-[#1D4ED8]" />
              <h2 className="text-base font-semibold text-slate-900">{t("company_name")}</h2>
            </div>
            <div className="grid grid-cols-2 gap-5">
              <Field label={t("company_name")} value={vendor.company_name} />
              <Field label={t("vendor_code")} value={vendor.code} mono />
              <Field label={t("gstin")} value={vendor.gstin} mono />
              <Field label={t("pan")} value={vendor.pan} mono />
              <Field label={t("contact_person")} value={vendor.contact_person} />
              <Field label={t("phone")} value={vendor.phone} />
              <Field label={t("email")} value={vendor.email} />
              <Field label={t("msme")} value={vendor.msme_no} mono />
              <Field label="Vendor Type" value={vendor.vendor_type} />
              <Field label="Site" value={vendor.site_name} />
              <Field label="City" value={vendor.city} />
              <Field label="State" value={vendor.state} />
              <Field label="Pincode" value={vendor.pincode} mono />
              <Field label="Project Code" value={vendor.project_code} mono />
              <div className="col-span-2">
                <Field label={t("address")} value={vendor.address} />
              </div>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm h-fit">
              <div className="flex items-center gap-2 mb-5">
                <Landmark size={17} className="text-[#1D4ED8]" />
                <h2 className="text-base font-semibold text-slate-900">{t("bank_details")}</h2>
              </div>
              <div className="grid grid-cols-2 gap-5">
                <Field label="Account Holder" value={vendor.account_holder} />
                <Field label={t("bank_name")} value={vendor.bank_name} />
                <Field label="Branch" value={vendor.branch_name} />
                <Field label={t("ifsc")} value={vendor.ifsc} mono />
                <Field label={t("account_no")} value={vendor.account_no} mono />
                <Field label="Account Type" value={vendor.account_type} />
                <Field label="Bank City" value={vendor.bank_city} />
                <Field label="Bank State" value={vendor.bank_state} />
                <div className="col-span-2">
                  <Field label="Bank Address" value={vendor.bank_address} />
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm h-fit" data-testid="vendor-approval-block">
              <h2 className="text-base font-semibold text-slate-900 mb-5">Registration & Approval</h2>
              <div className="grid grid-cols-2 gap-5">
                <Field label="Registration Date" value={vendor.creation_date} />
                <Field label="Approval Date" value={vendor.approval_date} />
                <Field label="Approved By" value={vendor.approved_by} />
                <Field label="Checked By" value={vendor.checked_by} />
                <Field label="Prepared By" value={vendor.prepared_by} />
                <Field label="Registration Expiry" value={vendor.expiry_date} />
                <Field label={t("status")} value={vendor.status} />
              </div>

              <p className="text-xs text-slate-400 mt-6 pt-5 border-t border-slate-100">
                {t("read_only_note")}
                {vendor.updated_at
                  ? ` · Last updated on the workflow portal: ${new Date(vendor.updated_at).toLocaleString("en-IN")}`
                  : ""}
              </p>
            </Card>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function VendorProfile() {
  return (
    <RequireAuth>
      <VendorProfileInner />
    </RequireAuth>
  );
}
