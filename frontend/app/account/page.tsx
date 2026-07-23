'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpenText,
  CheckCircle2,
  Clock3,
  Database,
  FilePlus2,
  Globe2,
  Home,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../lib/api-client';
import { BRAND_FULL_NAME } from '../lib/brand';
import BrandLogo from '../components/BrandLogo';

type ReviewStatus = 'PENDING' | 'UNDER_REVIEW' | 'NEEDS_CHANGES' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

type UserUpload = {
  id: string;
  scientificName: string;
  strainName: string;
  status: ReviewStatus;
  reviewNote?: string | null;
  createdAt: string;
};

type BlogPost = {
  id: string;
  title: string;
  status: ReviewStatus;
  reviewNote?: string | null;
  createdAt: string;
};

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [uploads, setUploads] = useState<UserUpload[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);
  const canCreateBlog = ['CONTRIBUTOR', 'MODERATOR', 'ADMIN'].includes(session?.user?.role || '');

  const load = useCallback(async (silent = false) => {
    if (!session?.user?.accessToken) return;
    if (!silent) setLoading(true);
    try {
      const [uploadRes, postRes] = await Promise.all([
        fetch(apiPath('/me/uploads'), { headers, cache: 'no-store' }),
        fetch(apiPath('/me/blog-posts'), { headers, cache: 'no-store' }),
      ]);
      if (!uploadRes.ok || !postRes.ok) {
        const failedResponse = !uploadRes.ok ? uploadRes : postRes;
        const failure = await failedResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(failure.error || 'Account activity could not be loaded');
      }
      const [uploadData, postData] = await Promise.all([
        uploadRes.json() as Promise<UserUpload[]>,
        postRes.json() as Promise<BlogPost[]>,
      ]);
      setUploads(uploadData);
      setPosts(postData);
      setLoadError('');
    } catch (error) {
      console.error('Account dashboard load failed', error);
      setLoadError(error instanceof Error ? error.message : 'Account activity could not be loaded');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [headers, session?.user?.accessToken]);

  useEffect(() => {
    if (!session?.user?.accessToken) return;
    void load();
    const interval = window.setInterval(() => void load(true), 15_000);
    const refreshVisibleAccount = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    window.addEventListener('focus', refreshVisibleAccount);
    document.addEventListener('visibilitychange', refreshVisibleAccount);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleAccount);
      document.removeEventListener('visibilitychange', refreshVisibleAccount);
    };
  }, [load, session?.user?.accessToken]);

  if (status === 'loading') {
    return <AccountShell><p className="text-sm font-black uppercase tracking-widest text-orange-500">Loading account session...</p></AccountShell>;
  }

  return (
    <AccountShell>
      <header className="flex flex-col gap-5 rounded-3xl bg-[#0B1B3A] p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-300">Welcome Dashboard</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight">Hello, {session?.user?.name || 'BMGA user'}</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
            Role: {roleLabel(session?.user?.role)} | Affiliation: {affiliationLabel(session?.user?.affiliation)}
          </p>
        </div>
        <button onClick={() => signOut({ callbackUrl: '/' })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-white/10">
          <LogOut size={15} /> Logout
        </button>
      </header>

      {loadError && (
        <div role="alert" className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle size={19} /> {loadError}
        </div>
      )}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <ActionCard href="/dashboard" icon={LayoutDashboard} title="Main Dashboard" body="Open the India atlas and public organism database." />
        <ActionCard href="/surveillance" icon={Globe2} title="Global Surveillance" body="Explore worldwide strain records, AMR insights, and data freshness." />
        <ActionCard href="/submit-organism" icon={FilePlus2} title="Submit Organism" body="Upload organism and genome metadata for admin approval." />
        <ActionCard href="/account/profile" icon={UserRound} title="Profile & Security" body="Maintain your professional profile, photo, identifiers, and password." />
        <ActionCard
          href={canCreateBlog ? '/blog/create' : '/blog'}
          icon={BookOpenText}
          title={canCreateBlog ? 'Create Blog' : 'Public Blog'}
          body={canCreateBlog ? 'Submit a research note into the blog review queue.' : 'Contributor access is required to submit blog posts.'}
        />
        {session?.user?.role === 'ADMIN' ? (
          <ActionCard href="/admin/cockpit" icon={ShieldCheck} title="Admin Cockpit" body="Review users, pending organisms, and blog posts." />
        ) : canCreateBlog ? (
          <ActionCard href="/blog" icon={Database} title="Public Blog" body="Read approved BMGA posts from verified contributors." />
        ) : (
          <ActionCard href="/account" icon={FilePlus2} title="Submission Status" body="Track your organism uploads and review decisions." />
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <ReviewPanel
          title="Your Organism Uploads"
          empty="No organism submissions yet."
          loading={loading}
          rows={uploads.map((upload) => ({
            id: upload.id,
            title: upload.scientificName,
            subtitle: upload.strainName,
            status: upload.status,
            note: upload.reviewNote,
            href: `/submissions/${upload.id}`,
          }))}
        />
        <ReviewPanel
          title="Your Blog Posts"
          empty="No blog posts submitted yet."
          loading={loading}
          rows={posts.map((post) => ({
            id: post.id,
            title: post.title,
            subtitle: 'BMGA blog submission',
            status: post.status,
            note: post.reviewNote,
          }))}
        />
      </section>
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo size="sm" />
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-widest text-[#0B1B3A] shadow-sm transition hover:border-orange-300 hover:text-orange-600">
              <Home size={15} /> Home
            </Link>
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-orange-500">
              <LayoutDashboard size={15} /> Dashboard
            </Link>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function ActionCard({ href, icon: Icon, title, body }: { href: string; icon: LucideIcon; title: string; body: string }) {
  return (
    <Link href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xl">
      <div className="mb-5 flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
          <Icon size={22} />
        </span>
        <ArrowUpRight className="text-slate-300 transition group-hover:text-orange-500" size={18} />
      </div>
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{body}</p>
    </Link>
  );
}

function ReviewPanel({ title, empty, loading, rows }: {
  title: string;
  empty: string;
  loading: boolean;
  rows: Array<{ id: string; title: string; subtitle: string; status: ReviewStatus; note?: string | null; href?: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-xl font-black tracking-tight">{title}</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {loading ? (
          <p className="px-5 py-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">Loading review queue</p>
        ) : rows.length ? rows.map((row) => {
          const content = (
            <>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{row.title}</p>
              <p className="mt-1 truncate text-xs font-bold text-slate-500">{row.subtitle}</p>
              {row.note && <p className="mt-2 text-xs font-semibold text-slate-500">{row.note}</p>}
            </div>
            <StatusBadge status={row.status} />
            </>
          );

          return row.href ? (
            <Link key={row.id} href={row.href} className="grid gap-4 px-5 py-4 transition hover:bg-orange-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              {content}
            </Link>
          ) : (
            <div key={row.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              {content}
            </div>
          );
        }) : (
          <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">{empty}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const styles = {
    PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
    UNDER_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200',
    NEEDS_CHANGES: 'bg-orange-50 text-orange-700 border-orange-200',
    APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    REJECTED: 'bg-red-50 text-red-700 border-red-200',
    ARCHIVED: 'bg-red-50 text-red-700 border-red-200',
  };
  const Icon = status === 'APPROVED' ? CheckCircle2 : status === 'REJECTED' ? XCircle : Clock3;

  return (
    <span className={`inline-flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-widest ${styles[status]}`}>
      <Icon size={14} /> {status.toLowerCase()}
    </span>
  );
}

function roleLabel(role?: string | null) {
  if (!role || role === 'STUDENT') return 'Normal User';
  return role.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function affiliationLabel(affiliation?: string | null) {
  if (!affiliation) return 'Research';
  return affiliation.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
