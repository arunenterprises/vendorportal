import { useQuery } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiGet } from "@/lib/api";

/**
 * "What changed on the workflow portal" alerts for the signed-in vendor.
 */
export default function ChangeAlerts() {
  const { data } = useQuery({
    queryKey: ["bill-changes"],
    queryFn: () => apiGet("/bills/changes"),
    retry: false,
  });

  const rows = (data ?? []).slice(0, 6);
  if (rows.length === 0) return null;

  return (
    <Card className="p-5 bg-white border-amber-200 rounded-xl shadow-sm" data-testid="change-alerts-card">
      <div className="flex items-center gap-2 mb-4">
        <BellRing size={16} className="text-[#D97706]" />
        <h2 className="text-base font-semibold text-slate-900">Recent Updates</h2>
      </div>
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="text-sm" data-testid={`change-alert-${c.id}`}>
            <span className="font-mono text-xs font-semibold text-[#1D4ED8]">{c.invoice_no}</span>
            <span className="text-slate-700"> — {c.label}: </span>
            <span className="text-slate-500">{c.from_value || "—"}</span>
            <span className="text-slate-400"> → </span>
            <span className="text-slate-900 font-medium">{c.to_value || "—"}</span>
            <span className="block text-xs text-slate-400 mt-0.5">
              {c.changed_at ? new Date(c.changed_at).toLocaleString("en-IN") : ""}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
