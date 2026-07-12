'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  BookOpen,
  Database,
  Dna,
  Globe2,
  LogIn,
  LogOut,
  Menu,
  Microscope,
  ShieldAlert,
  UploadCloud,
  X,
} from 'lucide-react';
import BrandLogo from '../BrandLogo';

const sectionLinks = [
  { label: 'Overview', href: '/surveillance', icon: Globe2 },
  { label: 'Global Map', href: '/surveillance#global-map', icon: Globe2 },
  { label: 'AMR Insights', href: '/surveillance/amr', icon: ShieldAlert },
  { label: 'Strain Explorer', href: '/surveillance/records', icon: Database },
  { label: 'Data Quality', href: '/surveillance#data-quality', icon: BarChart3 },
  { label: 'Submit Data', href: '/surveillance/submit', icon: UploadCloud },
  { label: 'Methodology', href: '/surveillance/methodology', icon: BookOpen },
];

const portalLinks = [
  { label: 'Home', href: '/' },
  { label: 'India Dashboard', href: '/dashboard' },
  { label: 'Global Surveillance', href: '/surveillance' },
  { label: 'MAYA Results', href: '/dashboard' },
  { label: 'About', href: '/about' },
];

export default function SurveillanceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f6f8fb] text-[#0B1B3A]">
      <a href="#surveillance-main" className="sr-only z-[100] rounded bg-white px-4 py-3 font-bold text-[#0B1B3A] focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to surveillance content
      </a>
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07172f] text-white shadow-lg">
        <div className="mx-auto flex min-h-16 max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="Bharat Microbial Genome Atlas home" className="min-w-0 shrink-0">
            <span className="sm:hidden"><BrandLogo variant="light" size="sm" showText={false} /></span>
            <span className="hidden sm:inline-flex"><BrandLogo variant="light" size="sm" /></span>
          </Link>
          <nav aria-label="Portal navigation" className="ml-auto hidden items-center gap-1 xl:flex">
            {portalLinks.map((link) => {
              const active = link.href === '/surveillance' && pathname.startsWith('/surveillance');
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`border-b-2 px-3 py-5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${active ? 'border-teal-400 text-teal-300' : 'border-transparent text-slate-200 hover:text-white'}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 xl:ml-3">
            {session ? (
              <>
                <Link href="/account" className="hidden rounded-md border border-white/15 px-3 py-2 text-xs font-bold text-slate-100 transition hover:border-teal-300 hover:text-teal-200 sm:inline-flex">
                  {session.user?.name || session.user?.email || 'Account'}
                </Link>
                <button onClick={() => signOut({ callbackUrl: '/' })} title="Log out" aria-label="Log out" className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 text-slate-200 transition hover:border-orange-300 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-md border border-white/15 px-3 text-xs font-black uppercase text-white transition hover:border-teal-300 hover:text-teal-200">
                <LogIn size={16} /> <span className="hidden sm:inline">Sign in</span>
              </Link>
            )}
            <button
              type="button"
              aria-label="Open surveillance navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 text-white 2xl:hidden"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-white/10 bg-[#07172f] p-4 text-white 2xl:block">
          <div className="sticky top-20">
            <SurveillanceNavigation pathname={pathname} onNavigate={() => undefined} />
          </div>
        </aside>
        <main id="surveillance-main" className="min-w-0 max-w-full overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] 2xl:hidden">
          <button className="absolute inset-0 bg-[#07172f]/70" aria-label="Close surveillance navigation" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-[min(320px,88vw)] overflow-y-auto bg-[#07172f] p-4 text-white shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <BrandLogo variant="light" size="sm" />
              <button aria-label="Close surveillance navigation" onClick={() => setMobileOpen(false)} className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15">
                <X size={20} />
              </button>
            </div>
            <SurveillanceNavigation pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-5 border-t border-white/10 pt-4">
              {portalLinks.map((link) => (
                <Link key={link.label} href={link.href} onClick={() => setMobileOpen(false)} className="block rounded-md px-3 py-3 text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white">
                  {link.label}
                </Link>
              ))}
            </div>
          </aside>
        </div>
      )}

      <footer className="border-t border-white/10 bg-[#07172f] px-5 py-5 text-xs font-semibold text-slate-400">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>BMGA Global Genomic Surveillance is part of Bharat Microbial Genome Atlas.</span>
          <span>Genomic observations require epidemiological and laboratory context.</span>
        </div>
      </footer>
    </div>
  );
}

function SurveillanceNavigation({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav aria-label="Global surveillance navigation">
      <div className="mb-5 flex items-center gap-3 px-2 text-teal-300">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-500/10"><Dna size={20} /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest">BMGA Surveillance</p>
          <p className="text-xs font-semibold text-slate-400">Global genomic signals</p>
        </div>
      </div>
      <div className="space-y-1">
        {sectionLinks.map((link) => {
          const basePath = link.href.split('#')[0];
          const active = link.href.includes('#')
            ? false
            : basePath === '/surveillance'
            ? pathname === '/surveillance'
            : pathname.startsWith(basePath);
          const Icon = link.icon;
          return (
            <Link
              key={link.label}
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md border-l-4 px-3 py-2.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 ${active ? 'border-teal-400 bg-teal-500/15 text-white' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'}`}
            >
              <Icon size={18} /> {link.label}
            </Link>
          );
        })}
      </div>
      <div className="mt-8 rounded-md border border-white/10 p-4">
        <div className="flex items-center gap-2 text-xs font-black text-white"><Microscope size={16} className="text-teal-300" /> Evidence note</div>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Pipeline detections are genotypic evidence unless linked phenotypic testing is explicitly recorded.</p>
      </div>
    </nav>
  );
}
