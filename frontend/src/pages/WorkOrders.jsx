import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import StatusBadge from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatINR, useI18n } from "@/lib/i18n";

const FILTERS = ["all", "active", "completed", "on_hold"];

function WorkOrdersInner() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => apiGet("/work-orders"),
    retry: false,
  });

  const rows = useMemo(() => {
    const list = isError ? [] : data ?? [];
    const term = q.trim().toLowerCase();
    return list.filter((o) => {
      const matchStatus = filter === "all" || o.status === filter;
      const matchTerm =
        !term ||
        o.po_number.toLowerCase().includes(term) ||
        o.title.toLowerCase().includes(term) ||
        (o.vendor_name || "").toLowerCase().includes(term);
      return matchStatus && matchTerm;
    });
  }, [data, isError, q, filter]);

  return (
    <AppLayout title={t("nav_work_orders")} subtitle={t("login_sub")}>
      <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search")}
              data-testid="work-orders-search-input"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`work-orders-filter-${f}`}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border [transition:background-color_.18s_ease,border-color_.18s_ease]
                  ${filter === f
                    ? "bg-[#0B132B] text-white border-[#0B132B]"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {f === "all" ? t("all") : t(`status_${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="work-orders-table">
            <thead className="bg-slate-50 text-slate-500">
              <tr className="text-left">
                {["po_number", "title", "value", "progress", "due_date", "status", "actions"].map((h) => (
                  <th key={h} className="px-5 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center text-slate-400" data-testid="work-orders-empty">
                    {isLoading ? t("loading") : isError ? t("offline_note") : t("no_data")}
                  </td>
                </tr>
              )}
              {rows.map((o) => {
                const done = (o.milestones || []).filter((m) => m.done).length;
                const total = (o.milestones || []).length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <tr
                    key={o.id}
                    className="border-t border-slate-100 hover:bg-slate-50/70 [transition:background-color_.18s_ease]"
                    data-testid={`work-order-row-${o.po_number}`}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/work-orders/${o.id}`}
                        className="font-mono text-xs text-[#1D4ED8] font-semibold hover:underline"
                        data-testid={`work-order-link-${o.po_number}`}
                      >
                        {o.po_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 max-w-[320px]">
                      <p className="text-slate-900 line-clamp-1">{o.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{o.vendor_name}</p>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap font-medium text-slate-900">
                      {formatINR(o.value)}
                    </td>
                    <td className="px-5 py-3.5 min-w-[120px]">
                      <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#1D4ED8] rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-400">{done}/{total}</span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">{o.due_date}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={o.status} /></td>
                    <td className="px-5 py-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`download-work-order-${o.po_number}`}
                        onClick={() => downloadFile(`/api/work-orders/${o.id}/pdf`, `${o.po_number}.pdf`)}
                        className="gap-1.5 whitespace-nowrap"
                      >
                        <Download size={14} /> PDF
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </AppLayout>
  );
}

export default function WorkOrders() {
  return (
    <RequireAuth>
      <WorkOrdersInner />
    </RequireAuth>
  );
}
