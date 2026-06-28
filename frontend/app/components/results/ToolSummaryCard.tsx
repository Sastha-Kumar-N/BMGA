import { Activity } from "lucide-react";
import ToolStatusBadge from "./ToolStatusBadge";
import { ToolResult } from "./types";

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ToolSummaryCard({ tool }: { tool: ToolResult }) {
  const metrics = Object.entries(tool.summary || {}).slice(0, 6);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-50 p-2 text-orange-500">
            <Activity size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-[#0B1B3A]">{tool.displayName}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tool.category}</p>
          </div>
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {metrics.length ? metrics.map(([key, value]) => (
          <div key={key} className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{key.replaceAll("_", " ")}</p>
            <p className="truncate font-mono text-xs font-bold text-slate-800">{formatValue(value)}</p>
          </div>
        )) : (
          <p className="col-span-full text-sm font-bold text-slate-400">No summary metrics available.</p>
        )}
      </div>
    </div>
  );
}
