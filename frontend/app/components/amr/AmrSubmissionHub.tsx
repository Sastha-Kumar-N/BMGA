'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileJson2,
  FileText,
  LoaderCircle,
  Save,
  Send,
  Upload,
} from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type Notice = { type: 'success' | 'error'; text: string } | null;
type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
type FindingRow = {
  id: string; title: string; keyFinding: string; scientificSummary?: string; sourceReference?: string;
  curationStatus: SubmissionStatus; updatedAt: string; submittedAt?: string | null; publishedAt?: string | null;
  evidenceLevel?: string; publicHealthImportance?: string; importanceReason?: string | null; resistanceEvidence?: string;
  mdrStatus?: boolean | null; xdrStatus?: boolean | null; pdrStatus?: boolean | null; oneHealth?: boolean; hasGenomicData?: boolean; openAccess?: boolean;
  studyDesign?: string | null; sequencingPlatform?: string | null; analysisMethod?: string | null; publicationYear?: number | null; submissionDeclaration?: string;
  domains?: Array<{ term: { label: string } }>;
  pathogens?: Array<{ pathogen: { scientificName: string } }>;
  genes?: Array<{ gene: { symbol: string } }>;
  antimicrobials?: Array<{ antimicrobial: { name: string; drugClass?: { name: string } | null } }>;
  mechanisms?: Array<{ mechanism: { name: string } }>;
  locations?: Array<{ state?: string | null; district?: string | null; city?: string | null }>;
  institutions?: Array<{ name: string }>;
  moderationNotes?: Array<{ id: string; message: string; createdAt: string; author?: { name: string } }>;
};
type PublicationRow = {
  id: string; title: string; authors?: string | null; userRoleInPublication?: string | null; journal?: string | null;
  publicationYear?: number | null; doi?: string | null; pubmedId?: string | null; pmcId?: string | null; europePmcId?: string | null;
  externalUrl?: string | null; citationText?: string | null; openAccess?: boolean; submissionDeclaration?: string;
  curationStatus: SubmissionStatus; updatedAt: string; submittedAt?: string | null; publishedAt?: string | null;
  moderationNotes?: Array<{ id: string; message: string; createdAt: string; author?: { name: string } }>;
};
type Workspace = { findings: FindingRow[]; publications: PublicationRow[]; notifications: Array<{ id: string; title: string; body: string; createdAt: string; readAt?: string | null; link?: string | null }> };

const steps = ['Basic information', 'Scientific classification', 'Organism and AMR', 'Geography and study', 'Review and submit'];
const blankFinding = {
  title: '', keyFinding: '', scientificSummary: '', sourceReference: '', domains: '', evidenceLevel: 'LEVEL_1',
  publicHealthImportance: 'MODERATE', importanceReason: '', resistanceEvidence: 'NOT_REPORTED', pathogens: '', genes: '',
  antimicrobialClasses: '', antimicrobials: '', mechanisms: '', mdrStatus: false, xdrStatus: false, pdrStatus: false,
  state: '', district: '', city: '', institution: '', studyDesign: '', sequencingPlatform: '', analysisMethod: '',
  publicationYear: '', doi: '', pubmedId: '', externalUrl: '', oneHealth: false, hasGenomicData: false, openAccess: false,
  submissionDeclaration: 'AUTHOR',
};
const blankPublication = {
  title: '', authors: '', userRoleInPublication: '', journal: '', publicationYear: '', doi: '', pubmedId: '', pmcId: '',
  europePmcId: '', externalUrl: '', citationText: '', openAccess: false, submissionDeclaration: 'AUTHOR',
};
const joinValues = <T,>(rows: T[] | undefined, read: (row: T) => string | null | undefined) => (rows || []).map(read).filter((value): value is string => Boolean(value)).join('; ');

export default function AmrSubmissionHub({ initialFindingId, initialPublicationId }: { initialFindingId?: string; initialPublicationId?: string }) {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<'finding' | 'json' | 'publication'>(initialPublicationId ? 'publication' : 'finding');
  const [step, setStep] = useState(0);
  const [findingId, setFindingId] = useState(initialFindingId || '');
  const [finding, setFinding] = useState(blankFinding);
  const [publicationId, setPublicationId] = useState(initialPublicationId || '');
  const [publication, setPublication] = useState(blankPublication);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonSubmit, setJsonSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${session?.user?.accessToken || ''}` }), [session?.user?.accessToken]);
  const setField = <K extends keyof typeof blankFinding>(key: K, value: (typeof blankFinding)[K]) => setFinding((current) => ({ ...current, [key]: value }));
  const setPublicationField = <K extends keyof typeof blankPublication>(key: K, value: (typeof blankPublication)[K]) => setPublication((current) => ({ ...current, [key]: value }));

  const findingPayload = useCallback(() => ({
    ...finding,
    publicationYear: finding.publicationYear || undefined,
    institutions: finding.institution || undefined,
    locations: finding.state || finding.district || finding.city ? [{ country: 'India', state: finding.state || undefined, district: finding.district || undefined, city: finding.city || undefined }] : [],
    publication: finding.doi || finding.pubmedId || finding.externalUrl ? { doi: finding.doi || undefined, pubmedId: finding.pubmedId || undefined, externalUrl: finding.externalUrl || undefined, publicationYear: finding.publicationYear || undefined } : undefined,
  }), [finding]);

  useEffect(() => {
    if (!initialFindingId || !session?.user?.accessToken) return;
    let active = true;
    const loadDraft = async () => {
      try {
        const response = await fetch(apiPath('/me/amr-submissions'), { headers, cache: 'no-store' });
        const workspace = await response.json().catch(() => ({})) as Workspace & { error?: string };
        if (!response.ok) throw new Error(workspace.error || 'Unable to load AMR finding draft');
        const record = workspace.findings.find((entry) => entry.id === initialFindingId);
        if (!record || !active) return;
        const location = record.locations?.[0];
        setFindingId(record.id);
        setFinding({
          ...blankFinding,
          title: record.title || '',
          keyFinding: record.keyFinding || '',
          scientificSummary: record.scientificSummary || '',
          sourceReference: record.sourceReference || '',
          domains: joinValues(record.domains, (entry) => entry.term.label),
          evidenceLevel: record.evidenceLevel || blankFinding.evidenceLevel,
          publicHealthImportance: record.publicHealthImportance || blankFinding.publicHealthImportance,
          importanceReason: record.importanceReason || '',
          resistanceEvidence: record.resistanceEvidence || blankFinding.resistanceEvidence,
          pathogens: joinValues(record.pathogens, (entry) => entry.pathogen.scientificName),
          genes: joinValues(record.genes, (entry) => entry.gene.symbol),
          antimicrobials: joinValues(record.antimicrobials, (entry) => entry.antimicrobial.drugClass?.name ? `${entry.antimicrobial.name}::${entry.antimicrobial.drugClass.name}` : entry.antimicrobial.name),
          antimicrobialClasses: joinValues(record.antimicrobials, (entry) => entry.antimicrobial.drugClass?.name),
          mechanisms: joinValues(record.mechanisms, (entry) => entry.mechanism.name),
          mdrStatus: Boolean(record.mdrStatus),
          xdrStatus: Boolean(record.xdrStatus),
          pdrStatus: Boolean(record.pdrStatus),
          state: location?.state || '',
          district: location?.district || '',
          city: location?.city || '',
          institution: joinValues(record.institutions, (entry) => entry.name),
          studyDesign: record.studyDesign || '',
          sequencingPlatform: record.sequencingPlatform || '',
          analysisMethod: record.analysisMethod || '',
          publicationYear: record.publicationYear ? String(record.publicationYear) : '',
          oneHealth: Boolean(record.oneHealth),
          hasGenomicData: Boolean(record.hasGenomicData),
          openAccess: Boolean(record.openAccess),
          submissionDeclaration: record.submissionDeclaration || blankFinding.submissionDeclaration,
        });
      } catch (error) {
        if (active) setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load AMR finding draft' });
      }
    };
    void loadDraft();
    return () => { active = false; };
  }, [headers, initialFindingId, session?.user?.accessToken]);

  useEffect(() => {
    if (!initialPublicationId || !session?.user?.accessToken) return;
    let active = true;
    const loadPublicationDraft = async () => {
      try {
        const response = await fetch(apiPath('/me/amr-submissions'), { headers, cache: 'no-store' });
        const workspace = await response.json().catch(() => ({})) as Workspace & { error?: string };
        if (!response.ok) throw new Error(workspace.error || 'Unable to load AMR publication draft');
        const record = workspace.publications.find((entry) => entry.id === initialPublicationId);
        if (!record || !active) return;
        setTab('publication');
        setPublicationId(record.id);
        setPublication({
          ...blankPublication,
          title: record.title || '',
          authors: record.authors || '',
          userRoleInPublication: record.userRoleInPublication || '',
          journal: record.journal || '',
          publicationYear: record.publicationYear ? String(record.publicationYear) : '',
          doi: record.doi || '',
          pubmedId: record.pubmedId || '',
          pmcId: record.pmcId || '',
          europePmcId: record.europePmcId || '',
          externalUrl: record.externalUrl || '',
          citationText: record.citationText || '',
          openAccess: Boolean(record.openAccess),
          submissionDeclaration: record.submissionDeclaration || blankPublication.submissionDeclaration,
        });
      } catch (error) {
        if (active) setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to load AMR publication draft' });
      }
    };
    void loadPublicationDraft();
    return () => { active = false; };
  }, [headers, initialPublicationId, session?.user?.accessToken]);

  const request = async <T,>(url: string, init: RequestInit) => {
    const response = await fetch(apiPath(url), { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  };

  const saveFinding = async (submit = false) => {
    if (!finding.title.trim()) { setNotice({ type: 'error', text: 'Enter a working title before saving a draft.' }); return; }
    setBusy(true); setNotice(null);
    try {
      const body = findingPayload();
      const saved = findingId
        ? await request<FindingRow>(`/amr-submissions/findings/${findingId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await request<FindingRow>('/amr-submissions/findings', { method: 'POST', body: JSON.stringify(body) });
      setFindingId(saved.id);
      if (submit) {
        await request<FindingRow>(`/amr-submissions/findings/${saved.id}/submit`, { method: 'POST', body: '{}' });
        setNotice({ type: 'success', text: 'Your AMR finding was submitted for administrative review.' });
      } else {
        setNotice({ type: 'success', text: 'AMR finding draft saved.' });
      }
    } catch (error) {
      setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save AMR finding draft' });
    } finally { setBusy(false); }
  };

  const chooseJson = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json') || !['application/json', 'text/json', ''].includes(file.type)) { setNotice({ type: 'error', text: 'Choose a JSON file.' }); return; }
    if (file.size > 2 * 1024 * 1024) { setNotice({ type: 'error', text: 'JSON uploads must be 2 MB or smaller.' }); return; }
    setJsonFile(file); setNotice(null);
    try { setJsonText(await file.text()); } catch { setNotice({ type: 'error', text: 'The selected JSON file could not be read.' }); }
  };

  const importJson = async (validateOnly = false) => {
    if (!jsonText || !jsonFile) { setNotice({ type: 'error', text: 'Choose a JSON file first.' }); return; }
    setBusy(true); setNotice(null);
    try {
      if (validateOnly) {
        const result = await request<{ records: number }>('/amr-submissions/findings/json/validate', { method: 'POST', body: JSON.stringify({ jsonText }) });
        setNotice({ type: 'success', text: `JSON is valid: ${result.records} finding record(s) ready to import.` });
      } else {
        const result = await request<{ records: FindingRow[] }>('/amr-submissions/findings/json', { method: 'POST', body: JSON.stringify({ jsonText, filename: jsonFile.name, contentType: jsonFile.type || 'application/json', submit: jsonSubmit }) });
        setNotice({ type: 'success', text: `${result.records.length} AMR finding draft(s) ${jsonSubmit ? 'submitted for review' : 'imported as drafts'}.` });
        setJsonText(''); setJsonFile(null);
      }
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to import JSON' }); } finally { setBusy(false); }
  };

  const savePublication = async (submit = false) => {
    if (!publication.title.trim()) { setNotice({ type: 'error', text: 'Enter a publication title before saving a draft.' }); return; }
    setBusy(true); setNotice(null);
    try {
      const body = { ...publication, publicationYear: publication.publicationYear || undefined };
      const result = publicationId
        ? await request<{ publication: PublicationRow }>(`/amr-submissions/publications/${publicationId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await request<{ publication: PublicationRow }>('/amr-submissions/publications', { method: 'POST', body: JSON.stringify(body) });
      const saved = result.publication;
      setPublicationId(saved.id);
      if (submit) {
        await request<PublicationRow>(`/amr-submissions/publications/${saved.id}/submit`, { method: 'POST', body: '{}' });
        setNotice({ type: 'success', text: 'Your publication was submitted for administrative review.' });
      } else setNotice({ type: 'success', text: 'AMR publication draft saved.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save AMR publication draft' }); } finally { setBusy(false); }
  };

  if (status === 'loading') return <SubmissionShell><p className="text-sm font-black text-slate-500">Loading your account session...</p></SubmissionShell>;
  if (!session?.user?.accessToken) return <SubmissionShell><section className="border border-slate-200 bg-white p-8 text-center shadow-sm"><ClipboardCheck className="mx-auto text-teal-700" size={34} /><h1 className="mt-4 text-2xl font-black">Sign in to submit AMR evidence</h1><p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-6 text-slate-600">AMR findings and publications are private until an administrator completes scientific review and publishes them.</p><Link href="/login?callbackUrl=/submit-amr-finding" className="mt-6 inline-flex min-h-11 items-center gap-2 bg-[#0B1B3A] px-4 text-sm font-black text-white hover:bg-orange-500">Sign in <ArrowRight size={16} /></Link></section></SubmissionShell>;

  return <SubmissionShell>
    <header className="border border-[#0B1B3A] bg-[#07172f] p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-black uppercase tracking-[0.16em] text-orange-300">Contributor workspace</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Submit AMR findings and publications</h1><p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">Draft privately, submit when complete, and track administrative feedback. Gene detection alone is not clinical resistance unless the supporting evidence records it.</p></header>
    {notice && <div role="alert" className={`flex gap-3 border p-4 text-sm font-bold ${notice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{notice.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}{notice.text}</div>}
    <div role="tablist" aria-label="AMR submission methods" className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-3">{([{ id: 'finding', label: 'Manual finding', icon: FileText }, { id: 'json', label: 'JSON import', icon: FileJson2 }, { id: 'publication', label: 'Publication', icon: ClipboardCheck }] as const).map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex min-h-14 items-center justify-center gap-2 px-4 text-sm font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-500 ${tab === id ? 'bg-[#0B1B3A] text-white hover:bg-[#12274f]' : 'bg-white text-slate-800 hover:bg-slate-50'}`}><Icon size={17} /> {label}</button>)}</div>
    {tab === 'finding' && <section className="border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><ol className="grid gap-2 sm:grid-cols-5">{steps.map((label, index) => <li key={label} className={`flex min-h-10 items-center gap-2 px-3 text-xs font-black ${index === step ? 'bg-orange-50 text-orange-700' : index < step ? 'text-teal-700' : 'text-slate-400'}`}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${index === step ? 'bg-orange-500 text-white' : index < step ? 'bg-teal-100' : 'bg-slate-100'}`}>{index + 1}</span>{label}</li>)}</ol></div><div className="p-5 sm:p-7"><FindingStep step={step} finding={finding} setField={setField} /><div className="mt-8 flex flex-col-reverse justify-between gap-3 border-t border-slate-100 pt-5 sm:flex-row"><button type="button" disabled={busy || step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))} className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 px-4 text-xs font-black uppercase tracking-wider disabled:opacity-40"><ArrowLeft size={16} /> Back</button><div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void saveFinding(false)} className="inline-flex min-h-11 items-center justify-center gap-2 border border-teal-200 bg-teal-50 px-4 text-xs font-black uppercase tracking-wider text-teal-800 disabled:opacity-50"><Save size={16} /> Save draft</button>{step < steps.length - 1 ? <button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[#0B1B3A] px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500">Continue <ArrowRight size={16} /></button> : <button type="button" disabled={busy} onClick={() => void saveFinding(true)} className="inline-flex min-h-11 items-center justify-center gap-2 bg-orange-500 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} Submit for review</button>}</div></div></div></section>}
    {tab === 'json' && <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]"><div><p className="text-xs font-black uppercase tracking-widest text-orange-600">Structured submission</p><h2 className="mt-2 text-2xl font-black">Import AMR finding JSON</h2><p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Upload one finding object or a document containing a <code className="bg-slate-100 px-1">findings</code> array. Unsupported fields and invalid values are rejected before anything is saved.</p><label className="mt-6 flex min-h-36 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-slate-300 p-5 text-center hover:border-teal-500"><Upload className="text-teal-700" size={28} /><span className="mt-3 text-sm font-black">{jsonFile ? jsonFile.name : 'Choose a JSON file (max 2 MB)'}</span><span className="mt-1 text-xs font-semibold text-slate-500">No public record is created by this upload.</span><input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void chooseJson(event.target.files?.[0])} /></label><label className="mt-5 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={jsonSubmit} onChange={(event) => setJsonSubmit(event.target.checked)} /> Submit imported drafts for review immediately</label><div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy || !jsonFile} onClick={() => void importJson(true)} className="inline-flex min-h-11 items-center gap-2 border border-teal-200 bg-teal-50 px-4 text-xs font-black uppercase tracking-wider text-teal-800 disabled:opacity-50"><CheckCircle2 size={16} /> Validate JSON</button><button type="button" disabled={busy || !jsonFile} onClick={() => void importJson(false)} className="inline-flex min-h-11 items-center gap-2 bg-[#0B1B3A] px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-500 disabled:opacity-50"><FileJson2 size={16} /> Import</button></div></div><aside className="border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950"><h3 className="font-black">Before you upload</h3><ul className="mt-3 space-y-2"><li>Use the downloadable machine-readable schema for allowed fields.</li><li>Each record needs a working title.</li><li>Keep patient-identifying information out of all text fields.</li><li>Records remain private until administrative approval and publication.</li></ul><a href={apiPath('/amr-submissions/schema')} className="mt-5 inline-flex text-xs font-black uppercase tracking-wider text-teal-800 underline">JSON schema endpoint</a></aside></div></section>}
    {tab === 'publication' && <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="max-w-4xl"><p className="text-xs font-black uppercase tracking-widest text-orange-600">Separate publication submission</p><h2 className="mt-2 text-2xl font-black">Submit an AMR-related publication</h2><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">Publication records are reviewed separately and can later be linked to a curated AMR finding. Strong identifiers are checked for possible duplicates; the system never merges them automatically.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><FormField label="Publication title" required className="sm:col-span-2"><input required value={publication.title} onChange={(event) => setPublicationField('title', event.target.value)} className={inputClass} /></FormField><FormField label="Authors"><input value={publication.authors} onChange={(event) => setPublicationField('authors', event.target.value)} className={inputClass} /></FormField><FormField label="Your role"><input value={publication.userRoleInPublication} onChange={(event) => setPublicationField('userRoleInPublication', event.target.value)} placeholder="Author, curator, submitter" className={inputClass} /></FormField><FormField label="Journal"><input value={publication.journal} onChange={(event) => setPublicationField('journal', event.target.value)} className={inputClass} /></FormField><FormField label="Publication year"><input type="number" min="1800" max="2100" value={publication.publicationYear} onChange={(event) => setPublicationField('publicationYear', event.target.value)} className={inputClass} /></FormField><FormField label="DOI"><input value={publication.doi} onChange={(event) => setPublicationField('doi', event.target.value)} placeholder="10.1000/example" className={inputClass} /></FormField><FormField label="PubMed ID"><input value={publication.pubmedId} onChange={(event) => setPublicationField('pubmedId', event.target.value)} className={inputClass} /></FormField><FormField label="PMCID"><input value={publication.pmcId} onChange={(event) => setPublicationField('pmcId', event.target.value)} placeholder="PMC123456" className={inputClass} /></FormField><FormField label="Europe PMC ID"><input value={publication.europePmcId} onChange={(event) => setPublicationField('europePmcId', event.target.value)} className={inputClass} /></FormField><FormField label="Publication URL" className="sm:col-span-2"><input type="url" value={publication.externalUrl} onChange={(event) => setPublicationField('externalUrl', event.target.value)} placeholder="https://..." className={inputClass} /></FormField><FormField label="Submission declaration" className="sm:col-span-2"><select value={publication.submissionDeclaration} onChange={(event) => setPublicationField('submissionDeclaration', event.target.value)} className={inputClass}><option value="AUTHOR">I am an author of this study</option><option value="ON_BEHALF_OF_AUTHORS">I am submitting on behalf of the authors</option><option value="RELEVANT_PUBLICATION_SUGGESTION">I am suggesting a relevant publication</option></select></FormField></div><div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void savePublication(false)} className="inline-flex min-h-11 items-center gap-2 border border-teal-200 bg-teal-50 px-4 text-xs font-black uppercase tracking-wider text-teal-800 disabled:opacity-50"><Save size={16} /> Save draft</button><button type="button" disabled={busy} onClick={() => void savePublication(true)} className="inline-flex min-h-11 items-center gap-2 bg-orange-500 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} Submit for review</button></div></div></section>}
  </SubmissionShell>;
}

export function AmrSubmissionDashboard() {
  const { data: session, status } = useSession();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const headers = useMemo(() => ({ Authorization: `Bearer ${session?.user?.accessToken || ''}` }), [session?.user?.accessToken]);
  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    const response = await fetch(apiPath('/me/amr-submissions'), { headers, cache: 'no-store' });
    const body = await response.json().catch(() => ({})) as Workspace & { error?: string };
    if (!response.ok) throw new Error(body.error || 'Unable to load AMR submissions');
    setWorkspace(body);
  }, [headers, session?.user?.accessToken]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Unable to load AMR submissions'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (status === 'loading') return <SubmissionShell><p className="text-sm font-black text-slate-500">Loading your submissions...</p></SubmissionShell>;
  if (!session?.user?.accessToken) return <SubmissionShell><section className="border border-slate-200 bg-white p-8 text-center"><h1 className="text-2xl font-black">Sign in to view your AMR submissions</h1><Link href="/login?callbackUrl=/account/amr-submissions" className="mt-5 inline-flex bg-[#0B1B3A] px-4 py-3 text-sm font-black text-white">Sign in</Link></section></SubmissionShell>;
  return <SubmissionShell><header className="flex flex-col gap-4 border border-[#0B1B3A] bg-[#07172f] p-6 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-orange-300">Contributor workspace</p><h1 className="mt-2 text-3xl font-black">My AMR submissions</h1><p className="mt-2 text-sm font-semibold text-slate-300">Only you and authorized reviewers can see drafts, submission history, and feedback.</p></div><Link href="/submit-amr-finding" className="inline-flex min-h-11 items-center justify-center gap-2 bg-orange-500 px-4 text-xs font-black uppercase tracking-wider text-white hover:bg-orange-400"><Upload size={16} /> New submission</Link></header>{error && <div role="alert" className="flex gap-3 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle size={19} />{error}</div>}<section className="grid gap-6 xl:grid-cols-2"><SubmissionList title="AMR findings" empty="No AMR finding submissions yet." rows={workspace?.findings || []} kind="finding" /><SubmissionList title="AMR publications" empty="No AMR publication submissions yet." rows={workspace?.publications || []} kind="publication" /></section><section className="border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">Administrative feedback</h2></div><div className="divide-y divide-slate-100">{workspace?.notifications?.length ? workspace.notifications.map((notification) => <Link key={notification.id} href={notification.link || '/account/amr-submissions'} className="block p-5 hover:bg-slate-50"><p className="text-sm font-black">{notification.title}</p><p className="mt-1 text-sm font-semibold text-slate-600">{notification.body}</p><p className="mt-2 text-xs font-bold text-slate-400">{new Date(notification.createdAt).toLocaleString('en-IN')}</p></Link>) : <p className="p-10 text-center text-sm font-bold text-slate-500">No AMR feedback or notifications yet.</p>}</div></section></SubmissionShell>;
}

function FindingStep({ step, finding, setField }: { step: number; finding: typeof blankFinding; setField: <K extends keyof typeof blankFinding>(key: K, value: (typeof blankFinding)[K]) => void }) {
  if (step === 0) return <div className="grid gap-4"><FormField label="Finding title" required><input required value={finding.title} onChange={(event) => setField('title', event.target.value)} className={inputClass} /></FormField><FormField label="One-sentence key finding"><textarea rows={3} value={finding.keyFinding} onChange={(event) => setField('keyFinding', event.target.value)} className={inputClass} /></FormField><FormField label="Scientific summary"><textarea rows={7} value={finding.scientificSummary} onChange={(event) => setField('scientificSummary', event.target.value)} className={inputClass} /></FormField><FormField label="Publication or surveillance reference"><input value={finding.sourceReference} onChange={(event) => setField('sourceReference', event.target.value)} placeholder="Citation, surveillance programme, or dataset reference" className={inputClass} /></FormField></div>;
  if (step === 1) return <div className="grid gap-4 sm:grid-cols-2"><FormField label="AMR domain"><input value={finding.domains} onChange={(event) => setField('domains', event.target.value)} placeholder="Human Clinical; One Health" className={inputClass} /></FormField><FormField label="Evidence level"><select value={finding.evidenceLevel} onChange={(event) => setField('evidenceLevel', event.target.value)} className={inputClass}>{['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5'].map((value) => <option key={value}>{value.replace('_', ' ')}</option>)}</select></FormField><FormField label="Resistance evidence"><select value={finding.resistanceEvidence} onChange={(event) => setField('resistanceEvidence', event.target.value)} className={inputClass}>{['NOT_REPORTED', 'PHENOTYPIC', 'GENOTYPIC', 'EXPERIMENTAL', 'COMBINED'].map((value) => <option key={value}>{value.replace('_', ' ')}</option>)}</select></FormField><FormField label="Public-health importance"><select value={finding.publicHealthImportance} onChange={(event) => setField('publicHealthImportance', event.target.value)} className={inputClass}>{['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></FormField>{['HIGH', 'CRITICAL'].includes(finding.publicHealthImportance) && <FormField label="Importance justification" required className="sm:col-span-2"><textarea required rows={4} value={finding.importanceReason} onChange={(event) => setField('importanceReason', event.target.value)} className={inputClass} /></FormField>}</div>;
  if (step === 2) return <div className="grid gap-4 sm:grid-cols-2"><FormField label="Pathogen(s)"><input value={finding.pathogens} onChange={(event) => setField('pathogens', event.target.value)} placeholder="Escherichia coli; Klebsiella pneumoniae" className={inputClass} /></FormField><FormField label="Resistance gene(s)"><input value={finding.genes} onChange={(event) => setField('genes', event.target.value)} placeholder="blaNDM; mcr-1" className={inputClass} /></FormField><FormField label="Antimicrobial class(es)"><input value={finding.antimicrobialClasses} onChange={(event) => setField('antimicrobialClasses', event.target.value)} placeholder="Carbapenems; Colistin" className={inputClass} /></FormField><FormField label="Antimicrobial agent(s)"><input value={finding.antimicrobials} onChange={(event) => setField('antimicrobials', event.target.value)} className={inputClass} /></FormField><FormField label="Resistance mechanism(s)"><input value={finding.mechanisms} onChange={(event) => setField('mechanisms', event.target.value)} className={inputClass} /></FormField><FormField label="Sequencing platform"><input value={finding.sequencingPlatform} onChange={(event) => setField('sequencingPlatform', event.target.value)} className={inputClass} /></FormField><div className="sm:col-span-2 flex flex-wrap gap-5"><Check label="Reported MDR" checked={finding.mdrStatus} onChange={(checked) => setField('mdrStatus', checked)} /><Check label="Reported XDR" checked={finding.xdrStatus} onChange={(checked) => setField('xdrStatus', checked)} /><Check label="Reported PDR" checked={finding.pdrStatus} onChange={(checked) => setField('pdrStatus', checked)} /><Check label="Genomic data present" checked={finding.hasGenomicData} onChange={(checked) => setField('hasGenomicData', checked)} /></div></div>;
  if (step === 3) return <div className="grid gap-4 sm:grid-cols-2"><FormField label="State / UT"><input value={finding.state} onChange={(event) => setField('state', event.target.value)} className={inputClass} /></FormField><FormField label="District"><input value={finding.district} onChange={(event) => setField('district', event.target.value)} className={inputClass} /></FormField><FormField label="City"><input value={finding.city} onChange={(event) => setField('city', event.target.value)} className={inputClass} /></FormField><FormField label="Institution"><input value={finding.institution} onChange={(event) => setField('institution', event.target.value)} className={inputClass} /></FormField><FormField label="Study design"><input value={finding.studyDesign} onChange={(event) => setField('studyDesign', event.target.value)} className={inputClass} /></FormField><FormField label="Analysis method"><input value={finding.analysisMethod} onChange={(event) => setField('analysisMethod', event.target.value)} className={inputClass} /></FormField><FormField label="Publication year"><input type="number" min="1900" max="2100" value={finding.publicationYear} onChange={(event) => setField('publicationYear', event.target.value)} className={inputClass} /></FormField><FormField label="DOI"><input value={finding.doi} onChange={(event) => setField('doi', event.target.value)} placeholder="10.1000/example" className={inputClass} /></FormField><div className="sm:col-span-2 flex flex-wrap gap-5"><Check label="One Health study" checked={finding.oneHealth} onChange={(checked) => setField('oneHealth', checked)} /><Check label="Open-access source" checked={finding.openAccess} onChange={(checked) => setField('openAccess', checked)} /></div></div>;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-4"><h2 className="text-2xl font-black">Review before submission</h2><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Title" value={finding.title || 'Not provided'} /><Detail label="Evidence" value={`${finding.evidenceLevel.replace('_', ' ')} / ${finding.resistanceEvidence.replace('_', ' ')}`} /><Detail label="Pathogens" value={finding.pathogens || 'Not provided'} /><Detail label="Location" value={[finding.city, finding.state].filter(Boolean).join(', ') || 'Not provided'} /><Detail label="Source" value={finding.sourceReference || 'Not provided'} /><Detail label="Importance" value={finding.publicHealthImportance} /></dl></div><aside className="border border-amber-200 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-950"><p className="font-black">Contributor declaration</p><select value={finding.submissionDeclaration} onChange={(event) => setField('submissionDeclaration', event.target.value)} className="mt-3 min-h-11 w-full border border-amber-300 bg-white px-3 text-sm font-bold"><option value="AUTHOR">I am an author of this study</option><option value="ON_BEHALF_OF_AUTHORS">I am submitting on behalf of the authors</option><option value="RELEVANT_PUBLICATION_SUGGESTION">I am suggesting a relevant publication</option></select><p className="mt-4">Submitting for review does not publish the record. Administrative approval and publication are both required.</p></aside></div>;
}

function SubmissionList({ title, empty, rows, kind }: { title: string; empty: string; rows: Array<FindingRow | PublicationRow>; kind: 'finding' | 'publication' }) {
  return <section className="overflow-hidden border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="text-xl font-black">{title}</h2></div><div className="divide-y divide-slate-100">{rows.length ? rows.map((row) => <article key={row.id} className="p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="text-base font-black">{row.title}</h3>{'keyFinding' in row && <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-600">{row.keyFinding}</p>}<p className="mt-2 text-xs font-bold text-slate-400">Updated {new Date(row.updatedAt).toLocaleDateString('en-IN')}</p></div><StatusBadge status={row.curationStatus} /></div>{row.moderationNotes?.map((note) => <div key={note.id} className="mt-3 border-l-2 border-teal-500 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-950"><strong>{note.author?.name || 'Reviewer'}:</strong> {note.message}</div>)}{['DRAFT', 'CHANGES_REQUESTED'].includes(row.curationStatus) && <Link href={kind === 'finding' ? `/submit-amr-finding?finding=${row.id}` : `/submit-amr-finding?publication=${row.id}`} className="mt-4 inline-flex text-xs font-black uppercase tracking-wider text-teal-700 underline">Edit eligible draft</Link>}</article>) : <p className="p-12 text-center text-sm font-bold text-slate-500">{empty}</p>}</div></section>;
}

function SubmissionShell({ children }: { children: React.ReactNode }) { return <main className="min-h-screen bg-[#f6f8fb] px-4 py-7 text-[#0B1B3A] sm:px-6 lg:px-8"><div className="mx-auto max-w-[1280px] space-y-6">{children}</div></main>; }
function FormField({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">{label}{required ? ' *' : ''}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="border border-slate-200 p-3"><dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt><dd className="mt-1 break-words font-bold text-slate-700">{value}</dd></div>; }
function StatusBadge({ status }: { status: SubmissionStatus }) { const styles: Record<SubmissionStatus, string> = { DRAFT: 'bg-slate-100 text-slate-600', SUBMITTED: 'bg-amber-100 text-amber-800', UNDER_REVIEW: 'bg-blue-100 text-blue-800', CHANGES_REQUESTED: 'bg-orange-100 text-orange-800', APPROVED: 'bg-emerald-100 text-emerald-800', PUBLISHED: 'bg-teal-100 text-teal-800', REJECTED: 'bg-red-100 text-red-800', ARCHIVED: 'bg-slate-200 text-slate-700' }; return <span className={`inline-flex shrink-0 px-2 py-1 text-[10px] font-black uppercase tracking-wider ${styles[status]}`}>{status.replace(/_/g, ' ')}</span>; }

const inputClass = 'min-h-11 w-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100';
