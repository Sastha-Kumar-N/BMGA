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
  CheckCircle2,
  Database,
  Dna,
  FlaskConical,
  Globe2,
  LayoutDashboard,
  Layers,
  Lock,
  LogOut,
  MapPin,
  Microscope,
  RefreshCcw,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { apiPath } from '../lib/api-client';
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
  createdAt?: string | null;
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

function averageGc(strains: StrainRecord[]) {
  const values = strains
    .map((strain) => numericValue(strain.gcContent))
    .filter((value): value is number => value !== null);

  if (!values.length) return 'N/A';
  return `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)}%`;
}

function sourceBreakdown(strains: StrainRecord[]) {
  const counts = new Map<string, number>();
  strains.forEach((strain) => {
    const source = strain.sourceType || 'Unspecified';
    counts.set(source, (counts.get(source) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
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
    strains.find((strain) => strain.id.toString() === selectedStrainId) || strains[0] || null
  ), [selectedStrainId, strains]);

  const mappedPointCount = useMemo(() => (
    strains.filter((strain) => numericValue(strain.latitude) !== null && numericValue(strain.longitude) !== null).length
  ), [strains]);

  const openOrganismResults = (organismId?: number | null) => {
    if (!organismId) return;
    router.push(`/organisms/${organismId}/results`);
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
        <button onClick={() => setSelectedStrainId('')} className="mb-8 flex items-center gap-3 text-left">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
            <Dna size={22} />
          </span>
          <span>
            <span className="block text-xl font-black tracking-tight">BMGA</span>
            <span className="block text-[9px] font-black uppercase tracking-widest text-orange-300">Bharat Genome Atlas</span>
          </span>
        </button>

        <nav className="space-y-2">
          <SidebarButton active icon={LayoutDashboard} label="Dashboard" onClick={() => setSelectedStrainId('')} />
          <SidebarButton icon={MapPin} label="India Atlas" onClick={scrollToAtlas} />
          <SidebarButton icon={Microscope} label="MAYA Results" onClick={() => openOrganismResults(selectedStrain?.organismId)} disabled={!selectedStrain} />
          {session?.user?.role === 'ADMIN' && (
            <Link href="/admin" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/5 hover:text-white">
              <Lock size={17} />
              Admin Portal
            </Link>
          )}
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
              <h1 className="text-3xl font-black tracking-tight text-[#0B1B3A] md:text-4xl">Genome Intelligence Dashboard</h1>
              <p className="mt-1 text-sm font-bold text-slate-500">National organism registry, MAYA outputs, and geospatial source intelligence.</p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <label className="relative min-w-0 flex-1 lg:w-[420px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
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

        <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 md:px-8">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile icon={Database} label="Genome Records" value={strains.length.toString()} sublabel={`${uniqueOrganismCount(strains)} organisms`} tone="blue" />
            <MetricTile icon={MapPin} label="Mapped Sources" value={mappedPointCount.toString()} sublabel={`${uniqueLocationCount(strains)} site labels`} tone="emerald" />
            <MetricTile icon={ShieldAlert} label="AMR Alerts" value={summaryData.recentAmr.length.toString()} sublabel="Recent resistance signals" tone="red" />
            <MetricTile icon={Activity} label="Mean GC Content" value={averageGc(strains)} sublabel="Across indexed records" tone="orange" />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">Organism Registry</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">Scientific sample metadata and accession links from the current dataset.</p>
                </div>
                <button
                  onClick={scrollToAtlas}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-[#0B1B3A] transition hover:border-orange-500 hover:text-orange-600"
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
              />
            </div>

            <SelectedDossier strain={selectedStrain} onOpenOrganism={openOrganismResults} />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">Sampling Sources</h2>
                  <p className="mt-1 text-xs font-bold text-slate-500">Top source categories represented in the registry.</p>
                </div>
                <Layers className="text-orange-500" size={24} />
              </div>
              <div className="space-y-3">
                {sourceBreakdown(strains).map((item) => (
                  <SourceRow key={item.source} source={item.source} count={item.count} total={Math.max(strains.length, 1)} />
                ))}
                {strains.length === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                    No source metadata loaded yet.
                  </p>
                )}
              </div>
            </div>

            <AmrPanel alerts={summaryData.recentAmr} strains={strains} onSelect={(strainId) => setSelectedStrainId(strainId.toString())} />
          </section>

          <section id="india-atlas" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-3xl font-black tracking-tight text-[#0B1B3A]">India Organism Atlas</h2>
                <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
                  Each point represents a strain with geographic metadata. Open a point to review organism, source, accession, genome size, and GC details, then route directly to its genomics results page.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-2">{mappedPointCount} mapped points</span>
                <span className="rounded-full bg-orange-50 px-3 py-2 text-orange-600">Click marker for dossier</span>
              </div>
            </div>
            <IndiaOrganismAtlas strains={strains} onOpenOrganism={openOrganismResults} />
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
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition ${
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

function MetricTile({ icon: Icon, label, value, sublabel, tone }: {
  icon: typeof Dna;
  label: string;
  value: string;
  sublabel: string;
  tone: 'blue' | 'emerald' | 'red' | 'orange';
}) {
  const toneClasses = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0B1B3A]">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{sublabel}</p>
        </div>
        <div className={`rounded-xl p-3 ${toneClasses[tone]}`}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function RegistryTable({ loading, strains, selectedId, onSelect, onOpenOrganism }: {
  loading: boolean;
  strains: StrainRecord[];
  selectedId: number | null;
  onSelect: (strainId: number) => void;
  onOpenOrganism: (organismId?: number | null) => void;
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
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenOrganism(strain.organismId);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500"
                >
                  Genomics <ArrowUpRight size={13} />
                </button>
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

function SelectedDossier({ strain, onOpenOrganism }: {
  strain: StrainRecord | null;
  onOpenOrganism: (organismId?: number | null) => void;
}) {
  return (
    <aside className="rounded-2xl border border-[#0B1B3A]/10 bg-[#0B1B3A] p-6 text-white shadow-sm">
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
        <MiniSignal icon={CheckCircle2} label="MAYA" value="Routable" />
        <MiniSignal icon={BarChart3} label="Atlas" value={strain?.latitude && strain.longitude ? 'Mapped' : 'No GPS'} />
      </div>

      <button
        onClick={() => onOpenOrganism(strain?.organismId)}
        disabled={!strain}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-[#0B1B3A] transition hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Open genomics page <ArrowUpRight size={14} />
      </button>
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
    <div className="rounded-xl bg-white/5 p-4">
      <Icon size={18} className="text-orange-300" />
      <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function SourceRow({ source, count, total }: { source: string; count: number; total: number }) {
  const percent = Math.round((count / total) * 100);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-black uppercase tracking-widest text-slate-500">{source}</span>
        <span className="font-mono font-black text-[#0B1B3A]">{count}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(percent, 8)}%` }} />
      </div>
    </div>
  );
}

function AmrPanel({ alerts, strains, onSelect }: {
  alerts: AmrAlert[];
  strains: StrainRecord[];
  onSelect: (strainId: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#0B1B3A]">AMR Signal Watch</h2>
          <p className="mt-1 text-xs font-bold text-slate-500">Recent resistance genes linked back to registry strains.</p>
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
