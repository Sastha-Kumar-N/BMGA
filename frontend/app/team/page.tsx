import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  Building2,
  Code2,
  GraduationCap,
  Handshake,
  Mail,
  ShieldAlert,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { BRAND_FULL_NAME } from '../lib/brand';

export const metadata: Metadata = {
  title: `About Us | ${BRAND_FULL_NAME}`,
  description: `Learn about the collaborative institutions and team behind ${BRAND_FULL_NAME}.`,
};

type OrganizationPartner = {
  name: string;
  subtitle: string;
  body: string;
  logoSrc: string;
  logoAlt: string;
  icon: LucideIcon;
  accent: 'orange' | 'cyan';
};

type CoreMember = {
  name: string;
  title: string;
  affiliation?: string;
  bio: string;
  email: string;
  portraitAlt: string;
  tags: string[];
  icon: LucideIcon;
};

type StudentMember = {
  name: string;
  program: string;
  affiliation: string;
};

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Analysis', href: '/#analysis' },
  { label: 'Our Projects', href: '/#projects' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact Us', href: '/#contact' },
];

const partnerOrganizations: OrganizationPartner[] = [
  {
    name: 'Amrita School of Biotechnology',
    subtitle: 'Advancing biotechnology, deep learning, and interdisciplinary scientific research.',
    body: 'BMGA is shaped by an academic environment that connects life sciences, computation, applied research, and training for the next generation of bioinformatics contributors.',
    logoSrc: '/partners/amrita-biotech-logo.svg',
    logoAlt: 'Amrita School of Biotechnology logo placeholder',
    icon: BrainCircuit,
    accent: 'orange',
  },
  {
    name: 'Sivasakthi Science Foundation',
    subtitle: 'Building strong alliances for impactful science.',
    body: 'Sivasakthi Science Foundation supports collaborative research, education, and public-good scientific infrastructure. We believe in the power of collaboration to advance global research, training, and education.',
    logoSrc: '/partners/sivasakthi-science-foundation-logo.svg',
    logoAlt: 'Sivasakthi Science Foundation logo placeholder',
    icon: Handshake,
    accent: 'cyan',
  },
];

const leadershipMembers: CoreMember[] = [
  {
    name: 'Dr. Sabarinath Subramaniam',
    title: 'Director, Sivasakthi Science Foundation (SSF)',
    bio: "Science leader with over 25 years of experience across Biotechnology, Neuroscience, Bioinformatics, and Plant Genomics. Guides BMGA's scientific vision, research partnerships, data strategy, and long-term roadmap.",
    email: 'shabari@sivasakthifoundation.org',
    portraitAlt: 'Portrait of Dr. Sabarinath Subramaniam',
    tags: ['Scientific Vision', 'Research Partnerships', 'Data Strategy'],
    icon: BrainCircuit,
  },
];

const researchMembers: CoreMember[] = [
  {
    name: 'Sastha Kumar N',
    title: 'Research Scholar & Developer',
    affiliation: 'Amrita School of Biotechnology & Sivasakthi Science Foundation',
    bio: 'PhD Scholar bridging AI and life sciences. Builds data platforms, machine learning workflows, and web tools for genomics, education, agriculture, and health applications. Contributes to BMGA through platform architecture, data integration, user experience design, and computational biology workflows.',
    email: 'admin@bgdb.org',
    portraitAlt: 'Portrait of Sastha Kumar N',
    tags: ['Platform Architecture', 'AI + Life Sciences', 'Computational Biology'],
    icon: Code2,
  },
];

const studentMembers: StudentMember[] = [
  {
    name: 'Aditya',
    program: 'MSc Bioinformatics',
    affiliation: 'Amrita School of Biotechnology',
  },
  {
    name: 'Lekshmi',
    program: 'MSc Bioinformatics',
    affiliation: 'Amrita School of Biotechnology',
  },
  {
    name: 'Srerag',
    program: 'MSc Bioinformatics',
    affiliation: 'Amrita School of Biotechnology',
  },
];

const scienceStats = [
  { label: 'Partner Organizations', value: partnerOrganizations.length, icon: Handshake },
  { label: 'Scientific Leadership', value: leadershipMembers.length, icon: ShieldAlert },
  { label: 'Research Contributors', value: researchMembers.length + studentMembers.length, icon: UsersRound },
];

export default function AboutUsPage() {
  return (
    <main className="min-h-screen bg-white text-[#0B1B3A] selection:bg-orange-500/20">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1B3A]/95 text-white shadow-2xl shadow-[#0B1B3A]/10 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4 md:px-8">
          <Link href="/" className="min-w-0" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo variant="light" />
          </Link>

          <div className="hidden items-center gap-7 text-sm font-black lg:flex">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={item.label === 'About Us' ? 'text-orange-300' : 'text-slate-200 transition hover:text-orange-300'}>
                {item.label}
              </Link>
            ))}
          </div>

          <Link href="/dashboard" className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400">
            Dashboard
          </Link>
        </div>
      </nav>

      <section className="relative overflow-hidden bg-[#0B1B3A] px-5 py-20 text-white md:px-8">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:54px_54px]" />
        <DnaRibbon className="absolute bottom-0 left-0 h-80 w-full text-cyan-300/20" />

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h1 className="text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">About Us</h1>
            <p className="mt-7 max-w-2xl text-base font-medium leading-8 text-slate-300 md:text-lg">
              The database is a result of collaborative work between Amrita School of Biotechnology and Sivasakthi Science Foundation.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="#collaboration" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-sm font-black text-white shadow-xl shadow-orange-500/25 transition hover:bg-orange-400">
                View Collaboration <ArrowRight size={17} />
              </Link>
              <Link href="/#contact" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-4 text-sm font-black text-white transition hover:border-orange-300 hover:text-orange-300">
                Contact BMGA <Mail size={17} />
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 p-6 shadow-2xl shadow-black/20 backdrop-blur-md">
            <div className="grid gap-4 sm:grid-cols-3">
              {scienceStats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-2xl border border-white/10 bg-[#07142D]/70 p-5">
                    <Icon className="text-orange-300" size={22} />
                    <p className="mt-5 font-mono text-4xl font-black">{stat.value}</p>
                    <p className="mt-2 text-[10px] font-black uppercase leading-snug tracking-widest text-slate-400">{stat.label}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 rounded-2xl border border-orange-300/20 bg-orange-500/10 p-5">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-200">
                <Sparkles size={15} />
                Collaborative scientific platform
              </p>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
                Academic research, foundation-led alliances, software engineering, and student contribution come together to support a growing microbial genome knowledge platform.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="collaboration" className="bg-slate-50 px-5 py-20 md:px-8">
        <SectionHeader
          title="Collaborative Foundation"
          body="BMGA brings institutional research strength and alliance-building into one scientific data platform."
        />
        <div className="mx-auto mt-10 grid max-w-7xl gap-6 lg:grid-cols-2">
          {partnerOrganizations.map((organization) => (
            <OrganizationCard key={organization.name} organization={organization} />
          ))}
        </div>
      </section>

      <section id="leadership" className="bg-white px-5 py-20 md:px-8">
        <SectionHeader
          title="Leadership"
          body="Scientific leadership for research partnerships, data quality, and the long-term BMGA roadmap."
        />
        <div className="mx-auto mt-10 grid max-w-7xl gap-6 lg:grid-cols-1">
          {leadershipMembers.map((member) => (
            <FeaturedMemberCard key={member.email} member={member} />
          ))}
        </div>
      </section>

      <section className="bg-slate-50 px-5 py-20 md:px-8">
        <SectionHeader
          title="Development & Research"
          body="Platform development and computational biology work connecting AI, genomics, and practical public data tools."
        />
        <div className="mx-auto mt-10 grid max-w-7xl gap-6 lg:grid-cols-1">
          {researchMembers.map((member) => (
            <FeaturedMemberCard key={member.email} member={member} />
          ))}
        </div>
      </section>

      <section className="bg-white px-5 py-20 md:px-8">
        <SectionHeader
          title="Students"
          body="Student contributors supporting bioinformatics research, annotation workflows, and knowledge organization."
        />
        <div className="mx-auto mt-10 grid max-w-7xl gap-5 md:grid-cols-3">
          {studentMembers.map((student) => (
            <StudentCard key={student.name} student={student} />
          ))}
        </div>
      </section>

      <footer className="bg-[#07142D] px-5 py-10 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm font-bold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3 text-white" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo variant="light" size="sm" />
          </Link>
          <Link href="/#contact" className="transition hover:text-orange-300">Contact the BMGA team</Link>
        </div>
      </footer>
    </main>
  );
}

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <header className="mx-auto max-w-7xl">
      <h2 className="text-4xl font-black tracking-tight text-[#0B1B3A]">{title}</h2>
      <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-slate-500">{body}</p>
    </header>
  );
}

function OrganizationCard({ organization }: { organization: OrganizationPartner }) {
  const Icon = organization.icon;
  const accentClasses = organization.accent === 'orange'
    ? 'border-orange-200 bg-orange-50 text-orange-700'
    : 'border-cyan-200 bg-cyan-50 text-cyan-700';

  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-2xl hover:shadow-slate-200/80">
      <div className="grid min-h-full gap-0 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="flex items-center justify-center border-b border-slate-200 bg-[#0B1B3A] p-8 lg:border-b-0 lg:border-r">
          <div className="grid h-36 w-36 place-items-center rounded-3xl border border-white/10 bg-white p-4 shadow-2xl shadow-black/20">
            <Image src={organization.logoSrc} alt={organization.logoAlt} width={132} height={132} className="h-full w-full object-contain" />
          </div>
        </div>
        <div className="p-6 md:p-8">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${accentClasses}`}>
            <Icon size={14} />
            Highlighted Partner
          </span>
          <h3 className="mt-5 text-3xl font-black tracking-tight text-[#0B1B3A]">{organization.name}</h3>
          <p className="mt-3 text-base font-black leading-7 text-orange-600">{organization.subtitle}</p>
          <p className="mt-4 text-sm font-semibold leading-7 text-slate-600">{organization.body}</p>
        </div>
      </div>
    </article>
  );
}

function FeaturedMemberCard({ member }: { member: CoreMember }) {
  const Icon = member.icon;

  return (
    <article className="group grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-2xl hover:shadow-slate-200/80 lg:grid-cols-[340px_minmax(0,1fr)]">
      <div className="relative min-h-72 overflow-hidden bg-[#0B1B3A] p-7 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,rgba(249,115,22,0.30),transparent_30%),linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />
        <div className="relative flex h-full flex-col items-center justify-center">
          <div
            role="img"
            aria-label={member.portraitAlt}
            className="grid h-44 w-44 place-items-center rounded-full border border-white/15 bg-white/10 text-orange-200 shadow-2xl shadow-black/20"
          >
            <Icon size={64} />
          </div>
          <p className="mt-5 text-center text-[10px] font-black uppercase tracking-widest text-orange-200">{member.tags[0]}</p>
        </div>
      </div>

      <div className="p-6 md:p-8">
        <div className="flex flex-wrap gap-2">
          {member.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
              {tag}
            </span>
          ))}
        </div>
        <h3 className="mt-5 text-3xl font-black tracking-tight text-[#0B1B3A]">{member.name}</h3>
        <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-600">
          <Building2 size={16} className="text-orange-500" />
          {member.title}
        </p>
        {member.affiliation && (
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-500">
            <BookOpenCheck size={16} className="text-emerald-600" />
            {member.affiliation}
          </p>
        )}
        <p className="mt-5 max-w-4xl text-sm font-semibold leading-7 text-slate-600">{member.bio}</p>
        <a href={`mailto:${member.email}`} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#0B1B3A] px-5 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500">
          <Mail size={15} />
          {member.email}
        </a>
      </div>
    </article>
  );
}

function StudentCard({ student }: { student: StudentMember }) {
  return (
    <article className="group rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-xl">
      <div
        role="img"
        aria-label={`Student contributor avatar for ${student.name}`}
        className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-[#0B1B3A] text-orange-300 shadow-lg shadow-slate-200"
      >
        <GraduationCap size={34} />
      </div>
      <h3 className="mt-5 text-xl font-black tracking-tight text-[#0B1B3A]">{student.name}</h3>
      <p className="mt-2 text-sm font-black text-orange-600">{student.program}</p>
      <p className="mt-3 text-sm font-bold leading-6 text-slate-500">{student.affiliation}</p>
    </article>
  );
}

function DnaRibbon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 700 280" aria-hidden="true">
      <path d="M20 230C130 70 250 70 360 230C470 390 590 390 680 230" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M20 50C130 210 250 210 360 50C470 -110 590 -110 680 50" fill="none" stroke="currentColor" strokeWidth="4" />
      {Array.from({ length: 12 }).map((_, index) => {
        const x = 55 + index * 54;
        return <line key={x} x1={x} y1="72" x2={x + 28} y2="208" stroke="currentColor" strokeWidth="2" />;
      })}
    </svg>
  );
}
