"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Database,
  FileText,
  Gauge,
  Layers3,
  PackageOpen,
  Sparkles,
  Table2,
  Tags,
} from "lucide-react";
import EmptyToolResult from "./EmptyToolResult";
import ResultDownloadButton from "./ResultDownloadButton";
import ToolResultTable from "./ToolResultTable";
import ToolStatusBadge from "./ToolStatusBadge";
import ToolSummaryCard from "./ToolSummaryCard";
import { ToolResult } from "./types";

type CategoryStyle = {
  dot: string;
  label: string;
  surface: string;
  text: string;
};

type ToolComputed = {
  summaryCount: number;
  tableCount: number;
  rowCount: number;
  fileCount: number;
  issueCount: number;
  hasData: boolean;
  countBadge: number;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  AMR: {
    dot: "bg-rose-500",
    label: "border-rose-200 bg-rose-50 text-rose-700",
    surface: "bg-rose-500/10 text-rose-600",
    text: "text-rose-600",
  },
  BGC: {
    dot: "bg-fuchsia-500",
    label: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700",
    surface: "bg-fuchsia-500/10 text-fuchsia-600",
    text: "text-fuchsia-600",
  },
  Annotation: {
    dot: "bg-emerald-500",
    label: "border-emerald-200 bg-emerald-50 text-emerald-700",
    surface: "bg-emerald-500/10 text-emerald-600",
    text: "text-emerald-600",
  },
  Quality: {
    dot: "bg-amber-500",
    label: "border-amber-200 bg-amber-50 text-amber-700",
    surface: "bg-amber-500/10 text-amber-600",
    text: "text-amber-600",
  },
  QC: {
    dot: "bg-sky-500",
    label: "border-sky-200 bg-sky-50 text-sky-700",
    surface: "bg-sky-500/10 text-sky-600",
    text: "text-sky-600",
  },
  Domains: {
    dot: "bg-violet-500",
    label: "border-violet-200 bg-violet-50 text-violet-700",
    surface: "bg-violet-500/10 text-violet-600",
    text: "text-violet-600",
  },
  "Mobile Elements": {
    dot: "bg-orange-500",
    label: "border-orange-200 bg-orange-50 text-orange-700",
    surface: "bg-orange-500/10 text-orange-600",
    text: "text-orange-600",
  },
  "K-mers": {
    dot: "bg-lime-500",
    label: "border-lime-200 bg-lime-50 text-lime-700",
    surface: "bg-lime-500/10 text-lime-600",
    text: "text-lime-600",
  },
  Pathways: {
    dot: "bg-teal-500",
    label: "border-teal-200 bg-teal-50 text-teal-700",
    surface: "bg-teal-500/10 text-teal-600",
    text: "text-teal-600",
  },
  CRISPR: {
    dot: "bg-cyan-500",
    label: "border-cyan-200 bg-cyan-50 text-cyan-700",
    surface: "bg-cyan-500/10 text-cyan-600",
    text: "text-cyan-600",
  },
  Typing: {
    dot: "bg-blue-500",
    label: "border-blue-200 bg-blue-50 text-blue-700",
    surface: "bg-blue-500/10 text-blue-600",
    text: "text-blue-600",
  },
  Assembly: {
    dot: "bg-indigo-500",
    label: "border-indigo-200 bg-indigo-50 text-indigo-700",
    surface: "bg-indigo-500/10 text-indigo-600",
    text: "text-indigo-600",
  },
  Repeats: {
    dot: "bg-slate-500",
    label: "border-slate-200 bg-slate-50 text-slate-700",
    surface: "bg-slate-500/10 text-slate-600",
    text: "text-slate-600",
  },
};

const DEFAULT_CATEGORY: CategoryStyle = {
  dot: "bg-slate-400",
  label: "border-slate-200 bg-slate-50 text-slate-600",
  surface: "bg-slate-500/10 text-slate-600",
  text: "text-slate-600",
};

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function getToolComputed(tool?: ToolResult): ToolComputed {
  if (!tool) {
    return {
      summaryCount: 0,
      tableCount: 0,
      rowCount: 0,
      fileCount: 0,
      issueCount: 0,
      hasData: false,
      countBadge: 0,
    };
  }

  const summaryCount = Object.values(tool.summary || {}).filter(hasMeaningfulValue).length;
  const tableCount = (tool.tables || []).filter((table) => (table.rows || []).length > 0).length;
  const rowCount = (tool.tables || []).reduce((total, table) => total + (table.rows || []).length, 0);
  const fileCount = (tool.files || []).length;
  const issueCount = (tool.warnings || []).length + (tool.errors || []).length;
  const hasData = summaryCount > 0 || rowCount > 0 || fileCount > 0;

  return {
    summaryCount,
    tableCount,
    rowCount,
    fileCount,
    issueCount,
    hasData,
    countBadge: rowCount || summaryCount || fileCount,
  };
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function categoryStyle(category: string) {
  return CATEGORY_STYLES[category] || DEFAULT_CATEGORY;
}

function displayCount(value: number) {
  return value.toLocaleString();
}

export default function ToolResultsTabs({ tools, toolOrder }: { tools: Record<string, ToolResult>; toolOrder: string[] }) {
  const orderedTools = useMemo(() => {
    const keys = toolOrder.length ? toolOrder : Object.keys(tools);
    return keys.map((toolKey) => tools[toolKey]).filter(Boolean);
  }, [toolOrder, tools]);

  const firstToolKey = orderedTools[0]?.toolName || "";
  const [activeToolKey, setActiveToolKey] = useState(firstToolKey);

  const activeTool = orderedTools.find((tool) => tool.toolName === activeToolKey) || orderedTools[0];

  const toolStats = useMemo(() => {
    const computedByTool = new Map<string, ToolComputed>();
    let withData = 0;
    let latestDate = 0;

    for (const tool of orderedTools) {
      const computed = getToolComputed(tool);
      computedByTool.set(tool.toolName, computed);
      if (computed.hasData) withData += 1;

      if (tool.runDate) {
        const time = new Date(tool.runDate).getTime();
        if (!Number.isNaN(time)) latestDate = Math.max(latestDate, time);
      }
    }

    return {
      computedByTool,
      total: orderedTools.length,
      withData,
      missing: orderedTools.length - withData,
      latestImport: latestDate ? new Date(latestDate).toISOString() : null,
    };
  }, [orderedTools]);

  const categoryDistribution = useMemo(() => {
    const distribution = new Map<string, { total: number; withData: number }>();

    for (const tool of orderedTools) {
      const current = distribution.get(tool.category) || { total: 0, withData: 0 };
      const computed = toolStats.computedByTool.get(tool.toolName) || getToolComputed(tool);
      distribution.set(tool.category, {
        total: current.total + 1,
        withData: current.withData + (computed.hasData ? 1 : 0),
      });
    }

    return Array.from(distribution.entries());
  }, [orderedTools, toolStats.computedByTool]);

  if (!activeTool) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
        <PackageOpen className="mx-auto mb-4 text-slate-300" size={44} />
        <p className="text-lg font-black text-[#0B1B3A]">No pipeline tools are configured</p>
        <p className="mt-2 text-sm font-semibold text-slate-500">Tool results will appear here after the results API returns configured tools.</p>
      </section>
    );
  }

  const activeComputed = toolStats.computedByTool.get(activeTool.toolName) || getToolComputed(activeTool);
  const activeCategory = categoryStyle(activeTool.category);
  const issuePanel = activeComputed.issueCount > 0 ? <ToolIssuePanel tool={activeTool} /> : null;

  return (
    <section className="grid gap-6 lg:grid-cols-[310px_minmax(0,1fr)]">
      <aside className="h-fit overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm lg:sticky lg:top-28">
        <div className="relative overflow-hidden border-b border-slate-100 bg-[#0B1B3A] px-5 py-5 text-white">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-orange-400/20" />
          <div className="absolute -bottom-10 left-8 h-24 w-24 rounded-full bg-white/5" />
          <div className="relative">
            <p className="text-sm font-black">Pipeline Tools</p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-orange-200">
              {toolStats.withData} WITH DATA
            </p>
          </div>
        </div>

        <div className="max-h-[min(760px,calc(100vh-220px))] space-y-1 overflow-y-auto p-3">
          {orderedTools.map((tool) => {
            const computed = toolStats.computedByTool.get(tool.toolName) || getToolComputed(tool);
            const isActive = tool.toolName === activeTool.toolName;
            const styles = categoryStyle(tool.category);

            return (
              <button
                key={tool.toolName}
                onClick={() => setActiveToolKey(tool.toolName)}
                className={`group w-full rounded-2xl px-3 py-3 text-left transition ${
                  isActive
                    ? "bg-[#0B1B3A] text-white shadow-lg shadow-slate-300/60 ring-1 ring-[#0B1B3A]"
                    : computed.hasData
                      ? "text-slate-700 hover:bg-slate-50 hover:ring-1 hover:ring-slate-200"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${computed.hasData ? styles.dot : "bg-slate-300"}`} />
                      <span className="truncate text-sm font-black">{tool.displayName}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                          isActive ? "border-white/15 bg-white/10 text-orange-100" : styles.label
                        }`}
                      >
                        {tool.category}
                      </span>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? "text-slate-300" : computed.hasData ? "text-emerald-600" : "text-slate-400"}`}>
                        {computed.hasData ? "With data" : "No data"}
                      </span>
                    </div>
                  </div>

                  {computed.countBadge > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 font-mono text-[10px] font-black ${
                        isActive ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {displayCount(computed.countBadge)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 inline-flex rounded-xl bg-slate-100 p-2 text-[#0B1B3A]">
              <Layers3 size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total tools</p>
            <p className="mt-1 font-mono text-2xl font-black text-[#0B1B3A]">{displayCount(toolStats.total)}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-sm">
            <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-emerald-600">
              <CheckCircle2 size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700/70">Tools with data</p>
            <p className="mt-1 font-mono text-2xl font-black text-emerald-700">{displayCount(toolStats.withData)}</p>
          </div>
          <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4 shadow-sm">
            <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-orange-600">
              <Gauge size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-orange-700/70">Missing results</p>
            <p className="mt-1 font-mono text-2xl font-black text-orange-700">{displayCount(toolStats.missing)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 inline-flex rounded-xl bg-slate-100 p-2 text-slate-600">
              <CalendarDays size={18} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Last import/status</p>
            <p className="mt-1 truncate font-mono text-sm font-black text-[#0B1B3A]">{formatDate(toolStats.latestImport)}</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-black text-[#0B1B3A]">Category distribution</p>
              <p className="text-xs font-semibold text-slate-500">Availability is computed from actual summaries, result rows, or raw output files.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <Circle size={8} fill="currentColor" />
              Dynamic
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categoryDistribution.map(([category, counts]) => {
              const styles = categoryStyle(category);
              const width = counts.total ? Math.round((counts.withData / counts.total) * 100) : 0;

              return (
                <div key={category} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className={`text-xs font-black ${styles.text}`}>{category}</span>
                    <span className="font-mono text-[11px] font-black text-slate-500">
                      {counts.withData}/{counts.total}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div className={`h-full rounded-full ${styles.dot}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
          <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-orange-100/70" />
          <div className="absolute bottom-0 right-0 h-full w-1/3 bg-[radial-gradient(circle_at_center,rgba(11,27,58,0.08)_1px,transparent_1px)] [background-size:18px_18px]" />
          <div className="relative">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${activeCategory.label}`}>
                    <Tags size={12} />
                    {activeTool.category}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${
                      activeComputed.hasData
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Circle size={8} fill="currentColor" />
                    {activeComputed.hasData ? "Available" : "Not Available"}
                  </span>
                  <ToolStatusBadge status={activeTool.status} />
                </div>
                <h2 className="mt-4 text-3xl font-black tracking-tighter text-[#0B1B3A] md:text-4xl">{activeTool.displayName}</h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500 md:text-base">{activeTool.description}</p>
              </div>

              <div className={`grid shrink-0 grid-cols-2 gap-2 rounded-3xl p-3 ${activeCategory.surface}`}>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Tables</p>
                  <p className="font-mono text-lg font-black">{displayCount(activeComputed.tableCount)}</p>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Rows</p>
                  <p className="font-mono text-lg font-black">{displayCount(activeComputed.rowCount)}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <DetailMetric icon={Sparkles} label="Version" value={activeTool.version || "N/A"} />
              <DetailMetric icon={CalendarDays} label="Run date" value={formatDate(activeTool.runDate)} />
              <DetailMetric icon={PackageOpen} label="Raw outputs" value={displayCount(activeComputed.fileCount)} />
              <DetailMetric icon={Table2} label="Data records" value={displayCount(activeComputed.rowCount || activeComputed.summaryCount)} />
              <DetailMetric icon={Database} label="Last updated" value={formatDate(activeTool.runDate)} />
            </div>
          </div>
        </div>

        {!activeComputed.hasData ? (
          <>
            <EmptyToolResult tool={activeTool} />
            {issuePanel}
          </>
        ) : (
          <>
            <ToolSummaryCard tool={activeTool} />

            {issuePanel}

            {activeTool.tables.length > 0 ? (
              <div className="space-y-5">
                {activeTool.tables.map((table, index) => (
                  <ToolResultTable key={`${table.tableName}-${index}`} table={table} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Table2 className="mx-auto mb-3 text-slate-300" size={38} />
                <p className="text-sm font-black text-[#0B1B3A]">No result tables were reported for this tool.</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Any available summary metrics or raw files are still shown on this page.</p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="flex items-center gap-2 text-sm font-black text-[#0B1B3A]">
                  <FileText size={16} className="text-orange-500" />
                  Raw Output Files
                </p>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 font-mono text-[10px] font-black text-slate-500">
                  {displayCount(activeComputed.fileCount)}
                </span>
              </div>
              {activeTool.files.length ? (
                <div className="flex flex-wrap gap-3">
                  {activeTool.files.map((file, index) => (
                    <ResultDownloadButton key={`${file.fileName}-${index}`} file={file} />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">No raw output files are linked yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function DetailMetric({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="mb-3 inline-flex rounded-xl bg-white p-2 text-orange-500 shadow-sm">
        <Icon size={16} />
      </div>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-black text-[#0B1B3A]">{value}</p>
    </div>
  );
}

function ToolIssuePanel({ tool }: { tool: ToolResult }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-sm font-black">
        <AlertTriangle size={16} />
        Notes, Warnings, and Errors
      </p>
      <div className="space-y-1 font-mono text-xs font-semibold">
        {[...tool.warnings, ...tool.errors].map((entry, index) => (
          <p key={index}>{typeof entry === "string" ? entry : JSON.stringify(entry)}</p>
        ))}
      </div>
    </div>
  );
}
