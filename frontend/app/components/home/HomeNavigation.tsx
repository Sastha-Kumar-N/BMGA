'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import BrandLogo from '../BrandLogo';

type NavigationItem = {
  label: string;
  href: string;
  section?: string;
};

export default function HomeNavigation({ genomeHref }: { genomeHref: string }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const items: NavigationItem[] = [
    { label: 'Home', href: '/#home', section: 'home' },
    { label: 'Global Surveillance', href: '/surveillance' },
    { label: 'India Dashboard', href: '/dashboard' },
    { label: 'Genome Tools', href: genomeHref },
    { label: 'Projects', href: '/#projects', section: 'projects' },
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Contact', href: '/#contact', section: 'contact' },
  ];

  useEffect(() => {
    const sections = ['home', 'workspaces', 'india-atlas', 'projects', 'contact']
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => Boolean(element));

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: '-18% 0px -64% 0px', threshold: [0, 0.15, 0.4] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  const isActive = (item: NavigationItem) => {
    if (pathname === '/' && item.section) return activeSection === item.section;
    return item.href !== '/' && !item.href.includes('#') && pathname.startsWith(item.href.split('?')[0]);
  };

  return (
    <>
      <a href="#main-content" className="fixed left-4 top-3 z-[2000] -translate-y-24 bg-white px-4 py-3 text-sm font-black text-[#0B1B3A] shadow-lg transition focus:translate-y-0">
        Skip to main content
      </a>
      <header className="sticky top-0 z-[900] border-b border-white/10 bg-[#06152e]/97 text-white shadow-lg shadow-black/10 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/#home" aria-label="Bharat Microbial Genome Atlas home" onClick={() => setMenuOpen(false)}>
            <BrandLogo variant="light" size="sm" />
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-stretch self-stretch xl:flex">
            {items.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={isActive(item) ? 'page' : undefined}
                className={`relative inline-flex items-center px-3 text-[13px] font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-orange-400 ${
                  isActive(item) ? 'text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
                {isActive(item) && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-orange-500" />}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {session ? (
              <Link href="/account" className="hidden min-h-11 items-center gap-2 border border-white/20 px-4 text-xs font-black text-white transition hover:border-teal-300 hover:text-teal-200 sm:inline-flex">
                <UserRound size={16} />
                <span className="max-w-28 truncate">{session.user?.name || session.user?.email || 'Account'}</span>
              </Link>
            ) : (
              <Link href="/login" className="hidden min-h-11 items-center gap-2 border border-white/20 px-4 text-xs font-black text-white transition hover:border-orange-300 hover:text-orange-200 sm:inline-flex">
                <UserRound size={16} /> Login
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((current) => !current)}
              aria-expanded={menuOpen}
              aria-controls="mobile-primary-navigation"
              aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex h-11 w-11 items-center justify-center border border-white/20 text-white transition hover:border-teal-300 hover:text-teal-200 xl:hidden"
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav id="mobile-primary-navigation" aria-label="Mobile primary navigation" className="border-t border-white/10 bg-[#07172f] px-4 py-4 xl:hidden">
            <div className="mx-auto grid max-w-[1440px] gap-1 sm:grid-cols-2">
              {items.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={`flex min-h-12 items-center border-l-2 px-4 text-sm font-black transition ${
                    isActive(item) ? 'border-orange-500 bg-white/5 text-white' : 'border-transparent text-slate-300 hover:border-teal-500 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              {session ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex min-h-12 items-center gap-2 border-l-2 border-transparent px-4 text-left text-sm font-black text-red-200 hover:border-red-400 hover:bg-red-500/10"
                >
                  <LogOut size={16} /> Sign out
                </button>
              ) : (
                <Link href="/login" onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center gap-2 border-l-2 border-orange-500 px-4 text-sm font-black text-orange-200">
                  <UserRound size={16} /> Login
                </Link>
              )}
            </div>
          </nav>
        )}
      </header>
    </>
  );
}
