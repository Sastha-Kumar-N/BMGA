"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, FileText, PackageOpen } from "lucide-react";
import EmptyToolResult from "./EmptyToolResult";
import ResultDownloadButton from "./ResultDownloadButton";
import ToolResultTable from "./ToolResultTable";
import ToolStatusBadge from "./ToolStatusBadge";
import ToolSummaryCard from "./ToolSummaryCard";
import { ToolResult } from "./types";

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

export default function ToolResultsTabs({ tools, toolOrder }: { tools: Record<string, ToolResult>; toolOrder: string[] }) {
  const firstAvailable = useMemo(
    () => toolOrder.find((toolKey) => tools[toolKey]?.status !== "not_available") || toolOrder[0],
    [toolOrder, tools]
  );
  const [activeToolKey, setActiveToolKey] = useState(firstAvailable);
  const activeTool = tools[activeToolKey] || tools[firstAvailable];
  const availableCount = toolOrder.filter((toolKey) => tools[toolKey]?.status !== "not_available").length;

  return (
    <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="h-fit rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-6">
        <div className="px-3 py-4">
          <p className="text-sm font-black text-[#0B1B3A]">Pipeline Tools</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{availableCount} with data</p>
        </div>
        <div className="space-y-1">
          {toolOrder.map((toolKey) => {
            const tool = tools[toolKey];
            const isActive = toolKey === activeToolKey;
            return (
              <button
                key={toolKey}
                onClick={() => setActiveToolKey(toolKey)}
                className={`w-full rounded-2xl px-3 py-3 text-left transition ${isActive ? "bg-[#0B1B3A] text-white shadow-lg" : "text-slate-600 hover:bg-slate-50"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black">{tool?.displayName || toolKey}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${tool?.status === "completed" ? "bg-emerald-400" : tool?.status === "failed" ? "bg-red-400" : tool?.status === "warning" || tool?.status === "partial" ? "bg-amber-400" : "bg-slate-300"}`} />
                </div>
                <p className={`mt-1 text-[10px] font-black uppercase tracking-widest ${isActive ? "text-slate-300" : "text-slate-400"}`}>{tool?.category}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="space-y-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{activeTool.category}</p>
              <h2 className="mt-1 text-3xl font-black tracking-tighter text-[#0B1B3A]">{activeTool.displayName}</h2>
              <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">{activeTool.description}</p>
            </div>
            <ToolStatusBadge status={activeTool.status} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Version</p>
              <p className="mt-1 font-mono text-sm font-black text-slate-800">{activeTool.version || "N/A"}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Run Date</p>
              <p className="mt-1 flex items-center gap-2 font-mono text-sm font-black text-slate-800"><CalendarDays size={14} />{formatDate(activeTool.runDate)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Raw Outputs</p>
              <p className="mt-1 flex items-center gap-2 font-mono text-sm font-black text-slate-800"><PackageOpen size={14} />{activeTool.files.length}</p>
            </div>
          </div>
        </div>

        {activeTool.status === "not_available" ? (
          <EmptyToolResult tool={activeTool} />
        ) : (
          <>
            <ToolSummaryCard tool={activeTool} />

            {(activeTool.warnings.length > 0 || activeTool.errors.length > 0) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
                <p className="mb-3 flex items-center gap-2 text-sm font-black"><AlertTriangle size={16} /> Notes, Warnings, and Errors</p>
                <div className="space-y-1 font-mono text-xs font-semibold">
                  {[...activeTool.warnings, ...activeTool.errors].map((entry, index) => (
                    <p key={index}>{typeof entry === "string" ? entry : JSON.stringify(entry)}</p>
                  ))}
                </div>
              </div>
            )}

            {activeTool.tables.length > 0 ? (
              <div className="space-y-5">
                {activeTool.tables.map((table, index) => (
                  <ToolResultTable key={`${table.tableName}-${index}`} table={table} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-400">
                No result tables were reported for this tool.
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-4 flex items-center gap-2 text-sm font-black text-[#0B1B3A]"><FileText size={16} className="text-orange-500" /> Raw Output Files</p>
              {activeTool.files.length ? (
                <div className="flex flex-wrap gap-3">
                  {activeTool.files.map((file, index) => (
                    <ResultDownloadButton key={`${file.fileName}-${index}`} file={file} />
                  ))}
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-400">No raw output files are linked yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
