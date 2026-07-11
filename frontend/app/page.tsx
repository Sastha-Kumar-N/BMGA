'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
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
  Globe2,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  ShieldAlert,
  Sprout,
  UsersRound,
  UploadCloud,
  Waves,
} from 'lucide-react';
import { apiPath } from './lib/api-client';
import { BRAND_FULL_NAME, BRAND_TAGLINE } from './lib/brand';
import BrandLogo from './components/BrandLogo';
import type { HomeMapStrain } from './components/HomeIndiaMap';

const HomeIndiaMap = dynamic(() => import('./components/HomeIndiaMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center rounded-[2rem] border border-cyan-300/10 bg-[#06152E] text-xs font-black uppercase tracking-widest text-orange-300 shadow-2xl shadow-cyan-950/40 lg:min-h-[560px]">
      Initializing India map
    </div>
  ),
});

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
} & HomeMapStrain;

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

type FooterLink = {
  label: string;
  href: string;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const EMPTY_SUMMARY: SummaryData = {
  recentStrains: [],
  recentAmr: [],
};

const EMPTY_CONTACT_FORM = {
  name: '',
  email: '',
  organization: '',
  subject: '',
  message: '',
};

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Analysis', href: '#analysis' },
  { label: 'Global Surveillance', href: '/surveillance' },
  { label: 'Our Projects', href: '#projects' },
  { label: 'Blog', href: '/blog' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact Us', href: '#contact' },
];

const workflowSteps: Array<{
  title: string;
  body: string;
  icon: LucideIcon;
  tone: string;
}> = [
  {
    title: 'Collect',
    body: 'Samples from clinical, agricultural, food, and environmental sources across India and approved global partners.',
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
    body: 'Separate India and global views for geospatial strain, source, and AMR signals.',
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
    title: BRAND_FULL_NAME,
    body: `${BRAND_FULL_NAME} is a comprehensive microbial genomics platform dedicated to organism registry, MAYA result access, and geospatial source intelligence across India. Our mission is to empower researchers, students, and the scientific community with high-quality microbial genome information and practical bioinformatics tools.`,
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
  const pathname = usePathname();
  const [strains, setStrains] = useState<Strain[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData>(EMPTY_SUMMARY);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT_FORM);
  const [contactStatus, setContactStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  useEffect(() => {
    let isMounted = true;

    async function loadPlatformData() {
      try {
        setDataError(null);
        const [strainsResponse, summaryResponse] = await Promise.all([
          fetch(apiPath('/strains'), { cache: 'no-store' }),
          fetch(apiPath('/dashboard/summary'), { cache: 'no-store' }),
        ]);

        if (!strainsResponse.ok) {
          throw new Error(`Location request failed with status ${strainsResponse.status}`);
        }

        const [strainRecords, summaryRecords] = await Promise.all([
          strainsResponse.json() as Promise<Strain[]>,
          summaryResponse.ok ? summaryResponse.json() as Promise<SummaryData> : Promise.resolve(EMPTY_SUMMARY),
        ]);

        if (!isMounted) return;
        setStrains(strainRecords);
        setSummaryData(summaryRecords);
      } catch (error) {
        console.error('Home page data load failed', error);
        if (isMounted) {
          setDataError(error instanceof Error ? error.message : 'Unable to load live location data.');
          setStrains([]);
          setSummaryData(EMPTY_SUMMARY);
        }
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

  const firstOrganismId = useMemo(() => {
    return strains.find((strain) => strain.organismId)?.organismId || null;
  }, [strains]);

  const mayaResultsHref = firstOrganismId ? `/organisms/${firstOrganismId}/results` : '/dashboard';
  const accountResourceLink = session
    ? { label: 'Account Dashboard', href: '/account' }
    : { label: 'Create Account', href: '/register' };

  const footerSections: FooterSection[] = [
    {
      title: 'Platform',
      links: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Global Surveillance', href: '/surveillance' },
        { label: 'FAIR Data Gateway', href: '/fair' },
        { label: 'Analysis', href: '/#analysis' },
        { label: 'Organism Atlas', href: '/dashboard#india-atlas' },
        { label: 'MAYA Results', href: mayaResultsHref },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Blog', href: '/blog' },
        accountResourceLink,
        { label: 'User Guide', href: '/#guide' },
        { label: 'Downloads', href: '/#downloads' },
        { label: 'Cookie Notice', href: '/cookies' },
      ],
    },
    {
      title: 'About',
      links: [
        { label: 'Our Projects', href: '/#projects' },
        { label: 'About Us', href: '/about' },
        { label: 'Contact Us', href: '/#contact' },
        { label: 'Accessibility', href: '/#accessibility' },
        { label: 'Privacy & Data Use', href: '/privacy' },
      ],
    },
  ];

  const updateContactField = (field: keyof typeof EMPTY_CONTACT_FORM, value: string) => {
    setContactForm((current) => ({ ...current, [field]: value }));
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload = {
      name: contactForm.name.trim(),
      email: contactForm.email.trim(),
      organization: contactForm.organization.trim(),
      subject: contactForm.subject.trim(),
      message: contactForm.message.trim(),
    };

    if (!payload.name || !payload.email || !payload.subject || !payload.message) {
      setContactStatus({ type: 'error', text: 'Please fill in your name, email, subject, and message.' });
      return;
    }

    if (!CONTACT_EMAIL_PATTERN.test(payload.email)) {
      setContactStatus({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    setContactStatus({ type: 'loading', text: 'Sending your message...' });

    try {
      const response = await fetch(apiPath('/contact-messages'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Message submission failed.');
      }

      setContactForm(EMPTY_CONTACT_FORM);
      setContactStatus({ type: 'success', text: 'Message sent. The BMGA admin team can now read it in the Admin panel.' });
    } catch (error) {
      setContactStatus({ type: 'error', text: error instanceof Error ? error.message : 'Message submission failed.' });
    }
  };

  return (
    <main id="home" className="min-h-screen bg-white text-[#0B1B3A] selection:bg-orange-500/20">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1B3A]/95 text-white shadow-2xl shadow-[#0B1B3A]/10 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 md:px-8">
          <Link href="#home" className="min-w-0" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo variant="light" />
          </Link>

          <div className="hidden items-center gap-7 text-sm font-black lg:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-slate-200 transition hover:text-orange-300">
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="hidden rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400 sm:inline-flex">
              Explore Dashboard
            </Link>
            {session ? (
              <>
                <Link href="/account" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-300">
                  <UsersRound size={15} />
                  Account
                </Link>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="hidden items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-red-300 hover:bg-red-500/10 hover:text-red-200 sm:inline-flex"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/login" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-300">
                <UsersRound size={15} />
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>

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
              Mapping Microbial Genomes Across India and the World
            </h1>
            <p className="mt-7 max-w-lg text-base font-medium leading-8 text-slate-300 md:text-lg">
              BMGA catalogues, analyzes, and visualizes approved microbial genomics data for India while connecting international strain and MAYA results through a dedicated global surveillance workspace.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-orange-500/25 transition hover:bg-orange-400">
                Explore India Dashboard <ArrowRight size={17} />
              </Link>
              <Link href="/surveillance" className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-300/50 px-6 py-4 text-sm font-black text-teal-100 transition hover:border-teal-200 hover:bg-teal-500/10">
                Global Surveillance <Globe2 size={17} />
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

          <HomeIndiaMap strains={strains} loading={loading} error={dataError} />
        </div>
      </section>

      <section id="surveillance" className="border-y border-teal-200 bg-[#eefafa] px-5 py-16 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-teal-700 text-white"><Globe2 size={24} /></div>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-[#0B1B3A]">Global Genomic Surveillance</h2>
            <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-slate-600">A clearly separated BMGA workspace for approved strain records and MAYA outputs from around the world, with live database summaries, global mapping, AMR insights, evidence labels, and data-freshness reporting.</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/surveillance" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-black text-white transition hover:bg-teal-800">Open Global Dashboard <ArrowRight size={16} /></Link>
              <Link href={session ? '/surveillance/submit' : '/login'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-teal-300 bg-white px-5 text-sm font-black text-teal-900 transition hover:bg-teal-50">{session ? 'Submit Global Data' : 'Sign In to Contribute'} <UploadCloud size={16} /></Link>
            </div>
          </div>
          <div className="divide-y divide-teal-200 border-y border-teal-200 bg-white">
            <SurveillanceSignal icon={Database} title="Approved records only" body="Pending submissions and private storage references never appear in public surveillance views." />
            <SurveillanceSignal icon={ShieldAlert} title="Evidence-aware AMR" body="Genotypic MAYA detections remain explicitly distinct from linked phenotypic susceptibility evidence." />
            <SurveillanceSignal icon={CheckCircle2} title="Freshness and limitations" body="Every view reports response time, latest represented update, metadata coverage, and interpretation limits." />
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

      <section id="guide" className="bg-white px-5 py-20 md:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-widest text-orange-500">User Guide</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0B1B3A]">Navigate the BMGA Platform</h2>
            <p className="mt-4 text-base font-bold leading-7 text-slate-500">
              Core pathways for browsing organism records, reviewing atlas coverage, and opening validated MAYA outputs.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            {[
              { title: 'Organism Registry', body: 'Search live records by organism, strain, source, city, state, and genome metadata.', href: '/dashboard', icon: Database },
              { title: 'India Atlas', body: 'Open the dashboard atlas for location-based organism summaries and source intelligence.', href: '/dashboard#india-atlas', icon: MapPin },
              { title: 'Global Surveillance', body: 'Explore approved worldwide strain records, AMR signals, provenance, and data quality.', href: '/surveillance', icon: Globe2 },
              { title: 'MAYA Results', body: firstOrganismId ? 'Open the first available organism result workspace from current live data.' : 'Open the dashboard and select an organism to view available MAYA outputs.', href: mayaResultsHref, icon: BarChart3 },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.title} href={item.href} className="group rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition hover:-translate-y-1 hover:border-orange-200 hover:bg-white hover:shadow-xl hover:shadow-orange-100/60">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B1B3A] text-orange-300 transition group-hover:bg-orange-500 group-hover:text-white">
                    <Icon size={22} />
                  </span>
                  <h3 className="mt-6 text-xl font-black tracking-tight text-[#0B1B3A]">{item.title}</h3>
                  <p className="mt-3 text-sm font-bold leading-7 text-slate-500">{item.body}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-600">
                    Open <ArrowRight size={14} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="downloads" className="bg-slate-50 px-5 py-20 md:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-orange-500">Downloads</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight text-[#0B1B3A]">Open Available Data Exports</h2>
            <p className="mt-4 text-base font-bold leading-7 text-slate-500">
              Downloadable files are exposed from real organism result pages when backend records include generated MAYA files.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/dashboard" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-200 hover:shadow-xl hover:shadow-orange-100/60">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Registry</p>
              <h3 className="mt-3 text-lg font-black text-[#0B1B3A]">Dashboard Data Views</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Open live summaries, atlas records, and organism source tables.</p>
            </Link>
            <Link href={mayaResultsHref} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-200 hover:shadow-xl hover:shadow-orange-100/60">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">MAYA</p>
              <h3 className="mt-3 text-lg font-black text-[#0B1B3A]">Result Files</h3>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">Open approved tool outputs and file downloads when records are available.</p>
            </Link>
          </div>
        </div>
      </section>

      <section id="accessibility" className="bg-white px-5 py-16 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-2xl border border-slate-200 bg-[#0B1B3A] p-6 text-white shadow-xl shadow-slate-200/70 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-orange-300">Accessibility</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Accessible Scientific Data Access</h2>
            <p className="mt-2 max-w-3xl text-sm font-bold leading-7 text-slate-300">
              BMGA pages use semantic headings, high-contrast controls, descriptive link text, keyboard-focusable actions, and readable status messaging.
            </p>
          </div>
          <Link href="/#contact" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-400">
            Contact Support <ArrowRight size={14} />
          </Link>
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
              <ContactLine icon={MapPin} label="Coverage" value="India atlas and global genomic surveillance" />
            </div>
          </div>

          <form onSubmit={handleContactSubmit} className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-md md:p-7">
            <div className="grid gap-4 md:grid-cols-2">
              <input
                value={contactForm.name}
                onChange={(event) => updateContactField('name', event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400"
                placeholder="Your Name"
                required
              />
              <input
                value={contactForm.email}
                onChange={(event) => updateContactField('email', event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400"
                placeholder="Your Email"
                type="email"
                required
              />
              <input
                value={contactForm.organization}
                onChange={(event) => updateContactField('organization', event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400"
                placeholder="Organization"
              />
              <input
                value={contactForm.subject}
                onChange={(event) => updateContactField('subject', event.target.value)}
                className="h-12 rounded-xl border border-white/10 bg-[#14264B] px-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400"
                placeholder="Subject"
                required
              />
              <textarea
                value={contactForm.message}
                onChange={(event) => updateContactField('message', event.target.value)}
                className="min-h-36 rounded-xl border border-white/10 bg-[#14264B] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-slate-400 focus:border-orange-400 md:col-span-2"
                placeholder="Your Message"
                required
              />
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={contactStatus.type === 'loading'}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-sm font-black text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={16} />
                {contactStatus.type === 'loading' ? 'Sending...' : 'Send Message'}
              </button>
              {contactStatus.type !== 'idle' && (
                <p
                  aria-live="polite"
                  className={`text-sm font-bold ${contactStatus.type === 'error' ? 'text-red-200' : contactStatus.type === 'success' ? 'text-emerald-300' : 'text-orange-200'}`}
                >
                  {contactStatus.text}
                </p>
              )}
            </div>
          </form>
        </div>
      </section>

      <footer className="bg-[#07142D] px-5 py-12 text-white md:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 border-b border-white/10 pb-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <div>
            <BrandLogo variant="light" />
            <p className="mt-5 max-w-sm text-sm font-medium leading-7 text-slate-400">
              A microbial genomics platform for India-focused discovery and responsible global surveillance of approved strain and MAYA data.
            </p>
          </div>
          {footerSections.map((section) => (
            <FooterColumn key={section.title} title={section.title} links={section.links} pathname={pathname} />
          ))}
        </div>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 pt-6 text-xs font-bold text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>2026 BMGA. All rights reserved.</span>
          <span>{BRAND_TAGLINE}</span>
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

function SurveillanceSignal({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex gap-4 p-5">
      <Icon className="mt-0.5 shrink-0 text-teal-700" size={21} />
      <div><h3 className="text-sm font-black text-[#0B1B3A]">{title}</h3><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{body}</p></div>
    </div>
  );
}

function FooterColumn({ title, links, pathname }: { title: string; links: FooterLink[]; pathname: string }) {
  return (
    <div>
      <h3 className="text-sm font-black">{title}</h3>
      <ul className="mt-4 space-y-3 text-sm font-medium text-slate-400">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isActiveFooterLink(pathname, link.href) ? 'page' : undefined}
              className={`transition hover:text-orange-300 ${isActiveFooterLink(pathname, link.href) ? 'text-orange-300' : ''}`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function isActiveFooterLink(pathname: string, href: string) {
  const [hrefPath, hash] = href.split('#');
  if (hash) return false;
  return hrefPath === pathname;
}
