'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Binary, CheckCircle2, Dna, ExternalLink, FileCode2, Home, LayoutDashboard, LoaderCircle, Microscope, ScanLine, Search, ShieldCheck, UploadCloud } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import BrandLogo from '../BrandLogo';
import BlastWorkspace from './BlastWorkspace';
import type { GenomeReferenceCatalog, GenomeReferenceStrain } from './types';
import { referenceByKind } from './types';

const JBrowseViewer = dynamic(() => import('./JBrowseViewer'), { ssr: false, loading: ViewerLoading });
const IgvViewer = dynamic(() => import('./IgvViewer'), { ssr: false, loading: ViewerLoading });
type ToolTab = 'jbrowse' | 'igv' | 'blast';

export default function GenomeWorkspace({ organismId }: { organismId: number }) {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const requestedStrain = Number(searchParams.get('strain'));
  const requestedTool = searchParams.get('tool');
  const [catalog, setCatalog] = useState<GenomeReferenceCatalog | null>(null);
  const [selectedStrainId, setSelectedStrainId] = useState(Number.isInteger(requestedStrain) ? requestedStrain : 0);
  const [tab, setTab] = useState<ToolTab>(requestedTool === 'igv' || requestedTool === 'blast' ? requestedTool : 'jbrowse');
  const [state, setState] = useState<{ type: 'loading' | 'idle' | 'error'; message: string }>({ type: 'loading', message: '' });

  const load = useCallback(async () => {
    setState({ type: 'loading', message: '' });
    try {
      const response = await fetch(apiPath(`/organisms/${organismId}/genome-references`), { cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as GenomeReferenceCatalog & { error?: string };
      if (!response.ok || !data.organism) throw new Error(data.error || 'Failed to load genome workspace');
      setCatalog(data);
      setSelectedStrainId((current) => {
        if (data.strains.some((strain) => strain.id === current)) return current;
        return data.strains.find((strain) => referenceByKind(strain, 'FASTA'))?.id || data.strains[0]?.id || 0;
      });
      setState({ type: 'idle', message: '' });
    } catch (error) {
      setState({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load genome workspace' });
    }
  }, [organismId]);

  useEffect(() => { void load(); }, [load]);
  const strain = useMemo(() => catalog?.strains.find((record) => record.id === selectedStrainId) || catalog?.strains[0] || null, [catalog, selectedStrainId]);
  const hasReference = Boolean(strain && referenceByKind(strain, 'FASTA') && referenceByKind(strain, 'FAI'));
  const latestReference = strain?.references.reduce<string | null>((latest, file) => !latest || file.updatedAt > latest ? file.updatedAt : latest, null);

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#0B1B3A]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5"><BrandLogo /><span className="hidden h-9 w-px bg-slate-200 sm:block" /><div><p className="text-[10px] font-black uppercase text-orange-600">Approved Genome Workspace</p><h1 className="mt-1 text-2xl font-black tracking-tight">{catalog?.organism.scientificName || 'Genome Toolset'}</h1></div></div>
          <nav aria-label="Genome workspace navigation" className="flex flex-wrap gap-2">
            <NavLink href="/" icon={Home} label="Home" />
            <NavLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavLink href={`/organisms/${organismId}/results`} icon={Microscope} label="MAYA Results" />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6 md:px-8">
        <section className="grid gap-px border border-slate-200 bg-slate-200 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="bg-[#0B1B3A] px-5 py-4 text-white"><p className="text-[10px] font-black uppercase text-orange-300">Reference context</p><p className="mt-1 text-lg font-black italic">{catalog?.organism.scientificName || 'N/A'} {strain?.strainName || ''}</p></div>
          <EvidenceCell icon={Dna} label="Evidence" value={strain?.evidenceBasis?.replaceAll('_', ' ') || 'N/A'} />
          <EvidenceCell icon={ShieldCheck} label="Reference freshness" value={latestReference ? new Date(latestReference).toLocaleString() : 'No published files'} />
        </section>

        {state.type === 'error' && <div className="flex items-center gap-3 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle size={19} />{state.message}</div>}
        <section className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="border border-slate-200 bg-white p-4">
              <label className="block text-[10px] font-black uppercase text-slate-500" htmlFor="genome-strain">Reference strain</label>
              <select id="genome-strain" value={strain?.id || ''} onChange={(event) => setSelectedStrainId(Number(event.target.value))} className="mt-2 h-11 w-full border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-orange-500">
                {catalog?.strains.map((record) => <option key={record.id} value={record.id}>{record.strainName}{referenceByKind(record, 'FASTA') ? '' : ' (no FASTA)'}</option>)}
              </select>
              {strain ? <dl className="mt-4 divide-y divide-slate-100 text-xs"><Meta label="Assembly" value={strain.assemblyAccession || 'N/A'} /><Meta label="BioSample" value={strain.biosampleAccession || 'N/A'} /><Meta label="Source" value={strain.sourceType || 'N/A'} /><Meta label="Location" value={[strain.city, strain.state, strain.country].filter(Boolean).join(', ') || 'N/A'} /><Meta label="Data source" value={strain.dataSource || 'N/A'} /></dl> : <p className="mt-4 text-sm font-semibold text-slate-500">No strain records available.</p>}
            </section>
            <ReferenceFiles strain={strain} />
            {session?.user?.role === 'ADMIN' && strain && <AdminReferenceUpload strain={strain} onUploaded={load} />}
          </aside>

          <section className="min-w-0">
            <div className="grid grid-cols-3 border border-slate-200 bg-white p-1" role="tablist" aria-label="Genome tools">
              <ToolButton active={tab === 'jbrowse'} icon={Binary} label="JBrowse 2" onClick={() => setTab('jbrowse')} />
              <ToolButton active={tab === 'igv'} icon={ScanLine} label="IGV.js" onClick={() => setTab('igv')} />
              <ToolButton active={tab === 'blast'} icon={Search} label="BLAST" onClick={() => setTab('blast')} />
            </div>
            <div className="mt-3">
              {tab === 'blast' && strain ? <BlastWorkspace strain={strain} /> : !hasReference ? <ReferenceEmptyState isAdmin={session?.user?.role === 'ADMIN'} /> : strain && catalog ? tab === 'jbrowse' ? <JBrowseViewer key={`jbrowse-${strain.id}`} strain={strain} organismName={catalog.organism.scientificName} /> : <IgvViewer key={`igv-${strain.id}`} strain={strain} organismName={catalog.organism.scientificName} /> : <ViewerLoading />}
            </div>
          </section>
        </section>

        <section className="grid gap-4 border border-slate-200 bg-white p-5 md:grid-cols-3">
          <Statement title="Evidence boundary" body="Genome viewers and BLAST display sequence-derived, genotypic evidence. They do not substitute for phenotypic testing or clinical interpretation." />
          <Statement title="Data provenance" body={strain?.dataSource || 'No data-source statement is available for this strain.'} />
          <Statement title="Use limitations" body={strain?.dataUseLimitations || 'No additional data-use limitation has been supplied. Check the FAIR record and source accessions before reuse.'} />
        </section>
      </div>
    </main>
  );
}

function ViewerLoading() { return <div className="flex min-h-[520px] items-center justify-center border border-slate-200 bg-white"><LoaderCircle className="mr-3 animate-spin text-orange-500" size={20} /><span className="text-xs font-black uppercase text-slate-500">Initializing genome viewer</span></div>; }
function NavLink({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) { return <Link href={href} className="inline-flex h-10 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-orange-400 hover:text-orange-700"><Icon size={15} />{label}</Link>; }
function EvidenceCell({ icon: Icon, label, value }: { icon: typeof Dna; label: string; value: string }) { return <div className="flex min-w-[220px] items-center gap-3 bg-white px-5 py-4"><Icon className="text-teal-700" size={20} /><div><p className="text-[9px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-xs font-black text-slate-700">{value}</p></div></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3 py-3"><dt className="font-black uppercase text-slate-400">{label}</dt><dd className="break-words text-right font-semibold text-slate-700">{value}</dd></div>; }
function ToolButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Dna; label: string; onClick: () => void }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex h-12 items-center justify-center gap-2 px-3 text-xs font-black transition ${active ? 'bg-[#0B1B3A] text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-orange-700'}`}><Icon size={17} />{label}</button>; }
function Statement({ title, body }: { title: string; body: string }) { return <div><p className="text-[10px] font-black uppercase text-orange-600">{title}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></div>; }

function ReferenceFiles({ strain }: { strain: GenomeReferenceStrain | null }) {
  return <section className="border border-slate-200 bg-white p-4"><h2 className="flex items-center gap-2 text-sm font-black"><FileCode2 className="text-orange-600" size={17} />Published Files</h2><div className="mt-3 space-y-2">{strain?.references.length ? strain.references.map((file) => <a key={file.id} href={apiPath(file.accessUrl)} className="flex items-center justify-between gap-3 border border-slate-100 bg-slate-50 px-3 py-3 text-xs transition hover:border-orange-300"><span className="min-w-0"><span className="block font-black">{file.kind}</span><span className="block truncate font-semibold text-slate-500">{file.fileName}</span></span><ExternalLink className="shrink-0 text-slate-400" size={15} /></a>) : <p className="border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-500">No approved FASTA or GFF3 files.</p>}</div></section>;
}

function ReferenceEmptyState({ isAdmin }: { isAdmin: boolean }) { return <div className="flex min-h-[520px] items-center justify-center border border-slate-200 bg-white p-8 text-center"><div className="max-w-md"><FileCode2 className="mx-auto text-slate-300" size={44} /><h2 className="mt-4 text-xl font-black">No Published Reference</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">JBrowse 2 and IGV.js become available after an approved FASTA is published with its generated FAI index. A matching GFF3 adds the annotation track.</p>{isAdmin && <p className="mt-4 text-xs font-black uppercase text-orange-600">Use the reference manager beside this panel.</p>}</div></div>; }

function AdminReferenceUpload({ strain, onUploaded }: { strain: GenomeReferenceStrain; onUploaded: () => Promise<void> }) {
  const { data: session } = useSession();
  const [kind, setKind] = useState<'FASTA' | 'GFF3'>('FASTA');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const upload = async () => {
    if (!file || !session?.user?.accessToken) return;
    setLoading(true); setMessage('');
    try {
      const response = await fetch(apiPath(`/admin/strains/${strain.id}/genome-references`), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.user.accessToken}` }, body: JSON.stringify({ kind, fileName: file.name, fileContent: await file.text() }) });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      setFile(null); setMessage(data.message || 'Reference published'); await onUploaded();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); } finally { setLoading(false); }
  };
  return <section className="border border-orange-200 bg-orange-50 p-4"><p className="text-[10px] font-black uppercase text-orange-700">Admin Reference Manager</p><div className="mt-3 grid grid-cols-2 border border-orange-200 bg-white p-1"><button type="button" onClick={() => { setKind('FASTA'); setFile(null); }} className={`px-2 py-2 text-xs font-black ${kind === 'FASTA' ? 'bg-orange-500 text-white' : 'text-slate-600'}`}>FASTA</button><button type="button" onClick={() => { setKind('GFF3'); setFile(null); }} className={`px-2 py-2 text-xs font-black ${kind === 'GFF3' ? 'bg-orange-500 text-white' : 'text-slate-600'}`}>GFF3</button></div><label className="mt-3 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-orange-300 bg-white px-3 py-3 text-xs font-black text-orange-800"><UploadCloud size={15} />{file ? file.name : `Choose ${kind}`}<input type="file" className="sr-only" accept={kind === 'FASTA' ? '.fa,.fna,.fasta' : '.gff,.gff3'} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="button" disabled={!file || loading} onClick={upload} className="mt-3 flex h-10 w-full items-center justify-center gap-2 bg-[#0B1B3A] text-xs font-black uppercase text-white disabled:opacity-50">{loading ? <LoaderCircle className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}Validate & Publish</button>{message && <p className="mt-3 text-xs font-bold leading-5 text-slate-700">{message}</p>}</section>;
}
