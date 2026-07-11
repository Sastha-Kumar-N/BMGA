'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { AlertCircle, ArrowUpRight, Dna, LoaderCircle, Search } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import type { GenomeReferenceStrain } from './types';

type BlastHit = {
  subjectId: string;
  strainId?: number | null;
  organismId?: number | null;
  organismName?: string | null;
  strainName?: string | null;
  identityPercent: number;
  alignmentLength: number;
  evalue: string;
  bitScore: number;
  queryStart: number;
  queryEnd: number;
  subjectStart: number;
  subjectEnd: number;
};

type BlastResponse = {
  hits: BlastHit[];
  database: { referenceCount: number; totalBases: number; builtAt: string; software: string };
  limitations: string;
};

export default function BlastWorkspace({ strain }: { strain: GenomeReferenceStrain }) {
  const { data: session } = useSession();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'strain'>('all');
  const [result, setResult] = useState<BlastResponse | null>(null);
  const [state, setState] = useState<{ type: 'idle' | 'loading' | 'error'; message: string }>({ type: 'idle', message: '' });

  const search = async () => {
    if (!session?.user?.accessToken) {
      setState({ type: 'error', message: 'Sign in to run a resource-limited BLAST search.' });
      return;
    }
    setState({ type: 'loading', message: 'Searching approved BMGA nucleotide references...' });
    setResult(null);
    try {
      const response = await fetch(apiPath('/blast/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.user.accessToken}` },
        body: JSON.stringify({ query, strainId: scope === 'strain' ? strain.id : undefined }),
      });
      const data = await response.json().catch(() => ({})) as BlastResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'BLAST search failed');
      setResult(data);
      setState({ type: 'idle', message: '' });
    } catch (error) {
      setState({ type: 'error', message: error instanceof Error ? error.message : 'BLAST search failed' });
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <section className="border border-slate-200 bg-white p-5">
        <p className="text-[10px] font-black uppercase text-orange-600">NCBI BLAST+</p>
        <h2 className="mt-2 text-xl font-black text-[#0B1B3A]">Nucleotide Similarity Search</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Search a nucleotide sequence against approved BMGA FASTA references. Query sequences are processed in memory and are not stored.</p>
        <label className="mt-5 block">
          <span className="mb-2 block text-[10px] font-black uppercase text-slate-500">Query sequence</span>
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={12} spellCheck={false} placeholder={">query\nACGT..."} className="w-full resize-y border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-6 outline-none focus:border-orange-500 focus:bg-white" />
        </label>
        <fieldset className="mt-4">
          <legend className="text-[10px] font-black uppercase text-slate-500">Search scope</legend>
          <div className="mt-2 grid grid-cols-2 border border-slate-200 bg-slate-50 p-1">
            <button type="button" onClick={() => setScope('all')} className={`px-3 py-2 text-xs font-black ${scope === 'all' ? 'bg-[#0B1B3A] text-white' : 'text-slate-600'}`}>All BMGA</button>
            <button type="button" onClick={() => setScope('strain')} className={`px-3 py-2 text-xs font-black ${scope === 'strain' ? 'bg-[#0B1B3A] text-white' : 'text-slate-600'}`}>This strain</button>
          </div>
        </fieldset>
        <button type="button" onClick={search} disabled={state.type === 'loading' || !query.trim()} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 bg-orange-500 px-4 text-xs font-black uppercase text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
          {state.type === 'loading' ? <LoaderCircle className="animate-spin" size={17} /> : <Search size={17} />} Run BLAST
        </button>
        <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">BLAST similarity is genotypic computational evidence, not phenotypic susceptibility or clinical interpretation.</div>
      </section>

      <section className="min-w-0 border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-black text-[#0B1B3A]">Alignment Results</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">No biological result is shown until a real query completes against published references.</p>
        </div>
        {state.type === 'error' ? (
          <div className="m-5 flex items-start gap-3 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle className="mt-0.5 shrink-0" size={19} />{state.message}</div>
        ) : result ? (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-3 text-xs font-bold text-slate-500">
              <span>{result.database.software}</span><span>{result.database.referenceCount} approved references</span><span>{result.database.totalBases.toLocaleString()} bases</span><span>Built {new Date(result.database.builtAt).toLocaleString()}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr><th className="px-4 py-3">Target</th><th className="px-4 py-3">Identity</th><th className="px-4 py-3">Length</th><th className="px-4 py-3">E-value</th><th className="px-4 py-3">Bit score</th><th className="px-4 py-3">Coordinates</th><th className="px-4 py-3">Record</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {result.hits.map((hit, index) => (
                    <tr key={`${hit.subjectId}-${index}`} className="hover:bg-slate-50"><td className="px-4 py-4"><p className="font-black italic text-[#0B1B3A]">{hit.organismName || 'N/A'}</p><p className="mt-1 font-mono text-[11px] text-slate-500">{hit.strainName || hit.subjectId}</p></td><td className="px-4 py-4 font-mono font-black">{hit.identityPercent.toFixed(2)}%</td><td className="px-4 py-4 font-mono">{hit.alignmentLength}</td><td className="px-4 py-4 font-mono">{hit.evalue}</td><td className="px-4 py-4 font-mono">{hit.bitScore}</td><td className="px-4 py-4 font-mono text-[11px]">Q {hit.queryStart}-{hit.queryEnd}<br />S {hit.subjectStart}-{hit.subjectEnd}</td><td className="px-4 py-4">{hit.organismId ? <Link href={`/organisms/${hit.organismId}/results`} className="inline-flex items-center gap-1 font-black text-orange-600 hover:text-orange-800">Open <ArrowUpRight size={13} /></Link> : 'N/A'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result.hits.length && <div className="px-5 py-16 text-center"><Dna className="mx-auto text-slate-300" size={38} /><p className="mt-3 text-sm font-bold text-slate-500">No statistically reported alignments matched the current search constraints.</p></div>}
            <p className="border-t border-slate-100 px-5 py-4 text-xs font-semibold leading-5 text-slate-500">{result.limitations}</p>
          </>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-center"><div><Search className="mx-auto text-slate-300" size={42} /><p className="mt-4 text-sm font-bold text-slate-500">Run a real nucleotide query to populate this table.</p></div></div>
        )}
      </section>
    </div>
  );
}

