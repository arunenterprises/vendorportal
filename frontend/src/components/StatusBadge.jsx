import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

const MAP = {
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  under_review: "bg-blue-50 text-blue-800 border-blue-200",
  rejected: "bg-red-50 text-red-800 border-red-200",
  // work orders: active = green, completed/closed = red, on hold = yellow
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  completed: "bg-red-50 text-red-800 border-red-200",
  on_hold: "bg-amber-50 text-amber-900 border-amber-300",
};

// `label` wins when present: synced rows show the workflow portal's exact wording
// (e.g. "Added to Due List (Unpaid)") while the colour still comes from `status`.
export default function StatusBadge({ status, label, testId }) {
  const { t } = useI18n();
  const cls = MAP[status] || "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <Badge
      variant="outline"
      data-testid={testId || `status-badge-${status}`}
      title={label || undefined}
      className={`${cls} border font-medium rounded-md px-2.5 py-0.5 text-xs whitespace-nowrap`}
    >
      {label || t(`status_${status}`)}
    </Badge>
  );
}
