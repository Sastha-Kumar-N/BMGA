'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Database,
  Dna,
  FlaskConical,
  Leaf,
  Mail,
  MapPin,
  Microscope,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Sprout,
  UsersRound,
  Waves,
} from 'lucide-react';
import { apiPath } from './lib/api-client';

type Organism = {
  id: number;
  scientificName?: string | null;
  domain?: string | null;
};

type Strain = {
  id: number;
  strainName?: string | null;
  organismId: number;
  organism?: Organism | null;
  sourceType?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  gcContent?: number | string | null;
  genomeSize?: number | null;
  createdAt?: string | null;
};

type AmrAlert = {
  id: number;
  strainId: number;
  geneSymbol?: string | null;
  drugClass?: string | null;
  identity?: number | null;
};

type SummaryData = {
  recentStrains: Strain[];
  recentAmr: AmrAlert[];
};

const EMPTY_SUMMARY: SummaryData = {
  recentStrains: [],
  recentAmr: [],
};

const workflowSteps: Array<{
  title: string;
  body: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    title: 'Collect',
    body: 'Samples from clinical, agricultural, food, and environmental sources across India.',
    icon: FlaskConical,
    tone: 'text-orange-600 bg-orange-50',
  },
  {
    title: 'Sequence',
    body: 'High-throughput metagenomics and quality-controlled genome assembly.',
    icon: Dna,
    tone: 'text-emerald-600 bg-emerald-50',
  },
  {
    title: 'Catalog',
    body: 'Organism registry with source metadata, taxonomy, accessions, and genome metrics.',
    icon: Database,
    tone: 'text-blue-600 bg-blue-50',
  },
  {
    title: 'Map',
    body: 'Geospatial mapping of strains, sources, and AMR signals across India.',
    icon: MapPin,
    tone: 'text-orange-600 bg-orange-50',
  },
  {
    title: 'Analyze',
    body: 'Dashboards and MAYA results for surveillance, research, and policy support.',
    icon: BarChart3,
    tone: 'text-emerald-600 bg-emerald-50',
  },
];

const projectCards: Array<{
  title: string;
  body: string;
  icon: LucideIcon;
  surface: string;
}> = [
  {
    title: 'Bharat Genome Database',
    body: 'Bharat Genome Database (BGDB) is a comprehensive platform dedicated to providing access to genomic resources, tools, and data specific to the diverse flora of India. Our mission is to empower researchers, students, and the scientific community with high-quality genomic information and innovative bioinformatics tools..',
    icon: ShieldAlert,
    surface: 'from-[#123464] via-[#0B1B3A] to-[#06122A]',
  },
  {
    title: 'Agri-Genomics Initiative',
    body: 'Characterizing agricultural and soil microbiomes to support sustainable farming and food security.',
    icon: Sprout,
    surface: 'from-[#115E42] via-[#0B1B3A] to-[#06122A]',
  },
  {
    title: 'Environmental Microbiome Atlas',
    body: 'Mapping microbial diversity in water, soil, riverine, and ecological surveillance zones.',
    icon: Waves,
    surface: 'from-[#075985] via-[#0B1B3A] to-[#06122A]',
  },
];

const teamGroups: Array<{
  title: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    title: 'Genome Informatics',
    body: 'Data models, accession linkage, dashboards, and atlas-scale analytics.',
    icon: Database,
  },
  {
    title: 'Clinical Microbiology',
    body: 'Pathogen surveillance, AMR interpretation, and hospital network coordination.',
    icon: ShieldAlert,
  },
  {
    title: 'Bioinformatics & MAYA',
    body: 'Pipeline orchestration, result review, and reproducible analysis workflows.',
    icon: Microscope,
  },
  {
    title: 'Environmental Genomics',
    body: 'Sampling strategy for soil, water, food systems, and ecological reservoirs.',
    icon: Leaf,
  },
];

function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatIndianNumber(value: number) {
  return value.toLocaleString('en-IN');
}

function formatGenomeSize(value?: number | null) {
  if (!value) return 'N/A';
  return `${(value / 1_000_000).toFixed(2)} Mb`;
}

function formatGc(value?: number | string | null) {
  const parsed = numericValue(value);
  return parsed === null ? 'N/A' : `${parsed.toFixed(2)}%`;
}

function locationLabel(strain?: Strain | null) {
  if (!strain) return 'Unknown source';
  return [strain.city, strain.state, strain.country].filter(Boolean).join(', ') || 'Unknown source';
}

function uniqueLocationCount(strains: Strain[]) {
  return new Set(strains.map(locationLabel)).size;
}

function mappedPointCount(strains: Strain[]) {
  return strains.filter((strain) => numericValue(strain.latitude) !== null && numericValue(strain.longitude) !== null).length;
}

function metadataCoverage(strains: Strain[]) {
  if (!strains.length) return 0;

  const scores = strains.map((strain) => {
    const values = [
      strain.organism?.scientificName,
      strain.strainName,
      strain.sourceType,
      strain.city || strain.state || strain.country,
      strain.latitude,
      strain.longitude,
      strain.genomeSize,
      strain.gcContent,
    ];
    return values.filter((value) => value !== null && value !== undefined && value !== '').length / values.length;
  });

  return (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100;
}

export default function HomePage() {
  const { data: session } = useSession();
  const [strains, setStrains] = useState<Strain[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData>(EMPTY_SUMMARY);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [messageSent, setMessageSent] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPlatformData() {
      try {
        const [strainsResponse, summaryResponse] = await Promise.all([
          fetch(apiPath('/strains'), { cache: 'no-store' }),
          fetch(apiPath('/dashboard/summary'), { cache: 'no-store' }),
        ]);

        const [strainRecords, summaryRecords] = await Promise.all([
          strainsResponse.ok ? strainsResponse.json() as Promise<Strain[]> : Promise.resolve([]),
          summaryResponse.ok ? summaryResponse.json() as Promise<SummaryData> : Promise.resolve(EMPTY_SUMMARY),
        ]);

        if (!isMounted) return;
        setStrains(strainRecords);
        setSummaryData(summaryRecords);
      } catch (error) {
        console.error('Home page data load failed', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadPlatformData();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredStrains = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return strains.slice(0, 5);

    return strains.filter((strain) => {
      const searchable = [
        strain.organism?.scientificName,
        strain.strainName,
        strain.sourceType,
        strain.city,
        strain.state,
        strain.country,
      ].filter(Boolean).join(' ').toLowerCase();

      return searchable.includes(normalizedQuery);
    }).slice(0, 5);
  }, [query, strains]);

  const stats = [
    {
      label: 'Genome Records',
      value: formatIndianNumber(strains.length),
      icon: Database,
      color: 'text-orange-400',
    },
    {
      label: 'Unique Locations',
      value: formatIndianNumber(uniqueLocationCount(strains)),
      icon: MapPin,
      color: 'text-emerald-400',
    },
    {
      label: 'AMR Detections',
      value: formatIndianNumber(summaryData.recentAmr.length),
      icon: ShieldAlert,
      color: 'text-red-400',
    },
    {
      label: 'Metadata Coverage',
      value: `${metadataCoverage(strains).toFixed(1)}%`,
      icon: CheckCircle2,
      color: 'text-green-400',
    },
  ];

  const handleContactSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessageSent(true);
  };

  return (
    <main id="home" className="min-h-screen bg-white text-[#0B1B3A] selection:bg-orange-500/20">
      <section className="relative overflow-hidden bg-[#0B1B3A] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:54px_54px]" />
        <div className="absolute inset-x-0 bottom-0 h-1.5">
          <div className="flex h-full">
            <div className="flex-1 bg-orange-500" />
            <div className="flex-1 bg-white" />
            <div className="flex-1 bg-[#138808]" />
          </div>
        </div>

        <div className="relative mx-auto grid min-h-[720px] max-w-7xl items-center gap-10 px-5 py-16 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-20">
          <div className="max-w-xl">
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Mapping India&apos;s Microbial Genome Landscape
            </h1>
            <p className="mt-7 max-w-lg text-base font-medium leading-8 text-slate-300 md:text-lg">
              BMGA catalogues, analyzes, and visualizes microbial genomics data to advance public health,
              agriculture, environmental research, and AMR surveillance across India.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-orange-500/25 transition hover:bg-orange-400">
                Explore Dashboard <ArrowRight size={17} />
              </Link>
              <Link href={session ? '/account' : '/register'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-4 text-sm font-black text-white transition hover:border-orange-300 hover:text-orange-300">
                {session ? 'Account Dashboard' : 'Create Account'} <UsersRound size={17} />
              </Link>
            </div>

            <div className="mt-11 grid grid-cols-2 gap-5 md:grid-cols-4">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="min-w-0">
                    <Icon className={stat.color} size={22} />
                    <p className="mt-3 text-2xl font-black tracking-tight">{loading ? '...' : stat.value}</p>
                    <p className="mt-1 text-[10px] font-black uppercase leading-snug tracking-widest text-slate-400">{stat.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-cyan-300/10 bg-[#06152E] shadow-2xl shadow-cyan-950/40 lg:min-h-[560px]">
            <Image
              src="/home/bmga-india-genome-atlas.png"
              alt="Glowing genomic data map of India for Bharat Genome Atlas"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 760px"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0B1B3A]/55 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-[#071833]/85 p-4 backdrop-blur-md">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <HeroSignal label="Mapped Points" value={formatIndianNumber(mappedPointCount(strains))} />
                <HeroSignal label="MAYA Ready" value={formatIndianNumber(strains.length)} />
                <HeroSignal label="AMR Signals" value={formatIndianNumber(summaryData.recentAmr.length)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="analysis" className="bg-white px-5 py-20 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black tracking-tight text-[#0B1B3A]">From Sample to Insight</h2>
            <p className="mt-4 text-base font-bold leading-7 text-slate-500">
              Integrated platform workflows connect genomic data with geospatial intelligence for discovery and evidence-based decision making.
            </p>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-5">
            {workflowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${step.tone}`}>
                    <Icon size={24} />
                  </div>
                  <p className="mt-6 text-xs font-black uppercase tracking-widest text-slate-400">{index + 1}. {step.title}</p>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-600">{step.body}</p>
                  {index < workflowSteps.length - 1 && (
                    <ChevronRight className="absolute -right-4 top-1/2 hidden -translate-y-1/2 text-slate-300 lg:block" size={26} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-2xl font-black tracking-tight text-[#0B1B3A]">Live Registry Preview</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                Search the live organism registry and jump into the dashboard for the full atlas, MAYA results, and AMR review.
              </p>
              <label className="relative mt-6 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search species, strain, source, or city"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold text-[#0B1B3A] outline-none transition focus:border-orange-500"
                />
              </label>
              <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500">
                Open Full Analysis <ArrowRight size={14} />
              </Link>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_150px_120px] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Organism</span>
                <span>Location</span>
                <span>Genome / GC</span>
              </div>
              <div className="divide-y divide-slate-100">
                {loading ? (
                  <div className="px-5 py-10 text-sm font-bold text-slate-500">Loading registry records...</div>
                ) : filteredStrains.length ? (
                  filteredStrains.map((strain) => (
                    <div key={strain.id} className="grid grid-cols-[minmax(0,1fr)_150px_120px] gap-4 px-5 py-4 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-black italic text-[#0B1B3A]">{strain.organism?.scientificName || 'Unknown organism'}</p>
                        <p className="mt-1 truncate font-mono text-xs font-bold text-orange-600">{strain.strainName || 'Unnamed strain'}</p>
                      </div>
                      <p className="truncate font-bold text-slate-500">{locationLabel(strain)}</p>
                      <div className="font-mono text-xs font-bold text-slate-500">
                        <p>{formatGenomeSize(strain.genomeSize)}</p>
                        <p className="mt-1 text-slate-400">GC {formatGc(strain.gcContent)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-sm font-bold text-slate-500">No registry records match this search.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="projects" className="bg-[#0B1B3A] px-5 py-20 text-white md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black tracking-tight">Our Projects</h2>
            <p className="mt-4 text-base font-bold leading-7 text-slate-300">
              Nation-scale genomics programs built around health, food systems, and environmental resilience.
            </p>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {projectCards.map((project) => {
              const Icon = project.icon;
              return (
                <article key={project.title} className={`overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${project.surface} shadow-2xl shadow-black/20`}>
                  <div className="relative h-44 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,rgba(255,255,255,0.22),transparent_26%),linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0B1B3A] to-transparent" />
                    <div className="absolute bottom-5 left-5 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
                      <Icon size={24} />
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-black tracking-tight">{project.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-7 text-slate-300">{project.body}</p>
                    <Link href="/dashboard" className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-300 transition hover:text-white">
                      Explore Project <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="team" className="bg-white px-5 py-20 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-black tracking-tight text-[#0B1B3A]">Team</h2>
            <p className="mt-4 text-base font-bold leading-7 text-slate-500">
              A multidisciplinary consortium of researchers, clinicians, bioinformaticians, and data teams.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {teamGroups.map((group) => {
              const Icon = group.icon;
              return (
                <article key={group.title} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 text-[#0B1B3A]">
                    <Icon size={28} />
                  </div>
                  <h3 className="mt-5 text-lg font-black tracking-tight text-[#0B1B3A]">{group.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-500">{group.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="relative overflow-hidden bg-[#0B1B3A] px-5 py-20 text-white md:px-8">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_70%_45%,rgba(14,165,233,0.2),transparent_35%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <h2 className="text-4xl font-black tracking-tight">Let&apos;s Collaborate</h2>
            <p className="mt-4 max-w-md text-base font-bold leading-7 text-slate-300">
              Have questions, data to contribute, or a project to coordinate? Reach out to the BMGA team.
            </p>
            <div className="mt-8 space-y-4 text-sm font-bold text-slate-300">
              <ContactLine icon={Mail} label="Platform coordination" value="BMGA collaboration desk" />
              <ContactLine icon={Phone} label="Access requests" value="Dashboard and data onboarding" />
              <ContactLine icon={MapPin} label="Coverage" value="India-wide organism and source intelligence" />
            </div>
          </div>

          <form onSubmit={handleContactSubmit} className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-md md:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <input className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400" placeholder="Your Name" required />
              <input className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400" placeholder="Your Email" type="email" required />
              <input className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400" placeholder="Organization" />
              <input className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400" placeholder="Subject" required />
              <textarea className="min-h-36 rounded-xl border border-white/10 bg-[#14264B] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400 md:col-span-2" placeholder="Your Message" required />
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-sm font-black text-white transition hover:bg-orange-400">
                <Send size={16} />
                Send Message
              </button>
              {messageSent && (
                <p className="text-sm font-bold text-emerald-300">Message captured locally for the portal workflow.</p>
              )}
            </div>
          </form>
        </div>
      </section>

      <footer className="bg-[#07142D] px-5 py-12 text-white md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 border-b border-white/10 pb-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-white">
                <Dna size={22} />
              </span>
              <span>
                <span className="block text-xl font-black">BMGA</span>
                <span className="block text-[9px] font-black uppercase tracking-widest text-orange-300">Bharat Genome Atlas</span>
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm font-medium leading-7 text-slate-400">
              A national platform for microbial genomics, MAYA results, and geospatial intelligence for a healthier and more resilient India.
            </p>
          </div>
          <FooterColumn title="Platform" links={['Dashboard', 'Analysis', 'Organism Atlas', 'MAYA Results']} />
          <FooterColumn title="Resources" links={['Blog', 'Create Account', 'User Guide', 'Downloads']} />
          <FooterColumn title="About" links={['Our Projects', 'Team', 'Contact Us', 'Accessibility']} />
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 pt-6 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>2026 BMGA. All rights reserved.</span>
          <span>Science. Surveillance. Sustainability.</span>
        </div>
        <div className="mt-8 flex h-1.5">
          <div className="flex-1 bg-orange-500" />
          <div className="flex-1 bg-white" />
          <div className="flex-1 bg-[#138808]" />
        </div>
      </footer>
    </main>
  );
}

function HeroSignal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function ContactLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 text-orange-300" size={18} />
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="mt-1">{value}</p>
      </div>
    </div>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-black">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm font-medium text-slate-400">
        {links.map((link) => (
          <li key={link}>
            <Link href={footerHref(link)} className="transition hover:text-orange-300">
              {link}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function footerHref(link: string) {
  const anchors: Record<string, string> = {
    Dashboard: '/dashboard',
    Analysis: '#analysis',
    'Organism Atlas': '/dashboard#india-atlas',
    'MAYA Results': '/dashboard',
    'Our Projects': '#projects',
    Blog: '/blog',
    'Create Account': '/register',
    Team: '#team',
    'Contact Us': '#contact',
  };

  return anchors[link] || '#home';
}
