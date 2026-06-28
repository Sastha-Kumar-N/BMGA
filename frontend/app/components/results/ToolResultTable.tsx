"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ToolResultTableData } from "./types";

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ToolResultTable({ table }: { table: ToolResultTableData }) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    if (!query.trim()) return table.rows || [];
    const needle = query.toLowerCase();
    return (table.rows || []).filter((row) =>
      Object.values(row).some((value) => formatCell(value).toLowerCase().includes(needle))
    );
  }, [query, table.rows]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black text-[#0B1B3A]">{table.tableName}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{rows.length} rows</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter table..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm font-bold text-slate-700 outline-none transition focus:border-orange-400 focus:bg-white"
          />
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {table.columns.map((column) => (
                <th key={column} className="border-b border-slate-100 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {column.replaceAll("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, index) => (
              <tr key={index} className="hover:bg-orange-50/60">
                {table.columns.map((column) => (
                  <td key={column} className="px-4 py-3 align-top font-mono text-xs font-semibold text-slate-700">
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={Math.max(table.columns.length, 1)} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                  No rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
