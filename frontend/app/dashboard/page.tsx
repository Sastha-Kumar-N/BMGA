'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Binary,
  CheckCircle2,
  Clock3,
  Database,
  Dna,
  FileSearch,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Microscope,
  RefreshCcw,
  Search,
  ShieldAlert,
  TestTube2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../lib/api-client';
import { BRAND_FULL_NAME } from '../lib/brand';
import BrandLogo from '../components/BrandLogo';
import type { AtlasStrain } from '../components/IndiaOrganismAtlas';

const IndiaOrganismAtlas = dynamic(() => import('../components/IndiaOrganismAtlas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[620px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white">
      <div className="text-center">
        <Globe2 className="mx-auto mb-4 animate-spin text-orange-500" size={34} />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Initializing India organism atlas</p>
      </div>
    </div>
  ),
});

type OrganismRecord = {
  id: number;
  scientificName?: string | null;
  taxonomyId?: number | null;
  domain?: string | null;
  phylum?: string | null;
  genus?: string | null;
  species?: string | null;
  description?: string | null;
};

type StrainRecord = AtlasStrain & {
  organism?: OrganismRecord | null;
  isolateName?: string | null;
  strainCode?: string | null;
  bioprojectAccession?: string | null;
  genomeStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  evidenceBasis?: string | null;
  lastVerifiedAt?: string | null;
  referenceKinds?: string[];
};

type AmrAlert = {
  id: number;
  geneSymbol?: string | null;
  drugClass?: string | null;
  identity?: number | null;
  strainId: number;
  strain?: {
    id: number;
    strainName?: string | null;
    organismId?: number | null;
  } | null;
};

type SummaryData = {
  recentStrains: StrainRecord[];
  recentAmr: AmrAlert[];
};

const EMPTY_SUMMARY: SummaryData = {
  recentStrains: [],
  recentAmr: [],
};

const SOURCE_COLORS = {
  clinical: '#2563eb',
  environmental: '#16a34a',
  animal: '#f97316',
  food: '#7c3aed',
  other: '#64748b',
};

function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatGenomeSize(value?: number | null) {
  if (!value) return 'N/A';
  return `${(value / 1_000_000).toFixed(2)} Mb`;
}

function formatGc(value?: number | string | null) {
  const parsed = numericValue(value);
  return parsed === null ? 'N/A' : `${parsed.toFixed(2)}%`;
}

function locationLabel(strain?: StrainRecord | null) {
  if (!strain) return 'Unknown source';
  return [strain.city, strain.state, strain.country].filter(Boolean).join(', ') || 'Unknown source';
}

function uniqueOrganismCount(strains: StrainRecord[]) {
  return new Set(strains.map((strain) => strain.organismId)).size;
}

function uniqueLocationCount(strains: StrainRecord[]) {
  return new Set(strains.map((strain) => locationLabel(strain))).size;
}

function countRecentRecords(strains: StrainRecord[], days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return strains.filter((strain) => {
    if (!strain.createdAt) return false;
    const createdAt = new Date(strain.createdAt);
    return Number.isFinite(createdAt.getTime()) && createdAt >= cutoff;
  }).length;
}

function visibleAmrAlerts(alerts: AmrAlert[], strains: StrainRecord[]) {
  const visibleIds = new Set(strains.map((strain) => strain.id));
  return alerts.filter((alert) => visibleIds.has(alert.strainId));
}

function isHighRiskAlert(alert: AmrAlert) {
  const identity = alert.identity || 0;
  const drugClass = (alert.drugClass || '').toLowerCase();
  return identity >= 99 || /carbapenem|colistin|critical|beta-lactam|glycopeptide/.test(drugClass);
}

function sourceGroup(sourceType?: string | null) {
  const normalized = (sourceType || '').toLowerCase();
  if (/clinical|hospital|patient/.test(normalized)) return { key: 'clinical', source: 'Clinical (Hospital)', color: SOURCE_COLORS.clinical };
  if (/environment|soil|river|water|wastewater/.test(normalized)) return { key: 'environmental', source: 'Environmental', color: SOURCE_COLORS.environmental };
  if (/animal|poultry|livestock/.test(normalized)) return { key: 'animal', source: 'Animal & Poultry', color: SOURCE_COLORS.animal };
  if (/food|milk|meat|fish/.test(normalized)) return { key: 'food', source: 'Food & Water', color: SOURCE_COLORS.food };
  return { key: 'other', source: 'Other', color: SOURCE_COLORS.other };
}

function sourceBreakdown(strains: StrainRecord[]) {
  const counts = new Map<string, number>();
  strains.forEach((strain) => {
    const group = sourceGroup(strain.sourceType);
    counts.set(group.key, (counts.get(group.key) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([key, count]) => ({
      ...sourceGroup(key),
      count,
      percent: strains.length ? (count / strains.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== '';
}

function genomeCoverageScore(strains: StrainRecord[]) {
  if (!strains.length) return 0;

  const fields = strains.map((strain) => {
    const values = [
      strain.organism?.scientificName,
      strain.organism?.taxonomyId,
      strain.strainName,
      strain.sourceType,
      strain.city || strain.state || strain.country,
      strain.latitude,
      strain.longitude,
      strain.genomeSize,
      strain.gcContent,
      strain.biosampleAccession || strain.assemblyAccession,
    ];
    return values.filter(hasValue).length / values.length;
  });

  return (fields.reduce((sum, value) => sum + value, 0) / fields.length) * 100;
}

function metadataNumber(strain: StrainRecord, keys: string[]) {
  for (const key of keys) {
    const raw = strain.metadata?.[key];
    if (raw === null || raw === undefined) continue;
    const parsed = Number(String(raw).replace(/[xX]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function medianDepthLabel(strains: StrainRecord[]) {
  const depths = strains
    .map((strain) => metadataNumber(strain, ['medianDepth', 'depth', 'coverageDepth', 'coverage']))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (!depths.length) return 'Median depth N/A';
  const midpoint = Math.floor(depths.length / 2);
  const median = depths.length % 2 === 0 ? (depths[midpoint - 1] + depths[midpoint]) / 2 : depths[midpoint];
  return `Median depth ${median.toFixed(1)}x`;
}

function formatIndianNumber(value: number) {
  return value.toLocaleString('en-IN');
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [strains, setStrains] = useState<StrainRecord[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData>(EMPTY_SUMMARY);
  const [selectedStrainId, setSelectedStrainId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [strainsResponse, summaryResponse] = await Promise.all([
          fetch(apiPath('/strains'), { cache: 'no-store' }),
          fetch(apiPath('/dashboard/summary'), { cache: 'no-store' }),
        ]);

        const [strainRecords, summaryRecords] = await Promise.all([
          strainsResponse.ok ? strainsResponse.json() as Promise<StrainRecord[]> : Promise.resolve([]),
          summaryResponse.ok ? summaryResponse.json() as Promise<SummaryData> : Promise.resolve(EMPTY_SUMMARY),
        ]);

        if (!isMounted) return;
        setStrains(strainRecords);
        setSummaryData(summaryRecords);
      } catch (error) {
        console.error('Dashboard data load failed', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredStrains = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return strains;

    return strains.filter((strain) => {
      const searchable = [
        strain.organism?.scientificName,
        strain.strainName,
        strain.isolateName,
        strain.sourceType,
        strain.city,
        strain.state,
        strain.country,
        strain.biosampleAccession,
        strain.assemblyAccession,
      ].filter(Boolean).join(' ').toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [query, strains]);

  const selectedStrain = useMemo(() => (
    (selectedStrainId ? strains.find((strain) => strain.id.toString() === selectedStrainId) : null)
    || filteredStrains[0]
    || strains[0]
    || null
  ), [filteredStrains, selectedStrainId, strains]);

  const activeResultStrains = useMemo(() => (
    selectedStrainId && selectedStrain ? [selectedStrain] : filteredStrains
  ), [filteredStrains, selectedStrain, selectedStrainId]);

  const activeAlerts = useMemo(() => (
    visibleAmrAlerts(summaryData.recentAmr, activeResultStrains)
  ), [activeResultStrains, summaryData.recentAmr]);

  const mappedPointCount = useMemo(() => (
    activeResultStrains.filter((strain) => numericValue(strain.latitude) !== null && numericValue(strain.longitude) !== null).length
  ), [activeResultStrains]);

  const openOrganismResults = (organismId?: number | null) => {
    if (!organismId) return;
    router.push(`/organisms/${organismId}/results`);
  };

  const openGenomeTools = (tool: 'jbrowse' | 'igv' | 'blast' = 'jbrowse') => {
    if (!selectedStrain?.organismId || !selectedStrain.id) return;
    router.push(`/organisms/${selectedStrain.organismId}/genome?strain=${selectedStrain.id}&tool=${tool}`);
  };
  const openGenomeToolsFor = (strain: StrainRecord) => {
    router.push(`/organisms/${strain.organismId}/genome?strain=${strain.id}`);
  };

  const scrollToAtlas = () => {
    document.getElementById('india-atlas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1B3A] text-orange-400">
        <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest">
          <RefreshCcw className="animate-spin" size={18} />
          Synchronizing dashboard session
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#f6f8fb] text-slate-900 selection:bg-orange-500/20">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-white/10 bg-[#0B1B3A] px-5 py-6 text-white xl:flex">
        <button onClick={() => setSelectedStrainId('')} className="mb-8 text-left" aria-label={`${BRAND_FULL_NAME} dashboard home`}>
          <BrandLogo variant="light" />
        </button>

        <nav className="space-y-2">
          <SidebarButton active icon={LayoutDashboard} label="Dashboard" onClick={() => setSelectedStrainId('')} />
          <SidebarButton icon={MapPin} label="India Atlas" onClick={scrollToAtlas} />
          <SidebarButton icon={Microscope} label="MAYA Results" onClick={() => openOrganismResults(selectedStrain?.organismId)} disabled={!selectedStrain} />
          <SidebarButton icon={Binary} label="Genome Toolset" onClick={() => openGenomeTools()} disabled={!selectedStrain} />
          <Link href="/surveillance" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-teal-200 transition hover:bg-teal-500/10 hover:text-white">
            <Globe2 size={17} />
            Global Surveillance
          </Link>
          {session?.user?.role === 'ADMIN' && (
            <Link href="/admin" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white">
              <Lock size={17} />
              Admin Portal
            </Link>
          )}
          <Link href="/fair" className="flex items-center gap-3 rounded-md px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white">
            <FileSearch size={17} />
            FAIR Data
          </Link>
        </nav>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Selected organism</p>
          <p className="mt-2 text-sm font-black italic leading-tight text-white">
            {selectedStrain?.organism?.scientificName || 'Awaiting selection'}
          </p>
          <p className="mt-1 text-xs font-bold text-orange-300">{selectedStrain?.strainName || 'No active strain'}</p>
        </div>

        <div className="mt-auto border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Active Session</p>
              <p className="truncate text-sm font-black text-white">{session?.user?.name || 'Guest Researcher'}</p>
            </div>
            {session ? (
              <button onClick={() => signOut()} className="rounded-xl p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-300" aria-label="Sign out">
                <LogOut size={16} />
              </button>
            ) : (
              <Link href="/login" className="rounded-xl bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-[#0B1B3A]">
                Login
              </Link>
            )}
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-[#0B1B3A] md:text-4xl">India Genomic Surveillance</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">Approved national genome records, MAYA evidence, AMR signals, and interoperable reference tools.</p>
              <Link href="/surveillance" className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase text-teal-700 xl:hidden"><Globe2 size={15} /> Global Surveillance</Link>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <label className="relative min-w-0 flex-1 lg:w-[420px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedStrainId('');
                  }}
                  placeholder="Search organism, strain, source, accession..."
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-[#0B1B3A] outline-none transition focus:border-orange-500 focus:bg-white"
                />
              </label>
              <select
                value={selectedStrainId}
                onChange={(event) => setSelectedStrainId(event.target.value)}
                className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-[#0B1B3A] outline-none transition focus:border-orange-500"
              >
                <option value="">Select registry record</option>
                {filteredStrains.map((strain) => (
                  <option key={strain.id} value={strain.id}>
                    {strain.strainName || 'Unnamed strain'} | {strain.organism?.scientificName || 'Unknown organism'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-6 md:px-8">
          <DataFreshnessBanner strains={activeResultStrains} />

          <OperationalMetricsStrip
            strains={activeResultStrains}
            allStrains={strains}
            alerts={activeAlerts}
            allAlerts={summaryData.recentAmr}
          />

          <section id="india-atlas" className="scroll-mt-24 grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="min-w-0 border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase text-orange-600">National geospatial registry</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0B1B3A]">India Organism Atlas</h2>
                  <p className="mt-1 max-w-3xl text-xs font-bold leading-5 text-slate-500">Markers are generated from current approved latitude and longitude records. Select a point to synchronize the dossier, registry, AMR signals, and genome tools.</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase text-slate-500">
                  <span className="bg-slate-100 px-3 py-2">{mappedPointCount} mapped</span>
                  <span className="bg-orange-50 px-3 py-2 text-orange-700">{activeResultStrains.length} active records</span>
                </div>
              </div>
              <IndiaOrganismAtlas
                strains={activeResultStrains}
                activeStrainId={selectedStrainId ? selectedStrain?.id : null}
                onOpenOrganism={openOrganismResults}
              />
            </div>
            <div className="space-y-5">
              <SelectedDossier strain={selectedStrain} onOpenOrganism={openOrganismResults} onOpenGenome={openGenomeTools} />
              <EvidenceBoundary />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">Organism Registry</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">Scientific sample metadata and accession links from the current dataset.</p>
                </div>
                <button
                  onClick={scrollToAtlas}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-xs font-black uppercase text-[#0B1B3A] transition hover:border-orange-500 hover:text-orange-600"
                >
                  View atlas <ArrowUpRight size={14} />
                </button>
              </div>
              <RegistryTable
                loading={loading}
                strains={filteredStrains}
                selectedId={selectedStrain?.id || null}
                onSelect={(strainId) => setSelectedStrainId(strainId.toString())}
                onOpenOrganism={openOrganismResults}
                onOpenGenome={openGenomeToolsFor}
              />
            </div>
            <GenomeToolsetPanel strain={selectedStrain} onOpen={openGenomeTools} />
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <AmrPanel alerts={activeAlerts} strains={activeResultStrains} onSelect={(strainId) => setSelectedStrainId(strainId.toString())} />
            <SamplingSourceDonut strains={activeResultStrains} totalRecords={strains.length} />
          </section>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-50 flex h-1.5">
          <div className="flex-1 bg-orange-500" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>
      </main>
    </div>
  );
}

function SidebarButton({ active = false, disabled = false, icon: Icon, label, onClick }: {
  active?: boolean;
  disabled?: boolean;
  icon: typeof Dna;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-bold transition ${
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
          : disabled
            ? 'cursor-not-allowed text-slate-600'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
      }`}
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function DataFreshnessBanner({ strains }: { strains: StrainRecord[] }) {
  const timestamps = strains
    .map((strain) => strain.lastVerifiedAt || strain.updatedAt || strain.createdAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => Number.isFinite(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  const latest = timestamps[0];
  const genotypic = strains.filter((strain) => strain.evidenceBasis === 'GENOTYPIC' || strain.evidenceBasis === 'COMBINED').length;
  const phenotypic = strains.filter((strain) => strain.evidenceBasis === 'PHENOTYPIC' || strain.evidenceBasis === 'COMBINED').length;

  return (
    <section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-[1.1fr_1fr_1fr_2fr]">
      <SignalCell icon={Clock3} label="Data Freshness" value={latest ? latest.toLocaleString() : 'N/A'} tone="slate" />
      <SignalCell icon={Dna} label="Genotypic Evidence" value={strains.length ? `${genotypic} records` : 'N/A'} tone="teal" />
      <SignalCell icon={TestTube2} label="Phenotypic Evidence" value={strains.length ? `${phenotypic} records` : 'N/A'} tone="orange" />
      <div className="bg-white px-5 py-4 text-xs font-semibold leading-5 text-slate-600">
        Sequence-derived MAYA and AMR findings are genotypic unless linked laboratory susceptibility evidence is explicitly present. Freshness reflects the latest verified or updated record in the active dataset.
      </div>
    </section>
  );
}

function SignalCell({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: 'slate' | 'teal' | 'orange' }) {
  const tones = { slate: 'text-slate-600 bg-slate-100', teal: 'text-teal-700 bg-teal-50', orange: 'text-orange-700 bg-orange-50' };
  return <div className="flex items-center gap-3 bg-white px-5 py-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center ${tones[tone]}`}><Icon size={18} /></span><span><span className="block text-[9px] font-black uppercase text-slate-400">{label}</span><span className="mt-1 block text-xs font-black text-[#0B1B3A]">{value}</span></span></div>;
}

function EvidenceBoundary() {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5">
      <p className="text-[10px] font-black uppercase text-amber-700">Interpretation Boundary</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-amber-950">Dashboard alerts support surveillance review. They do not establish phenotype, transmission, pathogenicity, or a clinical treatment recommendation.</p>
    </section>
  );
}

function GenomeToolsetPanel({ strain, onOpen }: { strain: StrainRecord | null; onOpen: (tool: 'jbrowse' | 'igv' | 'blast') => void }) {
  const referenceReady = Boolean(strain?.referenceKinds?.includes('FASTA') && strain.referenceKinds.includes('FAI'));
  const tools: Array<{ id: 'jbrowse' | 'igv' | 'blast'; label: string; detail: string; icon: LucideIcon; requiresReference: boolean }> = [
    { id: 'jbrowse', label: 'JBrowse 2', detail: 'Reference sequence and GFF3 annotations', icon: Binary, requiresReference: true },
    { id: 'igv', label: 'IGV.js', detail: 'Interactive sequence and annotation tracks', icon: BarChart3, requiresReference: true },
    { id: 'blast', label: 'NCBI BLAST+', detail: 'Similarity search across approved BMGA FASTA', icon: Search, requiresReference: false },
  ];
  return (
    <aside className="border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><p className="text-[10px] font-black uppercase text-orange-600">Integrated Analysis</p><h2 className="mt-1 text-xl font-black">Genomic Toolset</h2><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">Tools are bound to the selected strain and approved reference files.</p></div>
      <div className="divide-y divide-slate-100">
        {tools.map((tool) => {
          const available = Boolean(strain) && (!tool.requiresReference || referenceReady);
          return <button key={tool.id} type="button" onClick={() => onOpen(tool.id)} disabled={!strain} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#0B1B3A] text-white"><tool.icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black">{tool.label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{tool.detail}</span></span><span className={`shrink-0 px-2 py-1 text-[9px] font-black uppercase ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{available ? 'Open' : tool.requiresReference ? 'Needs FASTA' : 'Select strain'}</span></button>;
        })}
      </div>
    </aside>
  );
}

function OperationalMetricsStrip({ strains, allStrains, alerts, allAlerts }: {
  strains: StrainRecord[];
  allStrains: StrainRecord[];
  alerts: AmrAlert[];
  allAlerts: AmrAlert[];
}) {
  const newThisMonth = countRecentRecords(strains, 30);
  const highRisk = alerts.filter(isHighRiskAlert).length;
  const domainCounts = strains.reduce<Record<string, number>>((acc, strain) => {
    const domain = strain.organism?.domain || 'Unknown';
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {});
  const domainSummary = Object.entries(domainCounts)
    .slice(0, 3)
    .map(([domain, count]) => `${domain} ${count}`)
    .join('   ') || 'No domain metadata';

  return (
    <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
        <KpiCell
          icon={Database}
          label="Genome Records"
          value={formatIndianNumber(strains.length)}
          detail={`${formatIndianNumber(allStrains.length)} total records`}
          tone="orange"
        />
        <KpiCell
          icon={Activity}
          label="New This 30 Days"
          value={formatIndianNumber(newThisMonth)}
          detail="Current result set"
          tone="emerald"
        />
        <KpiCell
          icon={MapPin}
          label="Unique Locations"
          value={formatIndianNumber(uniqueLocationCount(strains))}
          detail={`${mappedRecords(strains)} mapped coordinates`}
          tone="blue"
        />
        <KpiCell
          icon={Microscope}
          label="Organisms Tracked"
          value={formatIndianNumber(uniqueOrganismCount(strains))}
          detail={domainSummary}
          tone="slate"
        />
        <KpiCell
          icon={ShieldAlert}
          label="AMR Detections"
          value={formatIndianNumber(alerts.length)}
          detail={`${formatIndianNumber(allAlerts.length)} total alerts`}
          tone="red"
          emphasis
        />
        <KpiCell
          icon={AlertTriangle}
          label="High-Risk Alerts"
          value={formatIndianNumber(highRisk)}
          detail="Identity/drug-class flagged"
          tone="red"
          emphasis
        />
        <KpiCell
          icon={CheckCircle2}
          label="Metadata Completeness"
          value={`${genomeCoverageScore(strains).toFixed(1)}%`}
          detail={medianDepthLabel(strains)}
          tone="emerald"
          ring
        />
      </div>
    </section>
  );
}

function mappedRecords(strains: StrainRecord[]) {
  return strains.filter((strain) => numericValue(strain.latitude) !== null && numericValue(strain.longitude) !== null).length;
}

function KpiCell({ icon: Icon, label, value, detail, tone, emphasis = false, ring = false }: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: 'orange' | 'emerald' | 'blue' | 'red' | 'slate';
  emphasis?: boolean;
  ring?: boolean;
}) {
  const toneClasses = {
    orange: 'bg-orange-50 text-orange-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="flex min-h-28 items-center gap-4 border-b border-r border-slate-100 px-5 py-4">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${toneClasses[tone]} ${ring ? 'ring-4 ring-emerald-100' : ''}`}>
        <Icon size={23} />
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-black uppercase leading-snug tracking-widest ${emphasis ? 'text-red-500' : 'text-slate-500'}`}>{label}</p>
        <p className={`mt-1 text-2xl font-black tracking-tight ${emphasis ? 'text-red-600' : 'text-[#0B1B3A]'}`}>{value}</p>
        <p className="mt-1 text-[11px] font-bold leading-snug text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function SamplingSourceDonut({ strains, totalRecords }: { strains: StrainRecord[]; totalRecords: number }) {
  const data = sourceBreakdown(strains);
  const totalSamples = strains.length;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">Sampling Sources (Top 5)</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">Composition recalculates from the active dashboard result set.</p>
        </div>
        <div className="rounded-md bg-blue-50 p-3 text-blue-600">
          <Database size={22} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="h-56">
          {data.length ? (
            <DonutChart data={data} total={totalSamples} />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-xs font-bold text-slate-400">
              No source metadata
            </div>
          )}
        </div>

        <div className="space-y-3">
          {data.map((entry) => (
            <div key={entry.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="truncate font-bold text-slate-700">{entry.source}</span>
              </div>
              <span className="font-mono font-black text-[#0B1B3A]">{formatIndianNumber(entry.count)}</span>
              <span className="w-16 text-right text-xs font-bold text-slate-500">({entry.percent.toFixed(1)}%)</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
        <div className="font-bold text-slate-500">
          Total Samples <span className="ml-6 font-mono font-black text-[#0B1B3A]">{formatIndianNumber(totalSamples)}</span>
        </div>
        <div className="font-black uppercase tracking-widest text-blue-600">
          {formatIndianNumber(totalRecords)} in registry
        </div>
      </div>
    </div>
  );
}

function DonutChart({ data, total }: {
  data: ReturnType<typeof sourceBreakdown>;
  total: number;
}) {
  const radius = 76;
  const circumference = 2 * Math.PI * radius;
  const segments = data.reduce<{
    accumulated: number;
    items: Array<{
      key: string;
      color: string;
      dashLength: number;
      dashOffset: number;
    }>;
  }>((acc, entry) => {
    const fraction = total ? entry.count / total : 0;
    const dashLength = fraction * circumference;
    const dashOffset = -acc.accumulated * circumference;

    return {
      accumulated: acc.accumulated + fraction,
      items: [
        ...acc.items,
        {
          key: entry.key,
          color: entry.color,
          dashLength,
          dashOffset,
        },
      ],
    };
  }, { accumulated: 0, items: [] }).items;

  return (
    <svg viewBox="0 0 220 220" className="h-full w-full" role="img" aria-label="Sampling source donut chart">
      <circle cx="110" cy="110" r={radius} fill="none" stroke="#eef2f7" strokeWidth="34" />
      {segments.map((entry) => (
        <circle
          key={entry.key}
          cx="110"
          cy="110"
          r={radius}
          fill="none"
          stroke={entry.color}
          strokeWidth="34"
          strokeDasharray={`${entry.dashLength} ${circumference - entry.dashLength}`}
          strokeDashoffset={entry.dashOffset}
          strokeLinecap="butt"
          transform="rotate(-90 110 110)"
        />
      ))}
      <circle cx="110" cy="110" r="46" fill="white" />
      <text x="110" y="106" textAnchor="middle" className="fill-[#0B1B3A] text-2xl font-black">
        {formatIndianNumber(total)}
      </text>
      <text x="110" y="128" textAnchor="middle" className="fill-slate-400 text-[10px] font-black uppercase tracking-widest">
        Samples
      </text>
    </svg>
  );
}

function RegistryTable({ loading, strains, selectedId, onSelect, onOpenOrganism, onOpenGenome }: {
  loading: boolean;
  strains: StrainRecord[];
  selectedId: number | null;
  onSelect: (strainId: number) => void;
  onOpenOrganism: (organismId?: number | null) => void;
  onOpenGenome: (strain: StrainRecord) => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <RefreshCcw className="mr-3 animate-spin text-orange-500" size={20} />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Loading registry records</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left">
        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
          <tr>
            <th className="px-6 py-4">Organism</th>
            <th className="px-6 py-4">Source</th>
            <th className="px-6 py-4">Genome</th>
            <th className="px-6 py-4">Accessions</th>
            <th className="px-6 py-4 text-right">Route</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {strains.map((strain) => (
            <tr
              key={strain.id}
              onClick={() => onSelect(strain.id)}
              className={`cursor-pointer transition ${selectedId === strain.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
            >
              <td className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1B3A] text-white">
                    <FlaskConical size={17} />
                  </span>
                  <span>
                    <span className="block text-sm font-black italic text-[#0B1B3A]">{strain.organism?.scientificName || 'Unknown organism'}</span>
                    <span className="mt-1 block font-mono text-xs font-bold text-orange-600">{strain.strainName || 'Unnamed strain'}</span>
                  </span>
                </div>
              </td>
              <td className="px-6 py-5">
                <p className="text-sm font-black text-slate-700">{strain.sourceType || 'Unspecified'}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">{locationLabel(strain)}</p>
              </td>
              <td className="px-6 py-5 font-mono text-xs font-bold text-slate-600">
                <p>{formatGenomeSize(strain.genomeSize || null)}</p>
                <p className="mt-1 text-slate-400">GC {formatGc(strain.gcContent)}</p>
              </td>
              <td className="px-6 py-5 font-mono text-[11px] font-bold text-slate-500">
                <p>BioSample: {strain.biosampleAccession || 'N/A'}</p>
                <p className="mt-1">Assembly: {strain.assemblyAccession || 'N/A'}</p>
              </td>
              <td className="px-6 py-5 text-right">
                <div className="flex justify-end gap-2"><button onClick={(event) => { event.stopPropagation(); onOpenOrganism(strain.organismId); }} className="inline-flex items-center gap-2 rounded-md bg-[#0B1B3A] px-3 py-2 text-xs font-black uppercase text-white transition hover:bg-orange-500">Results <ArrowUpRight size={13} /></button><button onClick={(event) => { event.stopPropagation(); onOpenGenome(strain); }} title="Open genome tools" aria-label={`Open genome tools for ${strain.strainName}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"><Binary size={14} /></button></div>
              </td>
            </tr>
          ))}
          {strains.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-16 text-center">
                <Microscope className="mx-auto mb-4 text-slate-300" size={42} />
                <p className="text-sm font-bold text-slate-500">No registry records match the current search.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectedDossier({ strain, onOpenOrganism, onOpenGenome }: {
  strain: StrainRecord | null;
  onOpenOrganism: (organismId?: number | null) => void;
  onOpenGenome: (tool: 'jbrowse' | 'igv' | 'blast') => void;
}) {
  return (
    <aside className="border border-[#0B1B3A]/10 bg-[#0B1B3A] p-6 text-white shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-300">Active Organism Dossier</p>
          <h2 className="mt-3 text-2xl font-black italic tracking-tight">{strain?.organism?.scientificName || 'Select a record'}</h2>
        </div>
        <Dna className="text-orange-400" size={28} />
      </div>

      <div className="mt-6 space-y-3">
        <DossierRow label="Strain" value={strain?.strainName || 'N/A'} />
        <DossierRow label="Taxonomy" value={strain?.organism?.taxonomyId ? `TXID ${strain.organism.taxonomyId}` : 'N/A'} />
        <DossierRow label="Source" value={strain?.sourceType || 'Unspecified'} />
        <DossierRow label="Location" value={locationLabel(strain)} />
        <DossierRow label="Genome Size" value={formatGenomeSize(strain?.genomeSize || null)} />
        <DossierRow label="GC Content" value={formatGc(strain?.gcContent)} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <MiniSignal icon={CheckCircle2} label="MAYA" value="Open results" />
        <MiniSignal icon={BarChart3} label="Atlas" value={numericValue(strain?.latitude) !== null && numericValue(strain?.longitude) !== null ? 'Mapped' : 'No GPS'} />
        <MiniSignal icon={Binary} label="Reference" value={strain?.referenceKinds?.includes('FASTA') ? 'FASTA ready' : 'No FASTA'} />
        <MiniSignal icon={Dna} label="Evidence" value={strain?.evidenceBasis?.replaceAll('_', ' ') || 'N/A'} />
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <button onClick={() => onOpenOrganism(strain?.organismId)} disabled={!strain} className="flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-3 text-xs font-black uppercase text-[#0B1B3A] transition hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">MAYA results <ArrowUpRight size={14} /></button>
        <button onClick={() => onOpenGenome('jbrowse')} disabled={!strain} className="flex w-full items-center justify-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-3 text-xs font-black uppercase text-white transition hover:border-orange-400 hover:text-orange-300 disabled:cursor-not-allowed disabled:opacity-50">Genome workspace <Binary size={14} /></button>
      </div>
    </aside>
  );
}

function DossierRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 last:border-0">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <span className="max-w-[210px] text-right font-mono text-xs font-bold text-slate-200">{value}</span>
    </div>
  );
}

function MiniSignal({ icon: Icon, label, value }: { icon: typeof Dna; label: string; value: string }) {
  return (
    <div className="rounded-md bg-white/5 p-4">
      <Icon size={18} className="text-orange-300" />
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function AmrPanel({ alerts, strains, onSelect }: {
  alerts: AmrAlert[];
  strains: StrainRecord[];
  onSelect: (strainId: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">AMR Signal Watch</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">Recent sequence-derived resistance genes linked to registry strains. Genotypic evidence only unless separately stated.</p>
        </div>
        <ShieldAlert className="text-red-500" size={24} />
      </div>

      <div className="space-y-3">
        {alerts.slice(0, 5).map((alert) => {
          const strain = strains.find((item) => item.id === alert.strainId);
          return (
            <button
              key={alert.id}
              onClick={() => onSelect(alert.strainId)}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left transition hover:border-red-200 hover:bg-red-100"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white">
                  <AlertTriangle size={17} />
                </span>
                <span>
                  <span className="block text-sm font-black text-red-800">{alert.geneSymbol || 'Unknown gene'}</span>
                  <span className="mt-1 block text-[11px] font-bold text-red-500">{alert.drugClass || 'Unknown class'}</span>
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-xs font-black text-[#0B1B3A]">{strain?.strainName || alert.strain?.strainName || `Strain ${alert.strainId}`}</span>
                <span className="mt-1 block text-[10px] font-bold text-slate-500">{alert.identity ? `${alert.identity}% identity` : 'Identity N/A'}</span>
              </span>
            </button>
          );
        })}
        {alerts.length === 0 && (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 text-emerald-500" size={30} />
            <p className="text-sm font-bold text-emerald-700">No recent AMR alerts in the dashboard feed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
