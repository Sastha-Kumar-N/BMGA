import { Microscope } from "lucide-react";
import { ToolResult } from "./types";

export default function EmptyToolResult({ tool }: { tool: ToolResult }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <Microscope size={48} className="mb-4 text-slate-300" />
      <p className="text-lg font-black text-[#0B1B3A]">{tool.displayName} results are not available</p>
      <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
        Import a pipeline output folder containing `{tool.toolName}` results to populate this tab.
      </p>
    </div>
  );
}
