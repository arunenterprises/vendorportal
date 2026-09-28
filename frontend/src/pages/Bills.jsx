import { useMemo, useState } from "react";
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

const FILTERS = ["all", "pending", "under_review", "paid", "rejected"];

function BillsInner() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const bills = useQuery({ queryKey: ["bills"], queryFn: () => apiGet("/bills"), retry: false });

  const rows = useMemo(() => {
    const list = bills.isError ? [] : bills.data ?? [];
    const term = q.trim().toLowerCase();
    return list.filter((b) => {
      const matchStatus = filter === "all" || b.status === filter;
      const matchTerm =
        !term ||
        b.invoice_no.toLowerCase().includes(term) ||
        (b.po_number || "").toLowerCase().includes(term) ||
        (b.ref_no || "").toLowerCase().includes(term) ||
        (b.vendor_name || "").toLowerCase().includes(term);
      return matchStatus && matchTerm;
    });
  }, [bills.data, bills.isError, q, filter]);

  return (
    <AppLayout title={t("nav_bills")} subtitle={t("read_only_note")}>
      <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search")}
              data-testid="bills-search-input"
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`bills-filter-${f}`}
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
          <table className="w-full text-sm" data-testid="bills-table">
            <thead className="bg-slate-50 text-slate-500">
              <tr className="text-left">
                {["invoice_no", "ref_no", "po_number", "invoice_date", "taxable", "gst", "tds", "total", "status", "utr", "actions"].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-14 text-center text-slate-400" data-testid="bills-empty">
                    {bills.isLoading ? t("loading") : bills.isError ? t("offline_note") : t("no_data")}
                  </td>
                </tr>
              )}
              {rows.map((b) => (
                <tr
                  key={b.id}
                  className="border-t border-slate-100 hover:bg-slate-50/70 [transition:background-color_.18s_ease]"
                  data-testid={`bill-row-${b.invoice_no}`}
                >
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {b.invoice_no}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{b.ref_no || "—"}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-[#1D4ED8] whitespace-nowrap">{b.po_number}</td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{b.invoice_date}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{formatINR(b.taxable_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{formatINR(b.gst_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">-{formatINR(b.tds_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900">
                    {formatINR(b.total_amount)}
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={b.status} label={b.status_label} /></td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {b.utr || "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`download-bill-pdf-${b.invoice_no}`}
                      onClick={() => downloadFile(`/api/bills/${b.id}/pdf`, `${b.invoice_no}.pdf`)}
                      className="gap-1.5 whitespace-nowrap"
                    >
                      <Download size={14} /> PDF
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AppLayout>
  );
}

export default function Bills() {
  return (
    <RequireAuth>
      <BillsInner />
    </RequireAuth>
  );
}
