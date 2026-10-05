import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Save, Search } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import StatusBadge from "@/components/StatusBadge";
import PaymentTimeline from "@/components/PaymentTimeline";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPatch } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatINR, useI18n } from "@/lib/i18n";

const FILTERS = ["all", "pending", "under_review", "paid", "rejected"];

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm text-slate-900 mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>
        {value === 0 ? "0" : value || "—"}
      </p>
    </div>
  );
}

function BillsInner() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState({});
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const qc = useQueryClient();

  const savePayment = useMutation({
    mutationFn: ({ id, status, utr }) => apiPatch(`/bills/${id}/payment`, { status, utr }),
    onSuccess: (bill) => {
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["summary"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["bill-changes"] });
      setDraft((d) => { const n = { ...d }; delete n[bill.id]; return n; });
      toast.success(`Payment details saved for ${bill.invoice_no}`);
    },
    onError: (e) => toast.error(e.message || "Could not save payment details"),
  });

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
    <AppLayout
      title={t("nav_bills")}
      subtitle="Live mirror of the workflow portal — open any invoice to see its full approval and final-release details."
    >
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
                {["invoice_no", "bill_no", "po_number", "invoice_date", "taxable", "gst", "tds", "total", "status", "actions"].map((h) => (
                  <th key={h} className="px-4 py-3 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">
                    {h === "bill_no" ? "Bill No" : t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-14 text-center text-slate-400" data-testid="bills-empty">
                    {bills.isLoading ? t("loading") : bills.isError ? t("offline_note") : t("no_data")}
                  </td>
                </tr>
              )}
              {rows.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setOpen(b)}
                  className="border-t border-slate-100 hover:bg-slate-50/70 cursor-pointer [transition:background-color_.18s_ease]"
                  data-testid={`bill-row-${b.invoice_no}`}
                >
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                    {b.invoice_no}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">{b.bill_no || "—"}</td>
                  <td className="px-4 py-3.5 font-mono text-xs text-[#1D4ED8] whitespace-nowrap">{b.po_number}</td>
                  <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{b.invoice_date}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{formatINR(b.taxable_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{formatINR(b.gst_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">-{formatINR(b.tds_amount)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900">
                    {formatINR(b.total_amount)}
                  </td>
                  <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <StatusBadge status={b.status} label={b.status_label} />
                    {isAdmin ? (
                      <div className="mt-2 flex flex-col gap-1.5 min-w-[190px]">
                        <select
                          value={draft[b.id]?.status ?? b.status}
                          onChange={(e) => setDraft({ ...draft, [b.id]: { ...(draft[b.id] || { utr: b.utr || "" }), status: e.target.value } })}
                          data-testid={`bill-status-select-${b.invoice_no}`}
                          className="text-[11px] border border-slate-200 rounded-md px-1.5 py-1 bg-white text-slate-700
                            focus:outline-none focus:ring-1 focus:ring-[#1D4ED8] [transition:border-color_.18s_ease]"
                        >
                          <option value="pending">Pending</option>
                          <option value="under_review">Under Review</option>
                          <option value="paid">Paid</option>
                          <option value="rejected">Rejected</option>
                        </select>
                        <Input
                          value={draft[b.id]?.utr ?? b.utr ?? ""}
                          onChange={(e) => setDraft({ ...draft, [b.id]: { ...(draft[b.id] || { status: b.status }), utr: e.target.value } })}
                          placeholder="UTR / reference no."
                          data-testid={`bill-utr-input-${b.invoice_no}`}
                          className="h-7 text-[11px]"
                        />
                        <Button
                          size="sm"
                          data-testid={`bill-payment-save-${b.invoice_no}`}
                          disabled={savePayment.isPending}
                          onClick={() =>
                            savePayment.mutate({
                              id: b.id,
                              status: draft[b.id]?.status ?? b.status,
                              utr: draft[b.id]?.utr ?? b.utr ?? "",
                            })
                          }
                          className="h-7 gap-1.5 text-[11px] bg-[#1D4ED8] hover:bg-[#1E40AF] text-white
                            active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
                        >
                          <Save size={12} /> Save
                        </Button>
                      </div>
                    ) : b.utr ? (
                      <p className="text-[11px] text-slate-500 mt-1 font-mono">{b.utr}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`download-bill-pdf-${b.invoice_no}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(`/api/bills/${b.id}/pdf`, `${b.invoice_no}.pdf`);
                      }}
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

      {/* Full mirror of the workflow portal's bill + final-release record */}
      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="bg-white sm:max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.invoice_no}</DialogTitle>
            <DialogDescription>
              {open?.vendor_name} · Bill No {open?.bill_no || "—"}
            </DialogDescription>
          </DialogHeader>

          {open && (
            <div className="space-y-6" data-testid="bill-detail-panel">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Field label="Ref No" value={open.ref_no} mono />
                <Field label="Work Order No" value={open.po_number} mono />
                <Field label="Project / Location" value={open.project_code} />
                <Field label="Bill Date" value={open.invoice_date} />
                <Field label="Process Date" value={open.process_date} />
                <Field label="Due Date" value={open.due_date} />
                <Field label="Scheduled Due Date" value={open.scheduled_due_date} />
                <Field label="Priority" value={open.priority_level} />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Amounts</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Quantity" value={`${open.quantity || 0} ${open.uom || ""}`} />
                  <Field label="Basic Amount" value={formatINR(open.taxable_amount)} />
                  <Field label={`GST (${open.gst_rate}%)`} value={formatINR(open.gst_amount)} />
                  <Field label={`TDS (${open.tds_rate}%)`} value={`-${formatINR(open.tds_amount)}`} />
                  <Field label="Other Deductions" value={`-${formatINR(open.other_deductions)}`} />
                  <Field label="Previous Advance" value={`-${formatINR(open.previous_advance)}`} />
                  <Field label="Payable Total" value={formatINR(open.total_amount)} />
                  <Field label="Payment Mode" value={open.payment_mode} />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Verification & Final Release</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Measurement" value={open.measurement_status} />
                  <Field label="WO Rate Check" value={open.wo_rate_status} />
                  <Field label="GST / TDS Check" value={open.gst_tds_check} />
                  <Field label="Approval Status" value={open.approval_status} />
                  <Field label="Final Release" value={open.final_release_status} />
                  <Field label="Approval Date" value={open.approval_date} />
                  <Field label="Approver" value={open.approver_name} />
                  <Field label="Account Incharge" value={open.account_incharge} />
                  <Field label="Purchase Incharge" value={open.purchase_incharge} />
                  <Field label="Site Incharge" value={open.site_incharge} />
                  <Field label="UTR" value={open.utr} mono />
                <Field label="PV No." value={open.pv_no} mono />
                <Field label="Payment Mode" value={open.payment_mode} />
                <Field label="Payment Date" value={open.payment_date} />
                <Field label="Voucher Status" value={open.payment_status} />
                <Field label="Payment Approved By" value={open.payment_approved_by} />
                  <Field label="Paid Date" value={open.paid_date} />
                </div>
                {open.todo_notes && (
                  <p className="text-xs text-slate-500 mt-4">Notes: {open.todo_notes}</p>
                )}
              </div>

              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Payment Timeline</h3>
                <PaymentTimeline bill={open} />
              </div>

              {(open.items || []).length > 0 && (
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Line Items</h3>
                  <table className="w-full text-xs" data-testid="bill-detail-items">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr className="text-left">
                        {["Description", "Category", "HSN", "WO Qty", "Billed Qty", "Unit", "Rate"].map((h) => (
                          <th key={h} className="px-3 py-2 font-semibold uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {open.items.map((it, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-800">{it.description}</td>
                          <td className="px-3 py-2 text-slate-600">{it.category_scope || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{it.hsn || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{it.qty}</td>
                          <td className="px-3 py-2 text-slate-700">{it.billed_qty}</td>
                          <td className="px-3 py-2 text-slate-600">{it.unit || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{formatINR(it.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
                <Button
                  variant="outline"
                  data-testid="bill-detail-download"
                  onClick={() => downloadFile(`/api/bills/${open.id}/pdf`, `${open.invoice_no}.pdf`)}
                  className="gap-2"
                >
                  <Download size={15} /> Download Invoice PDF
                </Button>
                {open.utr || open.pv_no ? (
                  <Button
                    data-testid="bill-payment-advice-button"
                    onClick={() =>
                      downloadFile(`/api/bills/${open.id}/payment-advice`, `Payment Advice ${open.invoice_no}.pdf`)
                    }
                    className="gap-2 bg-[#1D4ED8] hover:bg-[#1E40AF] text-white active:scale-[0.98]
                      [transition:background-color_.18s_ease,transform_.1s_ease]"
                  >
                    <Download size={15} /> Payment Advice
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
