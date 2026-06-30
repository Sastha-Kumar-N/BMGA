'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import {
  BookOpenText,
  ClipboardCheck,
  Database,
  Dna,
  FilePlus2,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  PenLine,
  ShieldCheck,
  UploadCloud,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  activePaths?: string[];
  activeHash?: string;
};

const LOGGED_OUT_LINKS: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, activePaths: ['/'] },
  { label: 'Organism Database', href: '/dashboard#organism-registry', icon: Database, activeHash: '#organism-registry' },
  { label: 'Blog', href: '/blog', icon: BookOpenText, activePaths: ['/blog'] },
  { label: 'Login', href: '/login', icon: LogIn, activePaths: ['/login'] },
  { label: 'Register', href: '/register', icon: UserPlus, activePaths: ['/register'] },
];

const LOGGED_IN_LINKS: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, activePaths: ['/'] },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, activePaths: ['/dashboard'] },
  { label: 'Organism Database', href: '/dashboard#organism-registry', icon: Database, activeHash: '#organism-registry' },
  { label: 'Upload Organism Data', href: '/submit-organism', icon: UploadCloud, activePaths: ['/submit-organism'] },
  { label: 'Blog', href: '/blog', icon: BookOpenText, activePaths: ['/blog'] },
  { label: 'Create Blog Post', href: '/blog/create', icon: PenLine, activePaths: ['/blog/create'] },
  { label: 'My Submissions', href: '/account', icon: FilePlus2, activePaths: ['/account'] },
];

const ADMIN_LINKS: NavItem[] = [
  { label: 'Admin Cockpit', href: '/admin/cockpit', icon: ShieldCheck, activePaths: ['/admin/cockpit'] },
  { label: 'Manage Users', href: '/admin/users', icon: UsersRound, activePaths: ['/admin/users'] },
  { label: 'Review Organism Uploads', href: '/admin/uploads', icon: ClipboardCheck, activePaths: ['/admin/uploads'] },
  { label: 'Review Blog Posts', href: '/admin/blogs', icon: BookOpenText, activePaths: ['/admin/blogs'] },
];

const MODERATOR_LINKS: NavItem[] = [
  { label: 'Review Pending Content', href: '/review', icon: ClipboardCheck, activePaths: ['/review'] },
];

function roleLabel(role?: string | null) {
  if (!role || role === 'STUDENT') return 'User';
  return role.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayName(user?: { name?: string | null; email?: string | null }) {
  return user?.name || user?.email || 'BMGA user';
}

export default function GlobalNavbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));

  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  const userRole = session?.user?.role;
  const links = useMemo(() => {
    if (!session) return LOGGED_OUT_LINKS;

    const items = [...LOGGED_IN_LINKS];
    if (userRole === 'ADMIN') items.push(...ADMIN_LINKS);
    if (userRole === 'MODERATOR') items.push(...MODERATOR_LINKS);
    if (userRole === 'CONTRIBUTOR') {
      return items;
    }
    return items;
  }, [session, userRole]);

  const isActive = (item: NavItem) => {
    if (item.activeHash) {
      return pathname === '/dashboard' && currentHash === item.activeHash;
    }

    if (item.activePaths?.includes('/blog') && pathname === '/blog/create') {
      return false;
    }

    if (item.label === 'Dashboard' && currentHash === '#organism-registry') {
      return false;
    }

    return item.activePaths?.some((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`))) || false;
  };

  return (
    <header className="sticky top-0 z-[70] border-b border-white/10 bg-[#0B1B3A]/95 text-white shadow-xl shadow-[#0B1B3A]/10 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/25">
            <Dna size={23} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xl font-black tracking-tight">BMGA</span>
            <span className="block truncate text-[9px] font-black uppercase tracking-widest text-orange-300">Bharat Genome Atlas</span>
          </span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 xl:flex" aria-label="Primary navigation">
          {links.map((item) => (
            <DesktopNavLink key={`${item.href}-${item.label}`} item={item} active={isActive(item)} />
          ))}
        </nav>

        <div className="hidden shrink-0 items-center gap-3 xl:flex">
          {status === 'loading' ? (
            <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-400">Session</span>
          ) : session ? (
            <>
              <div className="max-w-[220px] rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
                <p className="truncate text-sm font-black">{displayName(session.user)}</p>
                <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-orange-300">{roleLabel(userRole)}</p>
              </div>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-300/20 px-4 text-xs font-black uppercase tracking-widest text-red-100 transition hover:bg-red-500/10 hover:text-red-200"
              >
                <LogOut size={15} /> Logout
              </button>
            </>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 text-white transition hover:border-orange-300 hover:text-orange-300 xl:hidden"
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isOpen}
        >
          {isOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {isOpen && (
        <div className="border-t border-white/10 bg-[#0B1B3A] px-4 py-4 xl:hidden">
          <nav className="mx-auto grid max-w-7xl gap-2" aria-label="Mobile navigation">
            {links.map((item) => (
              <MobileNavLink key={`${item.href}-${item.label}`} item={item} active={isActive(item)} onNavigate={() => setIsOpen(false)} />
            ))}
            {session && (
              <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{displayName(session.user)}</p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-orange-300">{roleLabel(userRole)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300/20 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-100"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function DesktopNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-black uppercase tracking-widest transition ${
        active
          ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
          : 'text-slate-300 hover:bg-white/5 hover:text-orange-300'
      }`}
    >
      <Icon size={15} />
      <span className="hidden 2xl:inline">{item.label}</span>
    </Link>
  );
}

function MobileNavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-black transition ${
        active ? 'bg-orange-500 text-white' : 'text-slate-200 hover:bg-white/5 hover:text-orange-300'
      }`}
    >
      <Icon size={17} />
      {item.label}
    </Link>
  );
}
