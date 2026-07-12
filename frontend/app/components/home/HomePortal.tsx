'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  Binary,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  Dna,
  ExternalLink,
  FileSearch,
  Globe2,
  Layers3,
  Map,
  MapPin,
  Microscope,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import HomeContact from './HomeContact';
import HomeFooter from './HomeFooter';
import HomeNavigation from './HomeNavigation';
import { useHomePortalData } from './useHomePortalData';
import type { HomeStrain } from './types';
import { evidenceLabel, formatDate } from '../surveillance/types';

const HomeGlobalMap = dynamic(() => import('./HomeGlobalMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-[#071b35]" aria-label="Loading global surveillance map" />,
});

const HomeIndiaMap = dynamic(() => import('../HomeIndiaMap'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[430px] items-center justify-center border border-slate-200 bg-[#06152e] text-sm font-black text-orange-200">
      Loading India atlas
    </div>
  ),
});

const TOOL_NAMES = ['JBrowse 2', 'IGV.js', 'NCBI BLAST'];

function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metric(value: number | null | undefined, loading: boolean) {
  if (loading) return '...';
  return typeof value === 'number' ? value.toLocaleString('en-IN') : 'N/A';
}

function percentage(value: number | null | undefined, loading: boolean) {
  if (loading) return '...';
  return typeof value === 'number' ? `${value.toFixed(1)}%` : 'N/A';
}

function formatGenomeSize(value?: number | null) {
  return value ? `${(value / 1_000_000).toFixed(2)} Mb` : 'N/A';
}

function formatGc(value?: number | string | null) {
  const parsed = numericValue(value);
  return parsed === null ? 'N/A' : `${parsed.toFixed(2)}%`;
}

function isIndiaStrain(strain: HomeStrain) {
  return strain.surveillanceScope === 'NATIONAL' || /india/i.test(strain.country || '');
}

function hasReference(strain: HomeStrain) {
  return Boolean(strain.referenceKinds?.includes('FASTA') && strain.referenceKinds.includes('FAI'));
}

function locationLabel(strain: HomeStrain) {
  return [strain.city, strain.state, strain.country].filter(Boolean).join(', ') || 'Location not reported';
}

function freshnessLabel(value?: string | null) {
  if (!value) return 'Data timestamp unavailable';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data timestamp unavailable';
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  if (elapsedMinutes < 2) return 'Updated moments ago';
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes} minutes ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Updated ${elapsedHours} hours ago`;
  return `Data through ${formatDate(value)}`;
}

export default function HomePortal() {
  const { data: session } = useSession();
  const { data, loading, refreshing, error } = useHomePortalData();
  const [registryQuery, setRegistryQuery] = useState('');

  const overview = data.overview;
  const indiaStrains = useMemo(() => data.strains.filter(isIndiaStrain), [data.strains]);
  const referenceStrains = useMemo(() => data.strains.filter(hasReference), [data.strains]);
  const firstReferenceStrain = referenceStrains[0] || null;
  const firstStrain = data.strains[0] || null;
  const firstOrganismId = firstReferenceStrain?.organismId || firstStrain?.organismId || null;
  const baseGenomeHref = firstReferenceStrain
    ? `/organisms/${firstReferenceStrain.organismId}/genome?strain=${firstReferenceStrain.id}`
    : firstOrganismId
      ? `/organisms/${firstOrganismId}/genome`
      : '/dashboard';
  const resultsHref = firstOrganismId ? `/organisms/${firstOrganismId}/results` : '/dashboard';

  const registryRows = useMemo(() => {
    const query = registryQuery.trim().toLowerCase();
    return [...data.strains]
      .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime())
      .filter((strain) => {
        if (!query) return true;
        return [
          strain.organism?.scientificName,
          strain.strainName,
          strain.sourceType,
          strain.city,
          strain.state,
          strain.country,
          strain.assemblyAccession,
        ].filter(Boolean).join(' ').toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [data.strains, registryQuery]);

  const sourceMaximum = Math.max(1, ...(overview?.sources.map((source) => source.count) || [1]));
  const latestIndiaRecords = indiaStrains.slice(0, 4);

  const workspaceRows: Array<{
    title: string;
    body: string;
    href: string;
    action: string;
    icon: LucideIcon;
    accent: string;
    value: string;
    detail: string;
  }> = [
    {
      title: 'Global Genomic Surveillance',
      body: 'Explore approved strains, international locations, MAYA outputs, AMR signals, provenance, and evidence limitations.',
      href: '/surveillance',
      action: 'Open global dashboard',
      icon: Globe2,
      accent: 'border-teal-600 text-teal-700 bg-teal-50',
      value: `${metric(overview?.metrics.countriesRepresented, loading)} countries`,
      detail: `${metric(overview?.metrics.approvedStrains, loading)} approved records`,
    },
    {
      title: 'India Genomic Surveillance',
      body: 'Investigate India-focused microbial genome records through a dynamic atlas, source summaries, and organism-level results.',
      href: '/dashboard',
      action: 'Open India dashboard',
      icon: Map,
      accent: 'border-orange-500 text-orange-700 bg-orange-50',
      value: `${metric(indiaStrains.length, loading)} India records`,
      detail: `${percentage(overview?.quality.geolocationCoveragePercent, loading)} global geolocation coverage`,
    },
    {
      title: 'Genome Analysis Workbench',
      body: 'Open published reference FASTA and GFF3 data in JBrowse 2 or IGV.js, and search approved BMGA references with NCBI BLAST+.',
      href: baseGenomeHref,
      action: 'Open genome tools',
      icon: Dna,
      accent: 'border-emerald-600 text-emerald-700 bg-emerald-50',
      value: `${metric(referenceStrains.length, loading)} reference-ready`,
      detail: TOOL_NAMES.join(' / '),
    },
  ];

  return (
    <>
      <HomeNavigation genomeHref={baseGenomeHref} />
      <main id="main-content" className="min-h-screen bg-white text-[#0B1B3A] selection:bg-orange-500/20">
        <section id="home" aria-labelledby="home-title" className="isolate relative min-h-[calc(100svh-8rem)] overflow-hidden bg-[#06152e] text-white lg:min-h-[620px]">
          <HomeGlobalMap locations={overview?.locations || []} />
          <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(4,17,38,0.98)_0%,rgba(4,17,38,0.91)_32%,rgba(4,17,38,0.38)_63%,rgba(4,17,38,0.1)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#06152e] to-transparent" />

          <div className="relative z-20 mx-auto flex min-h-[calc(100svh-8rem)] max-w-[1320px] items-center px-4 py-16 sm:px-6 lg:min-h-[620px] lg:px-8">
            <div className="max-w-3xl py-4">
              <h1 id="home-title" className="max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl lg:text-6xl xl:text-7xl">
                Microbial genomes.<br />Global context.<br /><span className="text-orange-400">Actionable evidence.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base font-semibold leading-7 text-slate-200 sm:text-lg sm:leading-8">
                Bharat Microbial Genome Atlas connects reviewed India-focused records with responsible global genomic surveillance, MAYA results, and interoperable genome analysis tools.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/surveillance" className="inline-flex min-h-12 items-center justify-center gap-2 bg-teal-700 px-6 text-sm font-black text-white shadow-lg shadow-black/15 transition hover:bg-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">
                  Explore global surveillance <ArrowRight size={17} />
                </Link>
                <Link href="/dashboard" className="inline-flex min-h-12 items-center justify-center gap-2 border border-orange-300/70 bg-[#06152e]/50 px-6 text-sm font-black text-white backdrop-blur transition hover:border-orange-300 hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
                  Open India dashboard <MapPin size={17} />
                </Link>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-slate-300" aria-live="polite">
                <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${error ? 'bg-amber-400' : 'bg-emerald-400'} ${refreshing ? 'animate-pulse' : ''}`} />{error || 'Live database connection available'}</span>
                <span className="inline-flex items-center gap-2"><Clock3 size={14} className="text-teal-300" />{loading ? 'Loading data freshness...' : freshnessLabel(overview?.dataThrough)}</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 right-8 z-30 hidden w-72 border border-white/20 bg-[#06152e]/90 p-5 shadow-2xl backdrop-blur lg:block">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <p className="text-xs font-black uppercase text-white">Data freshness</p>
              <RefreshCw className={refreshing ? 'animate-spin text-teal-300' : 'text-slate-400'} size={15} />
            </div>
            <dl className="mt-3 space-y-3 text-xs">
              <FreshnessRow label="Approved records" value={metric(overview?.metrics.approvedStrains, loading)} />
              <FreshnessRow label="Mapped locations" value={metric(overview?.locations.length, loading)} />
              <FreshnessRow label="Reference genomes" value={metric(referenceStrains.length, loading)} />
              <FreshnessRow label="Refresh cycle" value={overview ? `${overview.refreshIntervalSeconds}s` : loading ? '...' : 'N/A'} />
            </dl>
          </div>
        </section>

        <section aria-label="Live platform metrics" className="border-b border-white/10 bg-[#06152e] px-4 text-white sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-[1320px] sm:grid-cols-2 xl:grid-cols-4">
            <MetricCell icon={Globe2} label="Approved surveillance records" value={metric(overview?.metrics.approvedStrains, loading)} detail={`${metric(overview?.metrics.countriesRepresented, loading)} countries represented`} tone="text-teal-300" />
            <MetricCell icon={MapPin} label="India genome records" value={metric(indiaStrains.length, loading)} detail="Approved national-scope records" tone="text-orange-300" />
            <MetricCell icon={Database} label="Published reference genomes" value={metric(referenceStrains.length, loading)} detail="FASTA and index available" tone="text-emerald-300" />
            <MetricCell icon={ShieldAlert} label="Genotypic AMR detections" value={metric(overview?.metrics.genotypicAmrDetections, loading)} detail="Not inferred phenotypic resistance" tone="text-red-300" />
          </div>
        </section>

        <section id="workspaces" className="scroll-mt-24 bg-white px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <span id="analysis" className="scroll-mt-24" />
          <div className="mx-auto max-w-[1320px]">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black leading-tight sm:text-4xl">One portal, three scientific workspaces</h2>
              <p className="mt-4 text-base font-semibold leading-7 text-slate-600">Purpose-built views keep national discovery, international surveillance, and reference genome analysis distinct while sharing one reviewed data foundation.</p>
            </div>
            <div className="mt-12 border-y border-slate-200">
              {workspaceRows.map((workspace) => (
                <WorkspaceRow key={workspace.title} {...workspace} />
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="registry-title" className="bg-[#07172f] px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-[1320px] gap-12 xl:grid-cols-[1.35fr_0.65fr] xl:gap-16">
            <div className="min-w-0">
              <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-teal-300">Live registry pulse</p>
                  <h2 id="registry-title" className="mt-2 text-3xl font-black">Recently curated genomes</h2>
                  <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-300">Search approved portal records. Public views update when administrators approve or modify data.</p>
                </div>
                <label className="relative block w-full md:max-w-sm">
                  <span className="sr-only">Search registry preview</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                  <input value={registryQuery} onChange={(event) => setRegistryQuery(event.target.value)} placeholder="Search organism, strain, source, location" className="min-h-12 w-full border border-white/15 bg-[#0b2242] pl-11 pr-4 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20" />
                </label>
              </div>

              <div className="mt-8 hidden overflow-hidden border border-white/12 md:block">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_105px] gap-4 border-b border-white/10 bg-white/5 px-5 py-3 text-[10px] font-black uppercase text-slate-400">
                  <span>Organism / strain</span><span>Location / source</span><span>Evidence</span><span className="text-right">Open</span>
                </div>
                <div className="divide-y divide-white/10">
                  {loading ? <RegistryLoading /> : registryRows.length ? registryRows.map((strain) => <RegistryRow key={strain.id} strain={strain} />) : <RegistryEmpty query={registryQuery} />}
                </div>
              </div>

              <div className="mt-7 grid gap-3 md:hidden">
                {loading ? <RegistryLoading /> : registryRows.length ? registryRows.map((strain) => <RegistryMobileRow key={strain.id} strain={strain} />) : <RegistryEmpty query={registryQuery} />}
              </div>
              <Link href="/surveillance/records" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal-300 hover:text-white">Browse all surveillance records <ArrowRight size={16} /></Link>
            </div>

            <aside className="border-l-0 border-white/15 xl:border-l xl:pl-10" aria-labelledby="evidence-title">
              <p className="text-xs font-black uppercase text-orange-300">Evidence-aware interpretation</p>
              <h2 id="evidence-title" className="mt-2 text-2xl font-black">AMR and data quality</h2>
              <div className="mt-7 divide-y divide-white/10 border-y border-white/10">
                <EvidenceRow label="Genotypic AMR detections" value={metric(data.amr?.totalDetections, loading)} />
                <EvidenceRow label="Phenotypic evidence" value={data.amr?.interpretation.phenotypicAvailability ? 'Reported' : loading ? '...' : 'Not available'} />
                <EvidenceRow label="Collection date coverage" value={percentage(overview?.quality.collectionDateCoveragePercent, loading)} />
                <EvidenceRow label="Geolocation coverage" value={percentage(overview?.quality.geolocationCoveragePercent, loading)} />
              </div>
              <p className="mt-5 text-sm font-semibold leading-6 text-slate-400">{data.amr?.interpretation.statement || 'AMR interpretation loads from the approved surveillance dataset. Genotype is never presented as confirmed phenotype.'}</p>

              <h3 className="mt-8 text-sm font-black">Sampling sources</h3>
              <div className="mt-4 space-y-4">
                {overview?.sources.length ? overview.sources.slice(0, 5).map((source) => (
                  <div key={source.label}>
                    <div className="flex items-center justify-between gap-4 text-xs font-bold"><span className="truncate text-slate-300">{source.label}</span><span className="font-mono text-white">{source.count.toLocaleString('en-IN')}</span></div>
                    <div className="mt-2 h-1.5 bg-white/10"><div className="h-full bg-teal-500" style={{ width: `${Math.max(3, (source.count / sourceMaximum) * 100)}%` }} /></div>
                  </div>
                )) : <p className="text-sm font-semibold text-slate-400">{loading ? 'Loading source distribution...' : 'No source metadata is available yet.'}</p>}
              </div>
              <Link href="/surveillance/methodology" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-black text-orange-300 hover:text-white">Review evidence methodology <ArrowRight size={16} /></Link>
            </aside>
          </div>
        </section>

        <section id="india-atlas" className="scroll-mt-24 bg-slate-50 px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase text-orange-600">India atlas</p>
                <h2 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">National records in geographic context</h2>
              </div>
              <p className="text-base font-semibold leading-7 text-slate-600">Markers are generated from approved latitude and longitude metadata. Open a record to review its organism, strain, source, genome statistics, and available MAYA outputs.</p>
            </div>
            <div className="mt-10 grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
              <HomeIndiaMap strains={data.strains} loading={loading} error={!data.strains.length ? error : null} />
              <div className="border-y border-slate-200 bg-white px-5">
                <div className="flex items-center justify-between border-b border-slate-200 py-5">
                  <h3 className="text-lg font-black">Latest India records</h3>
                  <span className="font-mono text-sm font-black text-orange-600">{metric(indiaStrains.length, loading)}</span>
                </div>
                <div className="divide-y divide-slate-200">
                  {latestIndiaRecords.length ? latestIndiaRecords.map((strain) => (
                    <Link key={strain.id} href={`/organisms/${strain.organismId}/results`} className="group block py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0"><p className="truncate text-sm font-black italic group-hover:text-orange-700">{strain.organism?.scientificName || 'Unknown organism'}</p><p className="mt-1 truncate font-mono text-xs font-bold text-slate-500">{strain.strainName || 'Unnamed strain'}</p></div>
                        <ArrowRight className="shrink-0 text-slate-400 transition group-hover:translate-x-1 group-hover:text-orange-600" size={16} />
                      </div>
                      <p className="mt-3 text-xs font-bold text-slate-500">{locationLabel(strain)}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-bold text-slate-400"><span>{formatGenomeSize(strain.genomeSize)}</span><span>GC {formatGc(strain.gcContent)}</span></div>
                    </Link>
                  )) : <p className="py-10 text-sm font-semibold leading-6 text-slate-500">{loading ? 'Loading India records...' : 'No approved India records are available yet.'}</p>}
                </div>
                <Link href="/dashboard" className="my-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-orange-700 hover:text-[#0B1B3A]">Open complete India dashboard <ArrowRight size={16} /></Link>
              </div>
            </div>
          </div>
        </section>

        <section id="guide" className="scroll-mt-24 bg-white px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <span id="downloads" className="scroll-mt-24" />
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase text-emerald-700">Genome toolset</p>
                <h2 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">Inspect, compare, and search published references</h2>
              </div>
              <p className="text-base font-semibold leading-7 text-slate-600">Tool availability is calculated from published FASTA, FAI, and GFF3 records. Private uploads and pending submissions are never exposed here.</p>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <ToolCard icon={Layers3} title="JBrowse 2" body="Navigate indexed reference sequences and available GFF3 annotations." href={`${baseGenomeHref}${baseGenomeHref.includes('?') ? '&' : '?'}tool=jbrowse`} availability={firstReferenceStrain ? `${firstReferenceStrain.organism?.scientificName || 'Reference'} ready` : 'No published FASTA/FAI yet'} ready={Boolean(firstReferenceStrain)} />
              <ToolCard icon={Binary} title="IGV.js" body="Inspect reference assemblies and annotations in a focused genome viewer." href={`${baseGenomeHref}${baseGenomeHref.includes('?') ? '&' : '?'}tool=igv`} availability={firstReferenceStrain ? `${firstReferenceStrain.referenceKinds?.includes('GFF3') ? 'FASTA and GFF3' : 'FASTA'} available` : 'No published reference yet'} ready={Boolean(firstReferenceStrain)} />
              <ToolCard icon={FileSearch} title="NCBI BLAST+" body="Search nucleotide queries against approved BMGA reference FASTA data." href={session ? `${baseGenomeHref}${baseGenomeHref.includes('?') ? '&' : '?'}tool=blast` : '/login'} availability={!session ? 'Sign in required' : firstReferenceStrain ? `${referenceStrains.length.toLocaleString('en-IN')} references searchable` : 'No searchable FASTA yet'} ready={Boolean(session && firstReferenceStrain)} />
              <ToolCard icon={Code2} title="FAIR Data & API" body="Discover machine-readable metadata, checksums, API routes, and reuse conditions." href="/fair" availability="DCAT 3 / Bioschemas" ready />
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-10 lg:grid-cols-[0.68fr_1.32fr] lg:items-start">
              <div>
                <p className="text-xs font-black uppercase text-teal-700">Reviewed data lifecycle</p>
                <h2 className="mt-2 text-3xl font-black leading-tight">From submission to reusable evidence</h2>
                <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">Every public record passes through a controlled approval workflow with provenance, evidence labels, audit history, and documented use limitations.</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link href={session ? '/submit-organism' : '/login'} className="inline-flex min-h-12 items-center justify-center gap-2 bg-[#0B1B3A] px-5 text-sm font-black text-white hover:bg-teal-700"><UploadCloud size={17} /> Contribute data</Link>
                  <Link href="/fair" className="inline-flex min-h-12 items-center justify-center gap-2 border border-slate-300 bg-white px-5 text-sm font-black text-[#0B1B3A] hover:border-orange-400"><BookOpenCheck size={17} /> Review FAIR access</Link>
                </div>
              </div>
              <ol className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-5">
                <LifecycleStep number="01" icon={UploadCloud} title="Submit" body="Metadata, MAYA results, and reference files enter a private review queue." />
                <LifecycleStep number="02" icon={CheckCircle2} title="Validate" body="File formats, required metadata, and reference compatibility are checked." />
                <LifecycleStep number="03" icon={Microscope} title="Review" body="Authorized reviewers evaluate provenance, evidence, and limitations." />
                <LifecycleStep number="04" icon={Database} title="Publish" body="Approved records become visible through stable public routes." />
                <LifecycleStep number="05" icon={Globe2} title="Reuse" body="Researchers access documented records, files, APIs, and tools." />
              </ol>
            </div>
          </div>
        </section>

        <section id="projects" className="scroll-mt-24 bg-white px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-[1320px]">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-black sm:text-4xl">Programs connected by one data foundation</h2>
              <p className="mt-4 text-base font-semibold leading-7 text-slate-600">BMGA combines national microbial genomics, international surveillance, analysis tooling, and reusable scientific metadata without mixing their interpretation boundaries.</p>
            </div>
            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              <ProjectCard icon={Map} title="Bharat Microbial Genome Atlas" body="India-focused organism discovery, geographic source context, MAYA outputs, and curated microbial genome metadata." href="/dashboard" accent="bg-orange-500" />
              <ProjectCard icon={Globe2} title="Global Surveillance Network" body="A dedicated worldwide view of approved strain data, freshness, AMR signals, and clearly separated evidence types." href="/surveillance" accent="bg-teal-600" />
              <ProjectCard icon={Dna} title="Open Genome Analysis" body="Reference-aware genome browsers, authenticated BLAST search, machine-readable metadata, and FAIR reuse guidance." href={baseGenomeHref} accent="bg-emerald-600" />
            </div>
          </div>
        </section>

        <section id="accessibility" className="scroll-mt-24 border-y border-slate-200 bg-[#f4f7fa] px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-4xl gap-4">
              <ShieldCheck className="mt-1 shrink-0 text-teal-700" size={25} />
              <div><h2 className="text-lg font-black">Accessible, evidence-aware scientific access</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Keyboard navigation, visible focus states, responsive data views, explicit freshness, and genotypic-versus-phenotypic labels are part of the portal interface.</p></div>
            </div>
            <Link href="/privacy" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-black text-[#0B1B3A] hover:text-orange-700">Privacy and data use <ExternalLink size={15} /></Link>
          </div>
        </section>

        <HomeContact />
      </main>
      <HomeFooter genomeHref={baseGenomeHref} resultsHref={resultsHref} signedIn={Boolean(session)} />
    </>
  );
}

function FreshnessRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><dt className="font-semibold text-slate-400">{label}</dt><dd className="font-mono font-black text-white">{value}</dd></div>;
}

function MetricCell({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="flex min-h-32 gap-4 border-b border-white/10 py-6 sm:px-5 sm:first:pl-0 xl:border-b-0 xl:border-r xl:last:border-r-0">
      <Icon className={`mt-1 shrink-0 ${tone}`} size={25} />
      <div><p className="font-mono text-2xl font-black">{value}</p><h2 className="mt-1 text-xs font-black uppercase text-slate-300">{label}</h2><p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p></div>
    </div>
  );
}

function WorkspaceRow({ title, body, href, action, icon: Icon, accent, value, detail }: { title: string; body: string; href: string; action: string; icon: LucideIcon; accent: string; value: string; detail: string }) {
  return (
    <article className="grid gap-5 border-b border-slate-200 py-7 last:border-b-0 lg:grid-cols-[84px_minmax(0,1.3fr)_minmax(220px,0.7fr)_210px] lg:items-center">
      <div className={`flex h-16 w-16 items-center justify-center border ${accent}`}><Icon size={28} /></div>
      <div><h3 className="text-xl font-black">{title}</h3><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">{body}</p></div>
      <div><p className="font-mono text-lg font-black text-[#0B1B3A]">{value}</p><p className="mt-1 text-xs font-bold text-slate-500">{detail}</p></div>
      <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal-800 hover:text-orange-700 lg:justify-end">{action} <ArrowRight size={16} /></Link>
    </article>
  );
}

function RegistryRow({ strain }: { strain: HomeStrain }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_105px] items-center gap-4 px-5 py-4 text-sm">
      <div className="min-w-0"><p className="truncate font-black italic text-white">{strain.organism?.scientificName || 'Unknown organism'}</p><p className="mt-1 truncate font-mono text-xs font-bold text-orange-300">{strain.strainName || 'Unnamed strain'}</p></div>
      <div className="min-w-0"><p className="truncate font-bold text-slate-300">{locationLabel(strain)}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{strain.sourceType || 'Source not reported'}</p></div>
      <p className="text-xs font-black text-teal-300">{evidenceLabel(strain.evidenceBasis)}</p>
      <div className="flex justify-end gap-2"><Link href={`/organisms/${strain.organismId}/results`} title="Open MAYA results" aria-label={`Open results for ${strain.organism?.scientificName || strain.strainName}`} className="inline-flex h-10 w-10 items-center justify-center border border-white/15 text-white hover:border-orange-300 hover:text-orange-300"><BarChart3 size={16} /></Link>{hasReference(strain) && <Link href={`/organisms/${strain.organismId}/genome?strain=${strain.id}`} title="Open genome tools" aria-label={`Open genome tools for ${strain.organism?.scientificName || strain.strainName}`} className="inline-flex h-10 w-10 items-center justify-center border border-white/15 text-white hover:border-teal-300 hover:text-teal-300"><Dna size={16} /></Link>}</div>
    </div>
  );
}

function RegistryMobileRow({ strain }: { strain: HomeStrain }) {
  return (
    <article className="border border-white/12 bg-white/[0.03] p-4">
      <p className="font-black italic">{strain.organism?.scientificName || 'Unknown organism'}</p><p className="mt-1 font-mono text-xs font-bold text-orange-300">{strain.strainName || 'Unnamed strain'}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs"><dt className="font-bold text-slate-500">Location</dt><dd className="font-semibold text-slate-300">{locationLabel(strain)}</dd><dt className="font-bold text-slate-500">Evidence</dt><dd className="font-semibold text-teal-300">{evidenceLabel(strain.evidenceBasis)}</dd></dl>
      <div className="mt-4 flex gap-2"><Link href={`/organisms/${strain.organismId}/results`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-white/10 px-3 text-xs font-black text-white"><BarChart3 size={15} /> Results</Link>{hasReference(strain) && <Link href={`/organisms/${strain.organismId}/genome?strain=${strain.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-teal-400/40 px-3 text-xs font-black text-teal-200"><Dna size={15} /> Genome</Link>}</div>
    </article>
  );
}

function RegistryLoading() {
  return <div className="flex min-h-36 items-center justify-center gap-3 p-6 text-sm font-bold text-slate-400"><RefreshCw className="animate-spin" size={18} /> Loading approved records...</div>;
}

function RegistryEmpty({ query }: { query: string }) {
  return <div className="min-h-36 p-7 text-sm font-semibold leading-6 text-slate-400">{query ? 'No approved records match this search.' : 'No approved organism records are available yet.'}</div>;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-5 py-4 text-sm"><span className="font-semibold text-slate-300">{label}</span><span className="font-mono font-black text-white">{value}</span></div>;
}

function ToolCard({ icon: Icon, title, body, href, availability, ready }: { icon: LucideIcon; title: string; body: string; href: string; availability: string; ready: boolean }) {
  return (
    <article className="flex min-h-64 flex-col border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-4"><span className="flex h-12 w-12 items-center justify-center bg-[#0B1B3A] text-white"><Icon size={22} /></span><span className={`mt-1 h-2.5 w-2.5 rounded-full ${ready ? 'bg-emerald-500' : 'bg-slate-300'}`} title={ready ? 'Available' : 'Not currently available'} /></div>
      <h3 className="mt-6 text-xl font-black">{title}</h3><p className="mt-3 flex-1 text-sm font-semibold leading-6 text-slate-600">{body}</p><p className={`mt-5 text-xs font-black ${ready ? 'text-emerald-700' : 'text-slate-500'}`}>{availability}</p>
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-black text-orange-700 hover:text-[#0B1B3A]">Open tool <ArrowRight size={15} /></Link>
    </article>
  );
}

function LifecycleStep({ number, icon: Icon, title, body }: { number: string; icon: LucideIcon; title: string; body: string }) {
  return <li className="min-h-52 bg-white p-5"><div className="flex items-center justify-between"><Icon className="text-teal-700" size={22} /><span className="font-mono text-xs font-black text-slate-400">{number}</span></div><h3 className="mt-8 text-base font-black">{title}</h3><p className="mt-3 text-xs font-semibold leading-5 text-slate-600">{body}</p></li>;
}

function ProjectCard({ icon: Icon, title, body, href, accent }: { icon: LucideIcon; title: string; body: string; href: string; accent: string }) {
  return <article className="relative flex min-h-72 flex-col overflow-hidden border border-slate-200 bg-white p-7 shadow-sm"><span className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} /><Icon className="text-[#0B1B3A]" size={29} /><h3 className="mt-8 text-xl font-black">{title}</h3><p className="mt-4 flex-1 text-sm font-semibold leading-7 text-slate-600">{body}</p><Link href={href} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-black text-orange-700 hover:text-[#0B1B3A]">Explore program <ArrowRight size={16} /></Link></article>;
}
