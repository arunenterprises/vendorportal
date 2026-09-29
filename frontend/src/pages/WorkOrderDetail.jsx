import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, Download } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/RequireAuth";
import StatusBadge from "@/components/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { downloadFile } from "@/lib/download";
import { formatINR, useI18n } from "@/lib/i18n";

function Field({ label, value, mono }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold">{label}</p>
      <p className={`text-sm text-slate-900 mt-1 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function WorkOrderDetailInner() {
  const { id } = useParams();
  const { t } = useI18n();
  const { data: wo, isLoading, isError } = useQuery({
    queryKey: ["work-order", id],
    queryFn: () => apiGet(`/work-orders/${id}`),
    retry: false,
  });

  return (
    <AppLayout
      title={wo ? wo.po_number : t("nav_work_orders")}
      subtitle={wo ? wo.title : ""}
      action={
        wo && (
          <div className="flex flex-wrap gap-2">
            {wo.has_po_file && (
              <Button
                variant="outline"
                data-testid="work-order-po-file-button"
                onClick={() => downloadFile(`/api/work-orders/${wo.id}/po-file`, wo.po_file_name || `${wo.po_number}.pdf`)}
                className="gap-2"
              >
                <Download size={15} /> Original PO File
              </Button>
            )}
            <Button
              data-testid="work-order-detail-download-button"
              onClick={() => downloadFile(`/api/work-orders/${wo.id}/pdf`, `${wo.po_number}.pdf`)}
              className="bg-[#1D4ED8] hover:bg-[#1E40AF] text-white gap-2 active:scale-[0.98] [transition:background-color_.18s_ease,transform_.1s_ease]"
            >
              <Download size={15} /> {t("download_po")}
            </Button>
          </div>
        )
      }
    >
      <Link
        to="/work-orders"
        data-testid="work-order-back-link"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#1D4ED8] mb-5"
      >
        <ArrowLeft size={15} /> {t("back")}
      </Link>

      {!wo && (
        <Card className="p-12 text-center text-slate-400 bg-white border-slate-200" data-testid="work-order-detail-empty">
          {isLoading ? t("loading") : isError ? t("offline_note") : t("no_data")}
        </Card>
      )}

      {wo && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
          <div className="space-y-6">
            <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                <Field label={t("po_number")} value={wo.po_number} mono />
                <Field label={t("value")} value={formatINR(wo.value)} />
                <Field label={t("issued_date")} value={wo.issued_date} />
                <Field label={t("due_date")} value={wo.due_date} />
                <Field label="WO Expiry" value={wo.expiry_date} />
                <Field label="Bill Status" value={wo.status_label} />
                <Field label="Live Stage" value={wo.expired ? "WO expired" : wo.live_stage} />
                <Field label="Next Stage" value={wo.next_stage || "Completed"} />
                <Field label="UOM" value={wo.uom} />
                <Field label="Revision" value={String(wo.revision ?? 0)} />
                <Field label="PO File" value={wo.po_file_name || "Not uploaded"} />
              </div>
              <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-4">
                <StatusBadge status={wo.status} testId="work-order-detail-status" />
                <span className="text-sm text-slate-500">{wo.vendor_name}</span>
              </div>
            </Card>

            <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm">
              <h2 className="text-base font-semibold text-slate-900 mb-3">{t("scope")}</h2>
              <p className="text-sm text-slate-600 leading-relaxed" data-testid="work-order-scope">
                {wo.scope || "—"}
              </p>
            </Card>

            <Card className="bg-white border-slate-200 rounded-xl shadow-sm p-0 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-slate-900">{t("boq")}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="work-order-items-table">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr className="text-left">
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">{t("description")}</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">Category</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">HSN</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">{t("qty")}</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">Billed</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">Unit</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">{t("rate")}</th>
                      <th className="px-6 py-2.5 text-xs uppercase font-semibold tracking-wide">{t("amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wo.items || []).length === 0 && (
                      <tr><td colSpan={8} className="px-6 py-8 text-center text-slate-400">{t("no_data")}</td></tr>
                    )}
                    {(wo.items || []).map((it, i) => (
                      <tr key={i} className="border-t border-slate-100" data-testid={`work-order-item-row-${i}`}>
                        <td className="px-6 py-3 text-slate-800">{it.description}</td>
                        <td className="px-6 py-3 text-slate-600">{it.category_scope || "—"}</td>
                        <td className="px-6 py-3 font-mono text-xs text-slate-500">{it.hsn || "—"}</td>
                        <td className="px-6 py-3 text-slate-700">{it.qty}</td>
                        <td className="px-6 py-3 text-slate-700">{it.billed_qty}</td>
                        <td className="px-6 py-3 text-slate-600">{it.unit || "—"}</td>
                        <td className="px-6 py-3 text-slate-700">{formatINR(it.rate)}</td>
                        <td className="px-6 py-3 font-medium text-slate-900">{formatINR(it.qty * it.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="p-6 bg-white border-slate-200 rounded-xl shadow-sm h-fit">
            <h2 className="text-base font-semibold text-slate-900 mb-5">{t("progress")}</h2>
            <ol className="space-y-5" data-testid="work-order-milestones">
              {(wo.milestones || []).length === 0 && (
                <p className="text-sm text-slate-400">{t("no_data")}</p>
              )}
              {(wo.milestones || []).map((m, i) => (
                <li key={i} className="flex gap-3" data-testid={`milestone-item-${i}`}>
                  {m.done ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle size={18} className="text-slate-300 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className={`text-sm ${m.done ? "text-slate-900 font-medium" : "text-slate-600"}`}>
                      {m.title}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.due_date}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </AppLayout>
  );
}

export default function WorkOrderDetail() {
  return (
    <RequireAuth>
      <WorkOrderDetailInner />
    </RequireAuth>
  );
}
