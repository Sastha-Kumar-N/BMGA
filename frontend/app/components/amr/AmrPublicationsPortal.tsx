'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BookOpenText, ExternalLink, Search } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type Publication = { id: string; slug: string; title: string; authors?: string | null; journal?: string | null; publicationYear?: number | null; doi?: string | null; pubmedId?: string | null; externalUrl?: string | null; openAccess: boolean; findings: Array<{ finding: { slug: string; title: string } }> };

export default function AmrPublicationsPortal() {
  const [items, setItems] = useState<Publication[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams(); if (query.trim()) params.set('q', query.trim());
      const response = await fetch(apiPath(`/amr-publications${params.size ? `?${params.toString()}` : ''}`), { cache: 'no-store' });
      const body = await response.json().catch(() => ({})) as { items?: Publication[]; error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to load AMR publications');
      setItems(body.items || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load AMR publications'); } finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 200); return () => window.clearTimeout(timer); }, [load]);
  return <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8"><div className="mx-auto max-w-[1280px] space-y-6"><header className="border border-[#0B1B3A] bg-[#07172f] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-widest text-orange-300">Curated evidence sources</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">AMR Publications</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">Only independently approved and published AMR literature records are visible here. Publication inclusion does not validate clinical interpretation beyond the source study.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/amr-findings-india" className="inline-flex min-h-11 items-center gap-2 border border-white/20 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-white/10">AMR findings <ArrowRight size={16} /></Link><Link href="/submit-amr-finding" className="inline-flex min-h-11 items-center gap-2 bg-orange-500 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400">Submit evidence <ArrowRight size={16} /></Link></div></header><label className="flex min-h-12 max-w-2xl items-center gap-3 border border-slate-300 bg-white px-4"><Search size={19} className="text-slate-400" /><span className="sr-only">Search publications</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, journal, DOI, or PubMed ID" className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" /></label>{error && <p role="alert" className="border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}<section className="grid gap-4 lg:grid-cols-2">{loading ? [1, 2, 3, 4].map((key) => <div key={key} className="h-52 animate-pulse border border-slate-200 bg-white" />) : items.length ? items.map((publication) => <article key={publication.id} className="border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-500 hover:shadow-md"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest text-orange-600">{publication.publicationYear || 'Year not reported'}</span>{publication.openAccess && <span className="bg-teal-50 px-2 py-1 text-[10px] font-black uppercase text-teal-800">Open access</span>}</div><h2 className="mt-3 text-xl font-black leading-snug"><Link href={`/amr-findings-india/publications/${publication.slug}`} className="hover:text-teal-700">{publication.title}</Link></h2><p className="mt-3 text-sm font-semibold text-slate-600">{publication.authors || 'Authors not reported'}</p><p className="mt-1 text-sm font-bold text-slate-500">{publication.journal || 'Journal not reported'}</p><div className="mt-5 flex flex-wrap gap-3"><Link href={`/amr-findings-india/publications/${publication.slug}`} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-teal-700 hover:text-orange-600">View publication <ArrowRight size={15} /></Link>{publication.externalUrl && <a href={publication.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 hover:text-teal-700">Source <ExternalLink size={14} /></a>}</div></article>) : <div className="col-span-full border border-slate-200 bg-white p-14 text-center"><BookOpenText className="mx-auto text-teal-700" size={34} /><h2 className="mt-4 text-xl font-black">No published AMR publications yet.</h2><p className="mt-2 text-sm font-semibold text-slate-500">Approved publication records will appear here after administrative publication.</p></div>}</section></div></main>;
}
