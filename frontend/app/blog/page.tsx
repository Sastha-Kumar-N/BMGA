'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpenText, Home, LayoutDashboard, PenLine } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type BlogPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author?: {
    name?: string | null;
    affiliation?: string | null;
  } | null;
};

export default function BlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(apiPath('/blog-posts'), { cache: 'no-store' });
        const data = response.ok ? await response.json() as BlogPost[] : [];
        if (active) setPosts(data);
      } catch (error) {
        console.error('Blog load failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-5 rounded-3xl bg-[#0B1B3A] p-7 text-white md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-300">Approved Publications</p>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-tight">
              <BookOpenText className="text-orange-400" size={34} /> BMGA Blog
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Public posts appear here only after admin review and approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-200">
              <Home size={15} /> Home
            </Link>
            <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-200">
              <LayoutDashboard size={15} /> Dashboard
            </Link>
            <Link href="/blog/create" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-400">
              <PenLine size={16} /> New Post
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-black uppercase tracking-widest text-slate-400">
            Loading approved posts
          </div>
        ) : posts.length ? (
          <section className="grid gap-5 md:grid-cols-2">
            {posts.map((post) => (
              <article key={post.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>{post.author?.name || 'BMGA contributor'}</span>
                  <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                </div>
                <h2 className="text-2xl font-black tracking-tight">{post.title}</h2>
                <p className="mt-4 line-clamp-5 text-sm font-semibold leading-7 text-slate-600">{post.content}</p>
              </article>
            ))}
          </section>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <BookOpenText className="mx-auto mb-4 text-slate-300" size={42} />
            <p className="text-sm font-bold text-slate-500">No approved blog posts are available yet.</p>
          </div>
        )}
      </div>
    </main>
  );
}
