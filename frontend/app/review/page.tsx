'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ClipboardCheck, RefreshCcw, ShieldCheck } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type PendingOrganismUpload = {
  id: string;
  scientificName: string;
  strainName: string;
  createdAt: string;
  submittedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type PendingBlogPost = {
  id: string;
  title: string;
  createdAt: string;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type PendingContent = {
  organismUploads: PendingOrganismUpload[];
  blogPosts: PendingBlogPost[];
};

export default function ReviewPendingContentPage() {
  const { data: session } = useSession();
  const [content, setContent] = useState<PendingContent>({ organismUploads: [], blogPosts: [] });
  const [loading, setLoading] = useState(true);

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  useEffect(() => {
    if (!session?.user?.accessToken) return;
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(apiPath('/review/pending-content'), { headers, cache: 'no-store' });
        const data = response.ok ? await response.json() as PendingContent : { organismUploads: [], blogPosts: [] };
        if (active) setContent(data);
      } catch (error) {
        console.error('Pending review load failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [headers, session?.user?.accessToken]);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
          <p className="text-[10px] font-black uppercase tracking-widest text-orange-300">Moderator Workspace</p>
          <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
            <ShieldCheck className="text-orange-400" size={36} /> Review Pending Content
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
            Moderators can inspect pending organism uploads and blog posts. Final approval, rejection, edits, and deletion stay inside the admin cockpit.
          </p>
        </header>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-400">
            <RefreshCcw className="mr-3 animate-spin text-orange-500" size={18} />
            Loading pending content
          </div>
        ) : (
          <section className="grid gap-6 xl:grid-cols-2">
            <ReviewList
              icon={ClipboardCheck}
              title="Pending Organism Uploads"
              empty="No organism uploads are pending."
              rows={content.organismUploads.map((upload) => ({
                id: upload.id,
                title: upload.scientificName,
                subtitle: `${upload.strainName} | ${upload.submittedBy?.email || 'Unknown submitter'}`,
                createdAt: upload.createdAt,
              }))}
              adminHref="/admin/uploads"
              isAdmin={session?.user?.role === 'ADMIN'}
            />
            <ReviewList
              icon={BookOpenCheck}
              title="Pending Blog Posts"
              empty="No blog posts are pending."
              rows={content.blogPosts.map((post) => ({
                id: post.id,
                title: post.title,
                subtitle: post.author?.email || 'Unknown author',
                createdAt: post.createdAt,
              }))}
              adminHref="/admin/blogs"
              isAdmin={session?.user?.role === 'ADMIN'}
            />
          </section>
        )}
      </div>
    </main>
  );
}

function ReviewList({ icon: Icon, title, empty, rows, adminHref, isAdmin }: {
  icon: typeof ClipboardCheck;
  title: string;
  empty: string;
  rows: Array<{ id: string; title: string; subtitle: string; createdAt: string }>;
  adminHref: string;
  isAdmin: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Icon size={21} />
          </span>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
        </div>
        {isAdmin && (
          <Link href={adminHref} className="rounded-xl bg-[#0B1B3A] px-4 py-2 text-xs font-black uppercase tracking-widest text-white">
            Open
          </Link>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="px-5 py-4">
            <p className="truncate text-sm font-black">{row.title}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{row.subtitle}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-400">{new Date(row.createdAt).toLocaleString()}</p>
          </div>
        )) : (
          <p className="px-5 py-12 text-center text-sm font-bold text-slate-500">{empty}</p>
        )}
      </div>
    </div>
  );
}
