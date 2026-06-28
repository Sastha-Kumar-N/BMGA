import { Download } from "lucide-react";
import { apiPath } from "../../lib/api-client";
import { ToolResultFile } from "./types";

export default function ResultDownloadButton({ file }: { file: ToolResultFile }) {
  if (!file.downloadPath) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-400">
        <Download size={14} />
        {file.fileName}
      </span>
    );
  }

  return (
    <a
      href={apiPath(file.downloadPath)}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-[#0B1B3A] shadow-sm transition hover:border-orange-300 hover:text-orange-600"
    >
      <Download size={14} />
      {file.fileName}
    </a>
  );
}
