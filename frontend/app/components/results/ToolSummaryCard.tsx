import { Activity, BarChart3, Database } from "lucide-react";
import ToolStatusBadge from "./ToolStatusBadge";
import { ToolResult } from "./types";

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function hasMeaningfulValue(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

export default function ToolSummaryCard({ tool }: { tool: ToolResult }) {
  const metrics = Object.entries(tool.summary || {}).filter(([, value]) => hasMeaningfulValue(value)).slice(0, 8);

  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 p-5 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-orange-50 p-3 text-orange-500">
            <Activity size={20} />
          </div>
          <div>
            <p className="text-base font-black text-[#0B1B3A]">{tool.displayName} summary</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tool.category}</p>
          </div>
        </div>
        <ToolStatusBadge status={tool.status} />
      </div>

      <div className="p-5">
        {metrics.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(([key, value]) => (
              <div key={key} className="min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md">
                <div className="mb-3 inline-flex rounded-xl bg-slate-100 p-2 text-slate-600">
                  <BarChart3 size={15} />
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{key.replaceAll("_", " ")}</p>
                <p className="mt-1 truncate font-mono text-sm font-black text-slate-800">{formatValue(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <Database className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="text-sm font-black text-[#0B1B3A]">No summary metrics available.</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">This panel only displays metrics returned by the results API.</p>
          </div>
        )}
      </div>
    </div>
  );
}
