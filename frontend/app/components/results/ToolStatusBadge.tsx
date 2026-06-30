import { AlertCircle, CheckCircle2, Clock3, MinusCircle, ShieldAlert } from "lucide-react";
import { ToolStatus } from "./types";

const STATUS_STYLES: Record<ToolStatus, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-blue-50 text-blue-700 border-blue-200",
  not_available: "bg-slate-100 text-slate-500 border-slate-200",
};

const STATUS_ICONS = {
  completed: CheckCircle2,
  warning: ShieldAlert,
  partial: ShieldAlert,
  failed: AlertCircle,
  pending: Clock3,
  not_available: MinusCircle,
};

const STATUS_LABELS: Record<ToolStatus, string> = {
  completed: "Ready",
  warning: "Warning",
  partial: "Partial",
  failed: "Failed",
  pending: "Pending",
  not_available: "Not available",
};

export default function ToolStatusBadge({ status }: { status: ToolStatus }) {
  const Icon = STATUS_ICONS[status];
  const label = STATUS_LABELS[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[status]}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}
