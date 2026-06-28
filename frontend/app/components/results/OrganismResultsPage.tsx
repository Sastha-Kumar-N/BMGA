"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCcw, ShieldAlert } from "lucide-react";
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
        <div className="mb-6 flex items-center justify-between">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-[#0B1B3A] shadow-sm transition hover:border-orange-300 hover:text-orange-600">
            <ArrowLeft size={14} />
            Dashboard
          </Link>
        </div>

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
            <GenomeSummaryPanel results={results} />
            <ToolResultsTabs tools={results.tools} toolOrder={results.toolOrder} />
          </div>
        )}
      </div>
    </main>
  );
}
