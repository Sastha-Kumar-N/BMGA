'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  CalendarDays,
  Dna,
  FileCheck2,
  Globe2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import AmrInsightsPanel from './AmrInsightsPanel';
import SurveillanceFilters from './SurveillanceFilters';
import SurveillanceRecordsTable from './SurveillanceRecordsTable';
import { formatCount, formatDate, type SurveillanceView } from './types';
import { useSurveillanceData } from './useSurveillanceData';

const WorldSurveillanceMap = dynamic(() => import('./WorldSurveillanceMap'), {
  ssr: false,
  loading: () => <div className="flex min-h-[390px] items-center justify-center border border-slate-200 bg-slate-50 text-xs font-black uppercase text-teal-700 lg:min-h-[520px]">Initializing world map</div>,
});

const viewCopy = {
  overview: {
    title: 'Global Genomic Surveillance',
    description: 'Approved international strain metadata and MAYA pipeline outputs, summarized from the BMGA database.',
  },
  amr: {
    title: 'Global AMR Insights',
    description: 'Gene-level resistance determinants from approved records, separated from phenotypic susceptibility evidence.',
  },
  records: {
    title: 'Global Strain Explorer',
    description: 'Search and compare approved surveillance records with source, location, evidence, and MAYA processing context.',
  },
} satisfies Record<SurveillanceView, { title: string; description: string }>;

export default function SurveillanceDashboard({ view }: { view: SurveillanceView }) {
  const data = useSurveillanceData(view);
  const copy = viewCopy[view];
  const overview = data.overview;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">{copy.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-600" /> Last refreshed {formatDate(overview?.generatedAt, true)}</span>
            <span>Data through {formatDate(overview?.dataThrough, true)}</span>
            <span>Auto-refreshes every 60 seconds</span>
          </div>
        </div>
        <Link href="/surveillance/submit" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-orange-500 px-4 text-xs font-black uppercase text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
          <UploadCloud size={17} /> Submit surveillance data
        </Link>
      </header>

      <SurveillanceFilters
        filters={data.filters}
        options={data.options}
        refreshing={data.refreshing}
        onChange={data.updateFilter}
        onReset={data.resetFilters}
        onRefresh={data.refresh}
      />

      {data.error && (
        <div role="alert" className="flex items-start gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <span>{data.error} Existing on-screen values may be from the previous successful refresh.</span>
        </div>
      )}

      {view === 'overview' && (
        <>
          <MetricStrip overview={overview} loading={data.loading} />
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,0.85fr)]">
            <WorldSurveillanceMap
              locations={overview?.locations || []}
              loading={data.loading}
              error={!overview ? data.error : null}
              truncated={overview?.locationsTruncated}
              limit={overview?.locationResultLimit}
            />
            <AmrInsightsPanel data={data.amr} loading={data.loading} error={data.error} />
          </div>
          <SurveillanceRecordsTable
            data={data.records}
            loading={data.loading}
            error={data.error}
            page={data.page}
            pageSize={data.pageSize}
            onPageChange={data.setPage}
            onPageSizeChange={data.setPageSize}
            compact
          />
          <QualityStrip overview={overview} />
          <Limitations limitations={overview?.limitations || []} />
        </>
      )}

      {view === 'amr' && (
        <>
          <MetricStrip overview={overview} loading={data.loading} />
          <AmrInsightsPanel data={data.amr} loading={data.loading} error={data.error} expanded />
          <section className="grid border border-slate-200 bg-white lg:grid-cols-2 lg:divide-x lg:divide-slate-200">
            <EvidenceDefinition icon={Dna} title="Genotypic evidence" text="A resistance determinant detected in sequence-derived MAYA output. This supports genomic surveillance but does not confirm expressed resistance in a laboratory susceptibility test." />
            <EvidenceDefinition icon={FileCheck2} title="Phenotypic evidence" text="A linked result from a validated antimicrobial susceptibility method. BMGA labels this separately and does not infer it from genotype alone." />
          </section>
          <Limitations limitations={overview?.limitations || []} />
        </>
      )}

      {view === 'records' && (
        <>
          <MetricStrip overview={overview} loading={data.loading} />
          <SurveillanceRecordsTable
            data={data.records}
            loading={data.loading}
            error={data.error}
            page={data.page}
            pageSize={data.pageSize}
            onPageChange={data.setPage}
            onPageSizeChange={data.setPageSize}
          />
          <QualityStrip overview={overview} />
          <Limitations limitations={overview?.limitations || []} />
        </>
      )}
    </div>
  );
}

function MetricStrip({ overview, loading }: { overview: ReturnType<typeof useSurveillanceData>['overview']; loading: boolean }) {
  const metrics = [
    { label: 'Approved strains', value: overview?.metrics.approvedStrains, detail: `${formatCount(overview?.metrics.organismsTracked)} ${overview?.metrics.organismsTracked === 1 ? 'organism' : 'organisms'}`, icon: Dna, tone: 'text-orange-600 bg-orange-50' },
    { label: 'Countries represented', value: overview?.metrics.countriesRepresented, detail: 'Reported country metadata', icon: Globe2, tone: 'text-teal-700 bg-teal-50' },
    { label: 'Genotypic AMR detections', value: overview?.metrics.genotypicAmrDetections, detail: 'Normalized gene-level rows', icon: ShieldAlert, tone: 'text-red-700 bg-red-50' },
    { label: 'Completed MAYA runs', value: overview?.metrics.completedMayaRuns, detail: 'Approved strain-linked runs', icon: Activity, tone: 'text-blue-700 bg-blue-50' },
  ];
  return (
    <section aria-label="Global surveillance metrics" className="grid border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-slate-200">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex min-h-28 items-center gap-4 border-b border-slate-200 p-4 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:border-b-0">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${metric.tone}`}><metric.icon size={21} /></span>
          <div className="min-w-0"><p className="text-[11px] font-black uppercase text-slate-500">{metric.label}</p><p className="mt-1 font-mono text-2xl font-black">{loading && !overview ? '—' : formatCount(metric.value)}</p><p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{metric.detail}</p></div>
        </div>
      ))}
    </section>
  );
}

function QualityStrip({ overview }: { overview: ReturnType<typeof useSurveillanceData>['overview'] }) {
  const quality = overview?.quality;
  const rows = [
    { label: 'Collection date coverage', value: quality?.collectionDateCoveragePercent == null ? 'N/A' : `${quality.collectionDateCoveragePercent.toFixed(1)}%`, icon: CalendarDays },
    { label: 'Geolocation coverage', value: quality?.geolocationCoveragePercent == null ? 'N/A' : `${quality.geolocationCoveragePercent.toFixed(1)}%`, icon: MapPin },
    { label: 'Records updated in 30 days', value: formatCount(quality?.recordsUpdatedIn30Days), icon: RefreshCw },
  ];
  return (
    <section id="data-quality" aria-labelledby="quality-title" className="grid border border-slate-200 bg-white lg:grid-cols-[220px_repeat(3,1fr)] lg:divide-x lg:divide-slate-200">
      <div className="flex items-center px-4 py-4"><h2 id="quality-title" className="text-sm font-black">Data quality &amp; freshness</h2></div>
      {rows.map((row) => <div key={row.label} className="flex items-center gap-3 border-t border-slate-200 px-4 py-4 lg:border-t-0"><row.icon size={21} className="shrink-0 text-teal-700" /><div><p className="text-xs font-bold text-slate-600">{row.label}</p><p className="mt-1 font-mono text-lg font-black">{row.value}</p></div></div>)}
    </section>
  );
}

function Limitations({ limitations }: { limitations: string[] }) {
  return (
    <aside aria-labelledby="limitations-title" className="border-l-4 border-amber-500 bg-amber-50 px-4 py-4">
      <h2 id="limitations-title" className="flex items-center gap-2 text-sm font-black text-amber-950"><AlertCircle size={18} /> Interpretation and data limitations</h2>
      <ul className="mt-2 grid gap-2 text-xs font-semibold leading-5 text-amber-950 lg:grid-cols-3">
        {(limitations.length ? limitations : ['No approved records are available for the current view.']).map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </aside>
  );
}

function EvidenceDefinition({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <article className="p-5"><Icon size={22} className="text-teal-700" /><h2 className="mt-3 text-base font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{text}</p></article>;
}
