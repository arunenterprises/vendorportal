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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatDMY, formatINR, useI18n } from "@/lib/i18n";

const FILTERS = ["all", "active", "completed", "on_hold"];

function WorkOrdersInner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [bulkVendor, setBulkVendor] = useState("");

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

  const bulkLive = useMutation({
    mutationFn: ({ vendorId, live }) => apiPatch("/work-orders/visibility/bulk", { vendor_id: vendorId, live }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      toast.success(`${res.updated} work order(s) ${res.live ? "are now live" : "taken off-air"}`);
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

  const vendorOptions = useMemo(() => {
    const m = new Map();
    for (const o of all) {
      const cur = m.get(o.vendor_id) || { id: o.vendor_id, name: o.vendor_name || o.vendor_code, count: 0 };
      cur.count += 1;
      m.set(o.vendor_id, cur);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  const counts = useMemo(() => {    const out = {};
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
          {isAdmin ? (
            <span className="ml-4 inline-flex flex-wrap items-center gap-2">
              <Select value={bulkVendor} onValueChange={setBulkVendor}>
                <SelectTrigger
                  data-testid="bulk-live-vendor-select"
                  className="h-7 w-[260px] text-xs bg-white"
                >
                  <SelectValue placeholder="Select vendor for bulk action…">
                    {vendorOptions.find((v) => v.id === bulkVendor)
                      ? `${vendorOptions.find((v) => v.id === bulkVendor).name} (${vendorOptions.find((v) => v.id === bulkVendor).count})`
                      : "Select vendor for bulk action…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vendorOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      {`${v.name} (${v.count})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkVendor || bulkLive.isPending}
                data-testid="bulk-live-on-button"
                onClick={() => bulkLive.mutate({ vendorId: bulkVendor, live: true })}
                className="h-7 gap-1.5 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              >
                <Eye size={13} /> All Live
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkVendor || bulkLive.isPending}
                data-testid="bulk-live-off-button"
                onClick={() => bulkLive.mutate({ vendorId: bulkVendor, live: false })}
                className="h-7 gap-1.5 text-xs text-slate-600 border-slate-200"
              >
                <EyeOff size={13} /> All Off-Air
              </Button>
            </span>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed min-w-[1120px]" data-testid="work-orders-table">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[20%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead className="bg-slate-50 text-slate-500">
              <tr className="text-left">
                {["po_number", "title", "value", "progress", "due_date", "status", "actions"].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-3 font-semibold text-[11px] uppercase tracking-wide ${h === "value" ? "text-right" : ""}`}
                  >
                    {t(h)}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wide">
                  Billed / Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center text-slate-400" data-testid="work-orders-empty">
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
                    <td className="px-3 py-3 align-top">
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
                          title="Auto from the workflow portal's purchase department — approve the work order there to change this. Here you can only change status or Live/Off-air."
                        >
                          {o.approved ? "Approved WO" : "WO in process"}
                        </span>
                      ) : null}
                      {isAdmin && o.possible_duplicate ? (
                        <span
                          className="block mt-1 text-[10px] uppercase tracking-wide text-red-700 font-semibold"
                          data-testid={`work-order-duplicate-${o.po_number}`}
                          title="Same vendor and same order value — check if this work order was entered twice, then take one off-air"
                        >
                          Possible duplicate
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top overflow-hidden">
                      <p className="text-slate-900 truncate" title={o.title}>{o.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate" title={o.vendor_name}>{o.vendor_name}</p>
                    </td>
                    <td className="px-3 py-3 align-top text-right whitespace-nowrap font-medium text-slate-900">
                      {formatINR(o.value)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1D4ED8] rounded-full [transition:width_.3s_ease]"
                          style={{ width: `${o.stages_total ? Math.round((o.stages_done / o.stages_total) * 100) : pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {o.stages_total ? `${o.stages_done}/${o.stages_total}` : `${done}/${total}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top whitespace-nowrap text-slate-600 text-xs">{formatDMY(o.due_date)}</td>
                    <td className="px-3 py-3 align-top overflow-hidden">
                      <div className="max-w-full truncate" title={o.status_label || o.status}>
                        <StatusBadge status={o.status} />
                      </div>
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
                          className="mt-1.5 w-full text-[11px] border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-700
                            hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-[#1D4ED8]
                            [transition:border-color_.18s_ease]"
                        >
                          <option value="active">Active</option>
                          <option value="completed">Closed</option>
                          <option value="on_hold">On Hold</option>
                        </select>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid={`download-work-order-${o.po_number}`}
                        onClick={() => downloadFile(`/api/work-orders/${o.id}/po-file`, o.po_file_name || `${o.po_number}.pdf`)}
                        disabled={!o.has_po_file}
                        className="h-8 w-full gap-1.5 px-2 text-xs whitespace-nowrap"
                      >
                        <Download size={13} /> Work Order
                      </Button>
                      {isAdmin ? (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`work-order-live-toggle-${o.po_number}`}
                          onClick={() => setLive.mutate({ id: o.id, live: o.live === false })}
                          className={`mt-1.5 h-8 w-full gap-1.5 px-2 text-xs whitespace-nowrap ${
                            o.live === false
                              ? "text-slate-600 border-slate-200"
                              : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                          }`}
                        >
                          {o.live === false ? <EyeOff size={13} /> : <Eye size={13} />}
                          {o.live === false ? "Unlive" : "Live"}
                        </Button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 align-top" data-testid={`work-order-bill-match-${o.po_number}`}>
                      <p className="text-slate-900 whitespace-nowrap">{formatINR(o.billed_amount || 0)}</p>
                      <p className="text-[11px] text-slate-500">
                        {o.bills_count || 0} bill{(o.bills_count || 0) === 1 ? "" : "s"} · Balance{" "}
                        <span className={(o.balance_value || 0) <= 0 ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>
                          {formatINR(o.balance_value || 0)}
                        </span>
                      </p>
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
