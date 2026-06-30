"use client";

import { useEffect, useState } from "react";
import { BarChart3, Dna, RefreshCcw, ShieldAlert } from "lucide-react";
import { apiPath } from "../../lib/api-client";
import GenomeSummaryPanel from "./GenomeSummaryPanel";
import ToolResultsTabs from "./ToolResultsTabs";
import { OrganismResultsResponse } from "./types";

export default function OrganismResultsPage({ organismId }: { organismId: string }) {
  const [results, setResults] = useState<OrganismResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadResults() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(apiPath(`/organisms/${organismId}/results`), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Results request failed with status ${response.status}`);
        }
        const data = await response.json() as OrganismResultsResponse;
        if (active) setResults(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load organism results");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadResults();
    return () => {
      active = false;
    };
  }, [organismId]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <header className="mb-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="shrink-0 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 p-2 text-white shadow-lg shadow-orange-500/20">
                <Dna size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500">MAYA Results</p>
              <p className="truncate text-lg font-black italic tracking-tighter text-[#0B1B3A]">
                {results?.organism?.name || "Organism Analysis Results"}
              </p>
            </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a href="#genome-summary" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-orange-300 hover:text-orange-600">
                <BarChart3 size={14} />
                Summary
            </a>
            <a href="#tool-results" className="inline-flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-3 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-orange-500">
              Tool Results
            </a>
          </div>
          </div>
        </header>

        {loading && (
          <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-[32px] bg-white text-center shadow-sm">
            <RefreshCcw className="mb-5 animate-spin text-orange-500" size={42} />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">Loading organism analysis results</p>
          </div>
        )}

        {!loading && error && (
          <div className="flex min-h-[70vh] flex-col items-center justify-center rounded-[32px] border border-red-100 bg-red-50 p-10 text-center text-red-700">
            <ShieldAlert className="mb-5" size={46} />
            <p className="text-xl font-black">Unable to load results</p>
            <p className="mt-2 max-w-lg text-sm font-bold">{error}</p>
          </div>
        )}

        {!loading && !error && results && (
          <div className="space-y-8">
            <div id="genome-summary" className="scroll-mt-28">
              <GenomeSummaryPanel results={results} />
            </div>
            <div id="tool-results" className="scroll-mt-28">
              <ToolResultsTabs tools={results.tools} toolOrder={results.toolOrder} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
