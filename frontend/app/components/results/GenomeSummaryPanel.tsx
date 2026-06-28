import { BarChart3, Database, Dna, Fingerprint, ShieldAlert } from "lucide-react";
import { OrganismResultsResponse } from "./types";

const SUMMARY_FIELDS = [
  ["genome_size", "Genome Size"],
  ["gc_percent", "GC %"],
  ["contig_count", "Contigs"],
  ["n50", "N50"],
  ["completeness", "Completeness"],
  ["contamination", "Contamination"],
  ["cds_count", "CDS"],
  ["trna_count", "tRNA"],
  ["rrna_count", "rRNA"],
  ["amr_gene_count", "AMR Genes"],
  ["biosynthetic_cluster_count", "BGCs"],
  ["domain_hit_count", "Domain Hits"],
];

function formatMetric(value: unknown) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export default function GenomeSummaryPanel({ results }: { results: OrganismResultsResponse }) {
  const { organism, summary } = results;

  return (
    <section className="rounded-[32px] bg-[#0B1B3A] p-6 text-white shadow-2xl shadow-slate-300/40 lg:p-8">
      <div className="grid gap-8 xl:grid-cols-[1.1fr_2fr]">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-500/10 px-3 py-1.5 text-orange-300">
            <Fingerprint size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Organism Analysis Results</span>
          </div>
          <h1 className="text-4xl font-black italic tracking-tighter lg:text-5xl">{organism.name}</h1>
          <div className="mt-5 grid gap-3 text-sm font-bold text-slate-300">
            <div className="flex items-center gap-2"><Dna size={16} className="text-orange-400" /> Strain: {organism.strain || "N/A"}</div>
            <div className="flex items-center gap-2"><Database size={16} className="text-blue-400" /> Assembly: {organism.assembly_accession || "N/A"}</div>
            <div className="flex items-center gap-2"><BarChart3 size={16} className="text-emerald-400" /> BioSample: {organism.biosample || "N/A"}</div>
            <div className="flex items-center gap-2"><ShieldAlert size={16} className="text-red-400" /> Source: {organism.source || "N/A"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {SUMMARY_FIELDS.map(([key, label]) => (
            <div key={key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
              <p className="mt-1 truncate font-mono text-lg font-black text-white">{formatMetric(summary[key])}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
