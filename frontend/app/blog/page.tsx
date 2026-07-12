'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpenText,
  Building2,
  CalendarDays,
  FileText,
  PenLine,
  RefreshCw,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import HomeFooter from '../components/home/HomeFooter';
import HomeNavigation from '../components/home/HomeNavigation';
import { apiPath } from '../lib/api-client';

type BlogPost = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string | null;
  author?: {
    name?: string | null;
    email?: string | null;
    affiliation?: string | null;
  } | null;
};

function articleDate(value?: string | null) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(parsed);
}

function excerpt(value: string, length = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length).trim()}...` : normalized;
}

export default function BlogPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(apiPath('/blog-posts'), { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => ([]));
        if (!response.ok) throw new Error(payload.error || 'Unable to load approved publications.');
        if (active) setPosts((payload as BlogPost[]).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load approved publications.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshVersion]);

  useEffect(() => {
    if (!selectedPost) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedPost(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPost]);

  const featuredPost = posts[0] || null;
  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return posts;
    return posts.filter((post) => [
      post.title,
      post.content,
      post.author?.name,
      post.author?.affiliation,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery));
  }, [posts, query]);

  return (
    <>
      <HomeNavigation genomeHref="/dashboard" />
      <main className="min-h-screen bg-white text-[#0B1B3A]">
        <section className="border-b border-white/10 bg-[#07172f] px-4 py-14 text-white sm:px-6 lg:px-8 lg:py-16">
          <div className="mx-auto grid max-w-[1320px] gap-12 lg:grid-cols-[0.68fr_1.32fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase text-orange-300">BMGA Scientific Blog</p>
              <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">Approved publications</h1>
              <p className="mt-5 max-w-lg text-base font-semibold leading-7 text-slate-300">
                Research notes, platform updates, methods, and genomic perspectives published only after BMGA editorial review.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href={session ? '/blog/create' : '/login'} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-500 px-5 text-sm font-black text-white transition hover:bg-orange-400">
                  <PenLine size={17} /> {session ? 'Propose a post' : 'Sign in to contribute'}
                </Link>
                <Link href="/surveillance/methodology" className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/20 px-5 text-sm font-black text-slate-100 transition hover:border-teal-300 hover:text-teal-200">
                  Editorial context <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            <div aria-live="polite">
              <p className="text-xs font-black uppercase text-teal-300">Featured article</p>
              {loading ? (
                <div className="mt-4 grid min-h-60 animate-pulse gap-5 border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-[150px_1fr]">
                  <div className="bg-white/10" /><div className="space-y-4"><div className="h-7 w-3/4 bg-white/10" /><div className="h-4 w-1/2 bg-white/10" /><div className="h-20 bg-white/10" /></div>
                </div>
              ) : featuredPost ? (
                <article className="mt-4 grid gap-6 border-y border-white/15 py-6 sm:grid-cols-[150px_1fr] sm:items-center">
                  <div className="flex aspect-square items-center justify-center border border-white/10 bg-[#102442] text-teal-300"><FileText size={48} strokeWidth={1.3} /></div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase text-orange-300">Latest approved</p>
                    <h2 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{featuredPost.title}</h2>
                    <ArticleMeta post={featuredPost} light />
                    <p className="mt-4 text-sm font-semibold leading-6 text-slate-300">{excerpt(featuredPost.content, 280)}</p>
                    <button type="button" onClick={() => setSelectedPost(featuredPost)} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal-300 hover:text-white">Read article <ArrowRight size={16} /></button>
                  </div>
                </article>
              ) : error ? (
                <PublicationMessage icon={AlertCircle} title="Featured article unavailable" body={error} tone="text-red-300" />
              ) : (
                <PublicationMessage icon={BookOpenText} title="No approved publications yet" body="New posts will appear after editorial review and approval." tone="text-slate-400" />
              )}
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-[#f4f7fa] px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <label className="relative block w-full md:max-w-xl">
              <span className="sr-only">Search approved publications</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, article text, author, or affiliation" className="min-h-12 w-full border border-slate-300 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15" />
            </label>
            <div className="flex items-center justify-between gap-4 md:justify-end">
              <p className="text-xs font-bold text-slate-500">{loading ? 'Loading publications...' : `${filteredPosts.length.toLocaleString('en-IN')} approved ${filteredPosts.length === 1 ? 'publication' : 'publications'}`}</p>
              {query && <button type="button" onClick={() => setQuery('')} className="inline-flex min-h-11 items-center gap-2 px-3 text-xs font-black text-teal-800 hover:text-orange-700"><X size={15} /> Clear search</button>}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-20" aria-labelledby="publication-index-title">
          <div className="mx-auto max-w-[1320px]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-black uppercase text-teal-700">Publication index</p><h2 id="publication-index-title" className="mt-2 text-3xl font-black">Latest approved writing</h2></div>
              <p className="max-w-md text-sm font-semibold leading-6 text-slate-500">Results reflect the current approved database. Pending and rejected drafts are not public.</p>
            </div>

            {error && !posts.length ? (
              <div className="mt-10 border border-red-200 bg-red-50 p-8 text-center">
                <AlertCircle className="mx-auto text-red-600" size={34} /><h3 className="mt-4 text-lg font-black">Unable to load publications</h3><p className="mt-2 text-sm font-semibold text-red-800">{error}</p><button type="button" onClick={() => setRefreshVersion((value) => value + 1)} className="mt-5 inline-flex min-h-11 items-center gap-2 bg-[#0B1B3A] px-5 text-sm font-black text-white"><RefreshCw size={16} /> Try again</button>
              </div>
            ) : loading ? (
              <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">{[1, 2, 3].map((item) => <div key={item} className="grid animate-pulse gap-5 py-6 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_150px]"><div className="h-16 bg-slate-100" /><div className="h-12 bg-slate-100" /><div className="h-10 bg-slate-100" /></div>)}</div>
            ) : filteredPosts.length ? (
              <>
                <div className="mt-10 hidden border-y border-slate-200 md:block">
                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_150px_120px] gap-5 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase text-slate-500"><span>Article</span><span>Author and affiliation</span><span>Date</span><span className="text-right">Action</span></div>
                  <div className="divide-y divide-slate-200">{filteredPosts.map((post) => <PublicationRow key={post.id} post={post} onOpen={() => setSelectedPost(post)} />)}</div>
                </div>
                <div className="mt-8 grid gap-4 md:hidden">{filteredPosts.map((post) => <PublicationCard key={post.id} post={post} onOpen={() => setSelectedPost(post)} />)}</div>
              </>
            ) : (
              <div className="mt-10 border-y border-slate-200 py-16 text-center"><BookOpenText className="mx-auto text-slate-300" size={42} /><h3 className="mt-4 text-lg font-black">{query ? 'No publications match this search' : 'No approved publications yet'}</h3><p className="mt-2 text-sm font-semibold text-slate-500">{query ? 'Try a different title, author, affiliation, or phrase.' : 'New posts will appear here after editorial approval.'}</p></div>
            )}
          </div>
        </section>
      </main>
      <HomeFooter genomeHref="/dashboard" resultsHref="/dashboard" signedIn={Boolean(session)} />
      {selectedPost && <ArticleViewer post={selectedPost} onClose={() => setSelectedPost(null)} />}
    </>
  );
}

function ArticleMeta({ post, light = false }: { post: BlogPost; light?: boolean }) {
  const tone = light ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className={`mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold ${tone}`}>
      <span className="inline-flex items-center gap-1.5"><UserRound size={14} className="text-teal-600" />{post.author?.name || 'BMGA contributor'}</span>
      {post.author?.affiliation && <span className="inline-flex items-center gap-1.5"><Building2 size={14} className="text-teal-600" />{post.author.affiliation}</span>}
      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-orange-500" />{articleDate(post.createdAt)}</span>
    </div>
  );
}

function PublicationRow({ post, onOpen }: { post: BlogPost; onOpen: () => void }) {
  return (
    <article className="grid grid-cols-[minmax(0,1.4fr)_minmax(180px,0.7fr)_150px_120px] items-center gap-5 px-5 py-5 transition hover:bg-slate-50">
      <div className="min-w-0"><h3 className="truncate text-base font-black">{post.title}</h3><p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{excerpt(post.content, 180)}</p></div>
      <div className="min-w-0 text-xs"><p className="truncate font-black">{post.author?.name || 'BMGA contributor'}</p><p className="mt-1 truncate font-semibold text-slate-500">{post.author?.affiliation || 'Affiliation not provided'}</p></div>
      <p className="text-xs font-bold text-slate-600">{articleDate(post.createdAt)}</p>
      <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center justify-end gap-2 text-sm font-black text-teal-800 hover:text-orange-700">Read <ArrowRight size={15} /></button>
    </article>
  );
}

function PublicationCard({ post, onOpen }: { post: BlogPost; onOpen: () => void }) {
  return (
    <article className="border border-slate-200 bg-white p-5 shadow-sm">
      <FileText className="text-teal-700" size={24} /><h3 className="mt-5 text-xl font-black leading-tight">{post.title}</h3><ArticleMeta post={post} /><p className="mt-4 line-clamp-4 text-sm font-semibold leading-6 text-slate-600">{excerpt(post.content)}</p><button type="button" onClick={onOpen} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-teal-800 hover:text-orange-700">Read article <ArrowRight size={16} /></button>
    </article>
  );
}

function PublicationMessage({ icon: Icon, title, body, tone }: { icon: typeof AlertCircle; title: string; body: string; tone: string }) {
  return <div className="mt-4 flex min-h-52 items-center gap-5 border-y border-white/15 py-8"><Icon className={tone} size={36} /><div><h2 className="text-lg font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-400">{body}</p></div></div>;
}

function ArticleViewer({ post, onClose }: { post: BlogPost; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="article-viewer-title">
      <button type="button" className="absolute inset-0 bg-[#041126]/85 backdrop-blur-sm" onClick={onClose} aria-label="Close article" />
      <article className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between gap-5 border-b border-slate-200 bg-white px-5 py-5 sm:px-8">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase text-orange-600">Approved BMGA publication</p><h2 id="article-viewer-title" className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{post.title}</h2><ArticleMeta post={post} /></div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-slate-200 text-slate-600 hover:border-orange-400 hover:text-orange-700" aria-label="Close article"><X size={20} /></button>
        </header>
        <div className="px-5 py-8 sm:px-8 sm:py-10"><p className="whitespace-pre-wrap text-base font-medium leading-8 text-slate-700">{post.content}</p></div>
      </article>
    </div>
  );
}
