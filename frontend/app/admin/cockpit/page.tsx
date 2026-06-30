'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import { BookOpenCheck, ClipboardCheck, Database, ShieldCheck, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type StatusRecord = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
};

export default function AdminCockpitPage() {
  const { data: session } = useSession();
  const [userCount, setUserCount] = useState(0);
  const [uploads, setUploads] = useState<StatusRecord[]>([]);
  const [posts, setPosts] = useState<StatusRecord[]>([]);
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
        const [usersRes, uploadsRes, postsRes] = await Promise.all([
          fetch(apiPath('/admin/users'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/organism-uploads'), { headers, cache: 'no-store' }),
          fetch(apiPath('/admin/blog-posts'), { headers, cache: 'no-store' }),
        ]);
        const [usersData, uploadsData, postsData] = await Promise.all([
          usersRes.ok ? usersRes.json() as Promise<unknown[]> : Promise.resolve([]),
          uploadsRes.ok ? uploadsRes.json() as Promise<StatusRecord[]> : Promise.resolve([]),
          postsRes.ok ? postsRes.json() as Promise<StatusRecord[]> : Promise.resolve([]),
        ]);
        if (!active) return;
        setUserCount(usersData.length);
        setUploads(uploadsData);
        setPosts(postsData);
      } catch (error) {
        console.error('Admin cockpit load failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [headers, session?.user?.accessToken]);

  const pendingUploads = uploads.filter((item) => item.status === 'PENDING').length;
  const pendingPosts = posts.filter((item) => item.status === 'PENDING').length;

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
          <Link href="/admin" className="text-xs font-black uppercase tracking-widest text-orange-300">MAYA Ingestion Portal</Link>
          <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
            <ShieldCheck className="text-orange-400" size={36} /> Admin Cockpit
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
            Manage registered users, role privileges, organism submissions, and blog approval workflows from one private dashboard.
          </p>
        </header>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={UsersRound} label="Registered Users" value={loading ? '...' : String(userCount)} href="/admin/users" />
          <MetricCard icon={ClipboardCheck} label="Pending Uploads" value={loading ? '...' : String(pendingUploads)} href="/admin/uploads" />
          <MetricCard icon={BookOpenCheck} label="Pending Blog Posts" value={loading ? '...' : String(pendingPosts)} href="/admin/blogs" />
          <MetricCard icon={Database} label="Published Uploads" value={loading ? '...' : String(uploads.filter((item) => item.status === 'APPROVED').length)} href="/dashboard" />
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          <AdminLink href="/admin/users" title="User Privilege Management" body="Assign Normal User, Contributor, Moderator, or Admin privileges." />
          <AdminLink href="/admin/uploads" title="Pending Organism Review" body="Edit, approve, reject, or delete submitted organism metadata." />
          <AdminLink href="/admin/blogs" title="Blog Approval Management" body="Review submitted blog posts before public publication." />
        </section>
      </div>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-xl">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
        <Icon size={23} />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 text-4xl font-black tracking-tight">{value}</p>
    </Link>
  );
}

function AdminLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-orange-300 hover:shadow-xl">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{body}</p>
    </Link>
  );
}
