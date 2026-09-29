import { Clock, CheckCircle2, Circle } from "lucide-react";

/**
 * Payment journey of an invoice, built from the dates the workflow portal sends.
 */
export default function PaymentTimeline({ bill }) {
  if (!bill) return null;

  const steps = [
    { title: "Bill submitted", date: bill.invoice_date, done: !!bill.invoice_date, note: bill.bill_no },
    {
      title: "Measurement verified",
      date: bill.process_date,
      done: !!bill.measurement_status,
      note: bill.measurement_status,
    },
    {
      title: "Approved for payment",
      date: bill.approval_date,
      done: (bill.approval_status || "").toLowerCase().includes("approved"),
      note: bill.approver_name ? `by ${bill.approver_name}` : bill.approval_status,
    },
    {
      title: "Payment scheduled",
      date: bill.scheduled_due_date || bill.due_date,
      done: !!(bill.scheduled_due_date || bill.due_date),
      note: bill.final_release_status,
    },
    {
      title: "Payment released",
      date: bill.paid_date,
      done: bill.status === "paid",
      note: bill.utr ? `UTR ${bill.utr}` : bill.payment_mode,
    },
  ];

  return (
    <ol className="relative border-l border-slate-200 ml-2 space-y-5" data-testid="payment-timeline">
      {steps.map((s, i) => (
        <li key={i} className="pl-6 relative" data-testid={`payment-timeline-step-${i}`}>
          <span className="absolute -left-[9px] top-0.5 bg-white">
            {s.done ? (
              <CheckCircle2 size={17} className="text-emerald-600" />
            ) : (
              <Circle size={17} className="text-slate-300" />
            )}
          </span>
          <p className={`text-sm ${s.done ? "text-slate-900 font-medium" : "text-slate-500"}`}>
            {s.title}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={11} /> {s.date || "Pending"}
            {s.note ? <span className="text-slate-500">· {s.note}</span> : null}
          </p>
        </li>
      ))}
    </ol>
  );
}
