'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { apiPath } from '../../../lib/api-client';

type Publication = { title: string; authors?: string | null; journal?: string | null; publicationYear?: number | null; doi?: string | null; pubmedId?: string | null; pmcId?: string | null; europePmcId?: string | null; externalUrl?: string | null; citationText?: string | null; openAccess: boolean; findings: Array<{ finding: { slug: string; title: string; keyFinding: string } }> };

export default function AmrPublicationDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [publication, setPublication] = useState<Publication | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    void fetch(apiPath(`/amr-publications/${encodeURIComponent(slug)}`), { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as Publication & { error?: string };
        if (!response.ok) throw new Error(body.error || 'Publication not available');
        setPublication(body);
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Publication not available'));
  }, [slug]);

  if (error) return <main className="min-h-screen bg-[#f6f8fb] p-8 text-[#0B1B3A]"><div className="mx-auto max-w-4xl border border-slate-200 bg-white p-8"><h1 className="text-2xl font-black">Publication not available</h1><p className="mt-3 text-sm font-semibold text-slate-600">{error}</p><Link href="/amr-findings-india/publications" className="mt-5 inline-flex text-sm font-black text-teal-700 underline">Back to publications</Link></div></main>;
  if (!publication) return <main className="min-h-screen bg-[#f6f8fb] p-8"><div className="mx-auto h-96 max-w-4xl animate-pulse bg-slate-200" /></main>;
  return <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8"><article className="mx-auto max-w-4xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-200 bg-[#07172f] p-6 text-white sm:p-8"><p className="text-xs font-black uppercase tracking-widest text-orange-300">Published AMR literature record</p><h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">{publication.title}</h1><p className="mt-4 text-sm font-semibold text-slate-300">{publication.authors || 'Authors not reported'}{publication.journal ? ` | ${publication.journal}` : ''}{publication.publicationYear ? ` | ${publication.publicationYear}` : ''}</p></header><div className="space-y-7 p-6 sm:p-8"><section><h2 className="text-xl font-black">Publication identifiers</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{[['DOI', publication.doi], ['PubMed ID', publication.pubmedId], ['PMCID', publication.pmcId], ['Europe PMC ID', publication.europePmcId]].filter((entry): entry is [string, string] => Boolean(entry[1])).map(([label, value]) => <div key={label} className="border border-slate-200 p-3"><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 break-all font-bold">{value}</dd></div>)}</dl>{publication.externalUrl && <a href={publication.externalUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-teal-700 underline">Open validated source <ExternalLink size={16} /></a>}</section>{publication.citationText && <section><h2 className="text-xl font-black">Citation</h2><p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-slate-700">{publication.citationText}</p></section>}<section><h2 className="text-xl font-black">Linked BMGA findings</h2>{publication.findings.length ? <div className="mt-4 grid gap-3">{publication.findings.map(({ finding }) => <Link key={finding.slug} href={`/amr-findings-india/${finding.slug}`} className="border border-slate-200 p-4 hover:border-teal-500"><p className="font-black">{finding.title}</p><p className="mt-1 text-sm font-semibold text-slate-600">{finding.keyFinding}</p></Link>)}</div> : <p className="mt-3 text-sm font-semibold text-slate-500">No published BMGA finding is linked to this publication yet.</p>}</section></div></article></main>;
}
