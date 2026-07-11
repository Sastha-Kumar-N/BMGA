import { AlertTriangle, CalendarClock, Dna, FileCheck2, Globe2, ShieldCheck } from 'lucide-react';

const methods = [
  {
    icon: Globe2,
    title: 'Record scope',
    body: 'Public surveillance views contain strain records already published in the BMGA organism database. User submissions remain absent until an administrator reviews and approves them.',
  },
  {
    icon: CalendarClock,
    title: 'Freshness',
    body: '“Last refreshed” is the time the current dashboard response was generated. “Data through” is the most recent strain or MAYA record update represented by the selected filters.',
  },
  {
    icon: Dna,
    title: 'Genotypic evidence',
    body: 'MAYA detections identify sequence features associated with antimicrobial resistance. They are genomic observations and do not independently establish expressed resistance or clinical outcome.',
  },
  {
    icon: FileCheck2,
    title: 'Phenotypic evidence',
    body: 'Phenotypic evidence must come from a linked, reported laboratory susceptibility method. BMGA does not infer a phenotype from genotype and marks unavailable evidence explicitly.',
  },
  {
    icon: ShieldCheck,
    title: 'Review and provenance',
    body: 'Submitted metadata and MAYA output files pass through the existing admin review workflow. Checksums, submission ownership, status history, and audit events are retained without exposing private storage paths.',
  },
  {
    icon: AlertTriangle,
    title: 'Interpretation limits',
    body: 'Submitted records can be uneven across countries, dates, hosts, and sampling programs. Counts describe BMGA holdings and must not be interpreted as population prevalence or incidence.',
  },
];

export default function SurveillanceMethodologyPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Surveillance Methodology</h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">How BMGA defines record scope, freshness, provenance, and genomic evidence across the global surveillance section.</p>
      </header>
      <section className="grid border border-slate-200 bg-white md:grid-cols-2 xl:grid-cols-3">
        {methods.map((method, index) => {
          const Icon = method.icon;
          return (
            <article key={method.title} className={`p-5 ${index > 0 ? 'border-t border-slate-200 md:border-t-0 md:border-l' : ''} ${index >= 2 ? 'md:border-t xl:border-t-0' : ''} ${index >= 3 ? 'xl:border-t' : ''}`}>
              <Icon size={23} className="text-teal-700" />
              <h2 className="mt-4 text-base font-black">{method.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{method.body}</p>
            </article>
          );
        })}
      </section>
      <aside className="border-l-4 border-orange-500 bg-orange-50 p-5">
        <h2 className="text-base font-black text-orange-950">Responsible interpretation</h2>
        <p className="mt-2 max-w-5xl text-sm font-semibold leading-6 text-orange-950">Surveillance outputs should be interpreted with sampling design, laboratory method, local epidemiology, quality-control results, and relevant public-health guidance. BMGA provides evidence organization and traceability; it does not provide a clinical diagnosis or treatment recommendation.</p>
      </aside>
    </div>
  );
}
