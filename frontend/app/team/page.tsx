import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  GraduationCap,
  Handshake,
  Mail,
  Microscope,
  Network,
  UsersRound,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import HomeNavigation from '../components/home/HomeNavigation';
import { BRAND_FULL_NAME } from '../lib/brand';
import AboutTeamDirectory from './AboutTeamDirectory';

export const metadata: Metadata = {
  title: `About Us | ${BRAND_FULL_NAME}`,
  description: `Meet the collaborating institutions, scientific leadership, developers, and students behind ${BRAND_FULL_NAME}.`,
};

type OrganizationPartner = {
  name: string;
  statement: string;
  body: string;
  logoSrc: string;
  logoAlt: string;
  accent: 'orange' | 'teal';
};

const partnerOrganizations: OrganizationPartner[] = [
  {
    name: 'Amrita School of Biotechnology',
    statement: 'Advancing biotechnology, deep learning, and interdisciplinary scientific research.',
    body: 'An academic environment connecting life sciences, computation, applied research, and training for the next generation of bioinformatics contributors.',
    logoSrc: '/partners/amrita-biotech-logo.svg',
    logoAlt: 'Amrita School of Biotechnology logo placeholder',
    accent: 'orange',
  },
  {
    name: 'Sivasakthi Science Foundation',
    statement: 'Building strong alliances for impactful science.',
    body: 'We believe in the power of collaboration to advance global research, training, and education through public-good scientific infrastructure.',
    logoSrc: '/partners/sivasakthi-science-foundation-logo.svg',
    logoAlt: 'Sivasakthi Science Foundation logo placeholder',
    accent: 'teal',
  },
];

const collaborationPrinciples = [
  { title: 'Collaborate', body: 'Connect institutions and disciplines around shared scientific questions.', icon: Handshake },
  { title: 'Research', body: 'Curate genomic evidence with documented provenance and limitations.', icon: Microscope },
  { title: 'Train', body: 'Build practical bioinformatics skills through research participation.', icon: GraduationCap },
  { title: 'Educate', body: 'Support open scientific learning and responsible data reuse.', icon: BookOpenCheck },
];

export default function AboutUsPage() {
  return (
    <div className="min-h-screen bg-white text-[#0B1B3A] selection:bg-orange-500/20">
      <HomeNavigation genomeHref="/dashboard#genome-toolset" />

      <main id="main-content">
        <section className="overflow-hidden bg-[#07172f] px-5 py-16 text-white md:px-8 lg:py-20">
          <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <h1 className="text-5xl font-black leading-none sm:text-6xl">About Us</h1>
              <p className="mt-7 max-w-2xl text-lg font-semibold leading-8 text-slate-300">
                Bharat Microbial Genome Atlas is the result of collaborative work between Amrita School of Biotechnology and Sivasakthi Science Foundation.
              </p>
              <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-slate-400">
                Together, we connect biotechnology, artificial intelligence, computational biology, scientific training, and public data infrastructure to support responsible genomic discovery.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="#collaboration" className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-500 px-6 text-sm font-black text-white transition hover:bg-orange-600">
                  Our collaboration <ArrowRight size={17} />
                </Link>
                <Link href="#team" className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 px-6 text-sm font-black text-white transition hover:border-teal-300 hover:text-teal-200">
                  Meet the team <UsersRound size={17} />
                </Link>
              </div>
            </div>

            <div className="border-y border-white/15">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-5 border-b border-white/15 py-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-orange-500/15 text-orange-300"><Network size={24} /></span>
                <div><h2 className="text-lg font-black">Interdisciplinary by design</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-400">Scientific leadership, software engineering, institutional alliances, and student research contribute to one shared platform.</p></div>
              </div>
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-5 py-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-teal-500/15 text-teal-300"><Building2 size={24} /></span>
                <div><h2 className="text-lg font-black">Built for public scientific value</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-400">The collaboration supports research, education, training, and reusable genomic knowledge with clear evidence boundaries.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section id="collaboration" className="scroll-mt-24 px-5 py-18 md:px-8 lg:py-24">
          <div className="mx-auto max-w-[1320px]">
            <div className="grid gap-8 border-b border-slate-200 pb-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <h2 className="text-3xl font-black sm:text-4xl">Built through collaboration</h2>
              <p className="max-w-3xl text-base font-semibold leading-7 text-slate-600">The database combines complementary institutional strengths to create durable scientific resources and stronger pathways for research participation.</p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {partnerOrganizations.map((organization) => <OrganizationProfile key={organization.name} organization={organization} />)}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-[#f4f7fa] px-5 py-16 md:px-8">
          <div className="mx-auto grid max-w-[1320px] gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div>
              <h2 className="text-3xl font-black">Collaborate. Research.<br />Train. Educate.</h2>
              <p className="mt-5 max-w-xl text-sm font-semibold leading-7 text-slate-600">Our shared work brings institutions, disciplines, and learners together around scientifically rigorous and socially useful genomic resources.</p>
            </div>
            <div className="grid border border-slate-200 bg-slate-200 sm:grid-cols-2">
              {collaborationPrinciples.map((principle) => {
                const Icon = principle.icon;
                return <div key={principle.title} className="flex gap-4 border-b border-r border-slate-200 bg-white p-5"><Icon className="mt-0.5 shrink-0 text-teal-700" size={21} /><div><h3 className="text-sm font-black">{principle.title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{principle.body}</p></div></div>;
              })}
            </div>
          </div>
        </section>

        <section id="team" className="scroll-mt-24 px-5 py-18 md:px-8 lg:py-24">
          <div className="mx-auto max-w-[1320px]">
            <AboutTeamDirectory />
          </div>
        </section>

        <section className="bg-white px-5 py-14 md:px-8">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-6 border-l-4 border-orange-500 pl-6 md:flex-row md:items-center md:justify-between">
            <div><h2 className="text-2xl font-black">Collaborate with BMGA</h2><p className="mt-2 text-sm font-semibold text-slate-600">Connect with the team about research, training, data contribution, or institutional collaboration.</p></div>
            <Link href="/#contact" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 bg-[#0B1B3A] px-6 text-sm font-black text-white hover:bg-teal-700">Contact us <Mail size={17} /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#07172f] px-5 py-8 text-white md:px-8">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo variant="light" size="sm" />
          <div className="flex gap-5 text-xs font-bold text-slate-400"><Link href="/privacy" className="hover:text-white">Privacy</Link><Link href="/fair" className="hover:text-white">FAIR data</Link><Link href="/#contact" className="hover:text-white">Contact</Link></div>
        </div>
      </footer>
    </div>
  );
}

function OrganizationProfile({ organization }: { organization: OrganizationPartner }) {
  const accent = organization.accent === 'orange' ? 'border-t-orange-500' : 'border-t-teal-600';
  return (
    <article className={`grid gap-6 rounded-lg border border-slate-200 border-t-4 ${accent} bg-white p-6 shadow-sm sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center md:p-8`}>
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-4">
        <Image src={organization.logoSrc} alt={organization.logoAlt} width={140} height={105} className="h-full w-full object-contain" />
      </div>
      <div><h3 className="text-2xl font-black">{organization.name}</h3><p className="mt-3 text-sm font-black leading-6 text-orange-700">{organization.statement}</p><p className="mt-4 text-sm font-semibold leading-7 text-slate-600">{organization.body}</p></div>
    </article>
  );
}
