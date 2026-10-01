import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, EyeOff, Search } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import StatusBadge from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatINR, useI18n } from "@/lib/i18n";

const FILTERS = ["all", "active", "completed", "on_hold"];

function WorkOrdersInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const setStatus = useMutation({
    mutationFn: ({ id, status }) => apiPatch(`/work-orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success("Work order status updated");
    },
    onError: (e) => toast.error(e.message || "Could not update status"),
  });

  const setLive = useMutation({
    mutationFn: ({ id, live }) => apiPatch(`/work-orders/${id}/visibility`, { live }),
    onSuccess: (wo) => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success(wo.live ? "Work order is live for the vendor" : "Work order taken off-air");
    },
    onError: (e) => toast.error(e.message || "Could not update visibility"),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["work-orders"],
    queryFn: () => apiGet("/work-orders"),
    retry: false,
  });

  const all = useMemo(() => {
    const list = isError ? [] : data ?? [];
    // one row per PO number, even when several bills share the same work order
    const seen = new Map();
    for (const o of list) if (!seen.has(o.po_number)) seen.set(o.po_number, o);
    return [...seen.values()];
  }, [data, isError]);

  const counts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) {
      const list = f === "all" ? all : all.filter((o) => o.status === f);
      out[f] = { count: list.length, value: list.reduce((s, o) => s + (o.value || 0), 0) };
    }
    return out;
  }, [all]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((o) => {
      const matchStatus = filter === "all" || o.status === filter;
      const matchTerm =
        !term ||
        o.po_number.toLowerCase().includes(term) ||
        o.title.toLowerCase().includes(term) ||
        (o.vendor_name || "").toLowerCase().includes(term);
      return matchStatus && matchTerm;
    });
  }, [all, q, filter]);

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
                {f === "all" ? t("all") : t(`status_${f}`)} ({counts[f]?.count ?? 0})
              </button>
            ))}
          </div>
        </div>

        <div
          className="px-5 py-2.5 border-b border-slate-100 bg-slate-50/60 text-xs text-slate-600"
          data-testid="work-orders-summary"
        >
          <span className="font-semibold text-slate-900">
            {filter === "all" ? t("all") : t(`status_${filter}`)}
          </span>{" "}
          · {rows.length} work order{rows.length === 1 ? "" : "s"} · Total value{" "}
          <span className="font-semibold text-slate-900">
            {formatINR(rows.reduce((s, o) => s + (o.value || 0), 0))}
          </span>
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
                      {o.origin === "purchase_department" ? (
                        <span
                          className={`block mt-1 text-[10px] uppercase tracking-wide font-semibold ${
                            o.approved ? "text-emerald-700" : "text-amber-700"
                          }`}
                          data-testid={`work-order-origin-${o.po_number}`}
                        >
                          {o.approved ? "Approved WO" : "WO in process"}
                        </span>
                      ) : null}
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
                        <div
                          className="h-full bg-[#1D4ED8] rounded-full [transition:width_.3s_ease]"
                          style={{ width: `${o.stages_total ? Math.round((o.stages_done / o.stages_total) * 100) : pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {o.stages_total ? `${o.stages_done}/${o.stages_total}` : `${done}/${total}`}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-slate-600">{o.due_date}</td>
                    <td className="px-5 py-3.5 min-w-[150px]">
                      <StatusBadge status={o.status} />
                      {o.wo_auto_status || o.expired ? (
                        <p className="text-[11px] text-slate-600 mt-1" data-testid={`work-order-status-label-${o.po_number}`}>
                          {o.expired ? "WO expired" : o.wo_auto_status}
                        </p>
                      ) : null}
                      {isAdmin ? (
                        <select
                          value={o.status}
                          onChange={(e) => setStatus.mutate({ id: o.id, status: e.target.value })}
                          data-testid={`work-order-status-select-${o.po_number}`}
                          className="mt-1.5 text-[11px] border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-700
                            hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]
                            [transition:border-color_.18s_ease]"
                        >
                          <option value="active">Active</option>
                          <option value="completed">Closed</option>
                          <option value="on_hold">On Hold</option>
                        </select>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`download-work-order-${o.po_number}`}
                        onClick={() => downloadFile(`/api/work-orders/${o.id}/po-file`, o.po_file_name || `${o.po_number}.pdf`)}
                        disabled={!o.has_po_file}
                        className="gap-1.5 whitespace-nowrap"
                      >
                        <Download size={14} /> Work Order
                      </Button>
                      {isAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`work-order-live-toggle-${o.po_number}`}
                          onClick={() => setLive.mutate({ id: o.id, live: o.live === false })}
                          className={`mt-1.5 gap-1.5 whitespace-nowrap ${
                            o.live === false
                              ? "text-slate-600 border-slate-200"
                              : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          }`}
                        >
                          {o.live === false ? <EyeOff size={14} /> : <Eye size={14} />}
                          {o.live === false ? "Unlive" : "Live"}
                        </Button>
                      ) : null}
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
