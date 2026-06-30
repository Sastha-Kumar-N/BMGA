import { Database, Microscope, PackageOpen } from "lucide-react";
import { ToolResult } from "./types";

export default function EmptyToolResult({ tool }: { tool: ToolResult }) {
  return (
    <div className="relative flex min-h-[390px] flex-col items-center justify-center overflow-hidden rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="absolute -left-16 -top-16 h-44 w-44 rounded-full bg-orange-100/80" />
      <div className="absolute -bottom-20 right-8 h-48 w-48 rounded-full bg-slate-100" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:20px_20px] opacity-40" />

      <div className="relative">
        <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl border border-slate-200 bg-slate-50 text-slate-300 shadow-sm">
          <Microscope size={38} />
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <PackageOpen size={12} />
            No data
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
            <Database size={12} />
            {tool.category}
          </span>
        </div>
        <p className="text-xl font-black tracking-tight text-[#0B1B3A]">{tool.displayName} results are not available</p>
        <p className="mt-3 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
          Import a pipeline output folder containing {tool.displayName} results to populate this tab.
        </p>
      </div>
    </div>
  );
}
