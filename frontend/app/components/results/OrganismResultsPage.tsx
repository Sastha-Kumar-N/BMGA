"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Binary, Globe2, Home, LayoutDashboard, RefreshCcw, ShieldAlert } from "lucide-react";
import { apiPath } from "../../lib/api-client";
import BrandLogo from "../BrandLogo";
import GenomeSummaryPanel from "./GenomeSummaryPanel";
import ToolResultsTabs from "./ToolResultsTabs";
import { OrganismResultsResponse } from "./types";

export default function OrganismResultsPage({ organismId }: { organismId: string }) {
  const [results, setResults] = useState<OrganismResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"summary" | "tools">("summary");

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

  useEffect(() => {
    if (loading || !results) return;
    const targetId = window.location.hash.replace("#", "");
    if (!targetId) return;

    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "start" });
      setActiveSection(targetId === "tool-results" ? "tools" : "summary");
    });
  }, [loading, results]);

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (!target) return;
    setActiveSection(sectionId === "tool-results" ? "tools" : "summary");
    window.history.replaceState(null, "", `#${sectionId}`);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (loading || !results) return;
    const summary = document.getElementById("genome-summary");
    const tools = document.getElementById("tool-results");
    if (!summary || !tools) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visible?.target.id === "tool-results") {
          setActiveSection("tools");
        } else if (visible?.target.id === "genome-summary") {
          setActiveSection("summary");
        }
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0.1, 0.35, 0.65] },
    );

    observer.observe(summary);
    observer.observe(tools);
    return () => observer.disconnect();
  }, [loading, results]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo showText={false} size="md" />
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-orange-500">MAYA Results</p>
              <p className="truncate text-lg font-black italic tracking-tighter text-[#0B1B3A]">
                {results?.organism?.name || "Organism Analysis Results"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-orange-300 hover:text-orange-600">
              <Home size={14} />
              Home
            </Link>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-orange-300 hover:text-orange-600">
              <LayoutDashboard size={14} />
              Dashboard
            </Link>
            <Link href="/surveillance" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-teal-800 shadow-sm transition hover:border-teal-400 hover:bg-teal-100">
              <Globe2 size={14} />
              Surveillance
            </Link>
            <Link href={`/organisms/${organismId}/genome${results?.organism.strains[0]?.id ? `?strain=${results.organism.strains[0].id}` : ''}`} className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-orange-800 shadow-sm transition hover:border-orange-400 hover:bg-orange-100">
              <Binary size={14} />
              Genome Tools
            </Link>
            <button type="button" onClick={() => scrollToSection("genome-summary")} className={sectionNavClass(activeSection === "summary")}>
              <BarChart3 size={14} />
              Summary
            </button>
            <button type="button" onClick={() => scrollToSection("tool-results")} className={sectionNavClass(activeSection === "tools")}>
              Tool Results
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">

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

function sectionNavClass(active: boolean) {
  return active
    ? "inline-flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-3 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-orange-500"
    : "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 shadow-sm transition hover:border-orange-300 hover:text-orange-600";
}
