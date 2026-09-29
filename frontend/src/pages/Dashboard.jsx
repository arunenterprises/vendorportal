import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Banknote, FileText, IndianRupee, Wallet } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import StatusBadge from "@/components/StatusBadge";
import RequireAuth from "@/components/RequireAuth";
import ChangeAlerts from "@/components/ChangeAlerts";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import { formatCompactINR, formatINR, useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/useAuth";

const KPIS = [
  { key: "total_billed", labelKey: "stat_total_billed", icon: IndianRupee, tone: "text-slate-900" },
  { key: "pending_payment", labelKey: "stat_pending", icon: Wallet, tone: "text-amber-700" },
  { key: "cleared_payment", labelKey: "stat_cleared", icon: Banknote, tone: "text-emerald-700" },
];

function DashboardInner() {
  const { t } = useI18n();
  const { user } = useAuth();

  // vendors are identified by their FIRM, not the contact person
  const vendorQ = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: () => apiGet("/vendors/me"),
    retry: false,
    enabled: user?.role === "vendor",
  });
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => apiGet("/summary"), retry: false });
  const bills = useQuery({ queryKey: ["bills"], queryFn: () => apiGet("/bills"), retry: false });
  const orders = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => apiGet("/work-orders"),
    retry: false,
  });

  const s = summary.isError ? null : summary.data;
  const billRows = (bills.isError ? [] : bills.data ?? []).slice(0, 5);
  const orderRows = (orders.isError ? [] : orders.data ?? []).filter((o) => o.status === "active").slice(0, 4);

  return (
    <AppLayout
      title={`${t("nav_dashboard")}`}
      subtitle={
        user?.role === "vendor"
          ? [vendorQ.data?.company_name || user?.name, vendorQ.data?.code].filter(Boolean).join(" · ")
          : user
            ? `${user.name} · ${t("role_admin")}`
            : ""
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {KPIS.map((k) => (
          <Card
            key={k.key}
            data-testid={`kpi-card-${k.key}`}
            className="p-5 bg-white border-slate-200 rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-md [transition:transform_.2s_ease,box-shadow_.2s_ease]"
          >
            <div className="flex items-start justify-between">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-semibold leading-snug">
                {t(k.labelKey)}
              </p>
              <k.icon size={17} className="text-slate-400 shrink-0" />
            </div>
            <p className={`text-[26px] font-semibold mt-3 ${k.tone}`} data-testid={`kpi-value-${k.key}`}>
              {s ? formatCompactINR(s[k.key]) : "—"}
            </p>
          </Card>
        ))}
        <Card
          data-testid="kpi-card-active_orders"
          className="p-5 bg-[#0B132B] border-[#0B132B] rounded-xl shadow-sm hover:-translate-y-0.5 hover:shadow-md [transition:transform_.2s_ease,box-shadow_.2s_ease]"
        >
          <div className="flex items-start justify-between">
            <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold leading-snug">
              {t("stat_active_orders")}
            </p>
            <FileText size={17} className="text-blue-400 shrink-0" />
          </div>
          <p className="text-[26px] font-semibold mt-3 text-white" data-testid="kpi-value-active_orders">
            {s ? s.active_orders : "—"}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
        <div className="space-y-6">
          <ChangeAlerts />
          <Card className="bg-white border-slate-200 rounded-xl shadow-sm overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t("recent_bills")}</h2>
            <Link
              to="/bills"
              data-testid="dashboard-all-bills-link"
              className="text-xs font-semibold text-[#1D4ED8] inline-flex items-center gap-1 hover:underline"
            >
              {t("nav_bills")} <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="dashboard-bills-table">
              <thead className="bg-slate-50 text-slate-500">
                <tr className="text-left">
                  <th className="px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">{t("invoice_no")}</th>
                  <th className="px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">{t("total")}</th>
                  <th className="px-5 py-2.5 font-semibold text-xs uppercase tracking-wide">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {billRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-slate-400" data-testid="dashboard-bills-empty">
                      {bills.isLoading ? t("loading") : t("no_data")}
                    </td>
                  </tr>
                )}
                {billRows.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100" data-testid={`dashboard-bill-row-${b.invoice_no}`}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-800">{b.invoice_no}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{formatINR(b.total_amount)}</td>
                    <td className="px-5 py-3"><StatusBadge status={b.status} label={b.status_label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Card>
        </div>

        <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">{t("active_work")}</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {orderRows.length === 0 && (
              <p className="px-5 py-10 text-center text-slate-400 text-sm" data-testid="dashboard-orders-empty">
                {orders.isLoading ? t("loading") : t("no_data")}
              </p>
            )}
            {orderRows.map((o) => {
              const done = (o.milestones || []).filter((m) => m.done).length;
              const total = (o.milestones || []).length || 1;
              const pct = Math.round((done / total) * 100);
              return (
                <Link
                  key={o.id}
                  to={`/work-orders/${o.id}`}
                  data-testid={`dashboard-order-row-${o.po_number}`}
                  className="block px-5 py-4 hover:bg-slate-50 [transition:background-color_.18s_ease]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-[#1D4ED8]">{o.po_number}</span>
                    <span className="text-xs text-slate-500">{formatCompactINR(o.value)}</span>
                  </div>
                  <p className="text-sm text-slate-800 mt-1.5 line-clamp-2">{o.title}</p>
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#1D4ED8] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    {done}/{(o.milestones || []).length} {t("progress")}
                  </p>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Dashboard() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}
