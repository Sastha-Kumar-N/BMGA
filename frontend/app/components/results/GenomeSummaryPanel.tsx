import { BarChart3, Database, Dna, Fingerprint, Gauge, MapPin, Microscope, ShieldAlert } from "lucide-react";
import { OrganismResultsResponse } from "./types";

const SUMMARY_FIELDS = [
  ["genome_size", "Genome Size", Dna],
  ["gc_percent", "GC %", Gauge],
  ["contig_count", "Contigs", Database],
  ["n50", "N50", BarChart3],
  ["completeness", "Completeness", ShieldAlert],
  ["contamination", "Contamination", ShieldAlert],
  ["cds_count", "CDS", Microscope],
  ["trna_count", "tRNA", Dna],
  ["rrna_count", "rRNA", Dna],
  ["amr_gene_count", "AMR Genes", ShieldAlert],
  ["biosynthetic_cluster_count", "BGCs", BarChart3],
  ["domain_hit_count", "Domain Hits", Fingerprint],
] as const;

function hasMetric(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

function formatMetric(value: unknown) {
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export default function GenomeSummaryPanel({ results }: { results: OrganismResultsResponse }) {
  const { organism, summary } = results;
  const displayName = organism.displayName || organism.name;
  const availableSummaryFields = SUMMARY_FIELDS.filter(([key]) => hasMetric(summary[key]));
  const availableMetadata = [
    [Dna, "text-orange-300", "Strain", organism.strain],
    [Database, "text-sky-300", "Assembly", organism.assembly_accession],
    [BarChart3, "text-emerald-300", "BioSample", organism.biosample],
    [MapPin, "text-rose-300", "Source", organism.source],
  ] as const;

  return (
    <section className="relative overflow-hidden rounded-[34px] bg-[#0B1B3A] p-6 text-white shadow-2xl shadow-slate-300/50 lg:p-8">
      <div className="absolute -right-28 -top-28 h-72 w-72 rounded-full bg-orange-500/20 blur-sm" />
      <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-sky-400/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.09)_1px,transparent_1px)] [background-size:22px_22px]" />

      <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-300/25 bg-orange-500/10 px-3 py-1.5 text-orange-200">
              <Fingerprint size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">Organism Analysis Results</span>
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter lg:text-5xl">{displayName}</h1>
            {organism.name !== displayName && (
              <p className="mt-2 text-sm font-bold italic text-slate-300">{organism.name}</p>
            )}
          </div>

          <div className="grid gap-3 text-sm font-bold text-slate-200">
            {availableMetadata.filter(([, , , value]) => hasMetric(value)).map(([Icon, iconClass, label, value]) => (
              <MetaRow key={label} icon={Icon} iconClass={iconClass} label={label} value={value} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {availableSummaryFields.map(([key, label, Icon]) => {
            const value = summary[key];

            return (
              <div
                key={key}
                className="group rounded-2xl border border-white/15 bg-white/[0.075] p-4 shadow-sm transition hover:border-orange-300/40 hover:bg-white/[0.11]"
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="rounded-xl bg-orange-400/15 p-2 text-orange-200">
                    <Icon size={16} />
                  </span>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-200">Ready</span>
                </div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="mt-1 truncate font-mono text-lg font-black text-white">{formatMetric(value)}</p>
              </div>
            );
          })}
          {!availableSummaryFields.length && <p className="col-span-full rounded-2xl border border-white/10 bg-white/[0.055] p-5 text-sm font-bold text-slate-300">No computed genome metrics are available yet. Approved tool checkpoints will appear here after they are ingested.</p>}
        </div>
      </div>
    </section>
  );
}

function MetaRow({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: typeof Dna;
  iconClass: string;
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
      <Icon size={16} className={`mt-0.5 shrink-0 ${iconClass}`} />
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <p className="truncate text-sm font-black text-white">{formatMetric(value)}</p>
      </div>
    </div>
  );
}
