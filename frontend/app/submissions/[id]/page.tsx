'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Dna, Edit3, FileUp, Home, LayoutDashboard, Lock, Save, UserRound } from 'lucide-react';
import { apiPath } from '../../lib/api-client';
import { BRAND_FULL_NAME } from '../../lib/brand';
import BrandLogo from '../../components/BrandLogo';
import {
  ReviewerNotesPanel,
  SubmissionFilesPanel,
  SubmissionStatusBadge,
  SubmissionTimeline,
  type SubmissionFile,
  type SubmissionHistoryEntry,
  type SubmissionReviewerNote,
  type SubmissionStatus,
} from '../../components/submissions/SubmissionPanels';

type Person = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  affiliation?: string | null;
};

type Submission = {
  id: string;
  title: string;
  submissionType: string;
  status: SubmissionStatus;
  scientificName: string;
  displayName?: string | null;
  taxonomyId?: number | null;
  domain?: string | null;
  phylum?: string | null;
  className?: string | null;
  orderName?: string | null;
  family?: string | null;
  genus?: string | null;
  species?: string | null;
  strainName: string;
  isolateName?: string | null;
  strainCode?: string | null;
  biosampleAccession?: string | null;
  bioprojectAccession?: string | null;
  assemblyAccession?: string | null;
  sourceType?: string | null;
  host?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  collectionDate?: string | null;
  locationText?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  genomeStatus?: string | null;
  genomeSize?: number | null;
  gcContent?: string | number | null;
  repoLink?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  files: SubmissionFile[];
  genomeReferences?: SubmissionFile[];
  statusHistory: SubmissionHistoryEntry[];
  reviewerNotes: SubmissionReviewerNote[];
  createdAt: string;
  updatedAt: string;
  submittedBy?: Person | null;
  reviewedBy?: Person | null;
};

type SubmissionDraft = {
  scientificName: string;
  displayName: string;
  taxonomyId: string;
  domain: string;
  phylum: string;
  className: string;
  orderName: string;
  family: string;
  genus: string;
  species: string;
  description: string;
  strainName: string;
  isolateName: string;
  strainCode: string;
  sourceType: string;
  host: string;
  country: string;
  state: string;
  city: string;
  collectionDate: string;
  locationText: string;
  latitude: string;
  longitude: string;
  biosampleAccession: string;
  bioprojectAccession: string;
  assemblyAccession: string;
  genomeStatus: string;
  genomeSize: string;
  gcContent: string;
  repoLink: string;
  metadata: string;
  surveillanceScope: string;
  evidenceBasis: string;
  submittingInstitution: string;
  dataSource: string;
  dataUseLimitations: string;
  lastVerifiedAt: string;
};

const EMPTY_DRAFT: SubmissionDraft = {
  scientificName: '',
  displayName: '',
  taxonomyId: '',
  domain: '',
  phylum: '',
  className: '',
  orderName: '',
  family: '',
  genus: '',
  species: '',
  description: '',
  strainName: '',
  isolateName: '',
  strainCode: '',
  sourceType: '',
  host: '',
  country: '',
  state: '',
  city: '',
  collectionDate: '',
  locationText: '',
  latitude: '',
  longitude: '',
  biosampleAccession: '',
  bioprojectAccession: '',
  assemblyAccession: '',
  genomeStatus: '',
  genomeSize: '',
  gcContent: '',
  repoLink: '',
  metadata: '{}',
  surveillanceScope: '',
  evidenceBasis: '',
  submittingInstitution: '',
  dataSource: '',
  dataUseLimitations: '',
  lastVerifiedAt: '',
};

const MAYA_TOOLS = [
  'abricate', 'antismash', 'barrnap', 'busco', 'checkm', 'diamond', 'fastp', 'fastqc',
  'fastqc_trimmed', 'hmmer', 'islandpath', 'jellyfish', 'kofam', 'minced', 'mlst', 'multiqc',
  'prokka', 'quast', 'rnlst', 'spades', 'trf', 'trnascan', 'custom',
];
const RESULT_FILE_PATTERN = /\.(tsv|csv|json|txt|html?|dat|fasta|fa|fna)$/i;
const MAX_RESULT_FILE_BYTES = 10 * 1024 * 1024;

export default function UserSubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });
  const [draft, setDraft] = useState<SubmissionDraft>(EMPTY_DRAFT);
  const [editState, setEditState] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });
  const [checkpointState, setCheckpointState] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const isEditable = Boolean(submission && (submission.status === 'PENDING' || submission.status === 'NEEDS_CHANGES'));
  const canAmendApproved = ['CONTRIBUTOR', 'MODERATOR', 'ADMIN'].includes(session?.user?.role || '');
  const canManageResultCheckpoints = Boolean(submission && (isEditable || (submission.status === 'APPROVED' && canAmendApproved)));

  const load = useCallback(async () => {
    if (!session?.user?.accessToken || !params.id) return;
    setMessage({ type: 'loading', text: 'Loading submission details...' });
    try {
      const response = await fetch(apiPath(`/submissions/${params.id}`), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { submission?: Submission; error?: string };
      if (!response.ok || !data.submission) throw new Error(data.error || 'Failed to load submission');
      setSubmission(data.submission);
      setDraft(submissionToDraft(data.submission));
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load submission' });
    }
  }, [headers, params.id, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (submission) {
      setDraft(submissionToDraft(submission));
    }
  }, [submission]);

  const saveEdits = async () => {
    if (!session?.user?.accessToken || !submission || !isEditable) return;
    setEditState({ type: 'loading', text: 'Saving submission updates...' });
    try {
      const response = await fetch(apiPath(`/submissions/${submission.id}`), {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draftToPayload(draft)),
      });
      const data = await response.json().catch(() => ({})) as { submission?: Submission; error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to save submission updates');
      setEditState({ type: 'success', text: data.message || 'Submission updated and returned to the review queue.' });
      await load();
    } catch (error) {
      setEditState({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save submission updates' });
    }
  };

  if (status === 'loading') {
    return <Shell><p className="text-sm font-black uppercase tracking-widest text-orange-500">Checking account session...</p></Shell>;
  }

  if (!session) {
    return (
      <Shell>
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Lock className="mx-auto text-orange-500" size={42} />
          <h1 className="mt-4 text-3xl font-black tracking-tight">Sign In Required</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">Submission details are private to the submitting account and BMGA administrators.</p>
          <button onClick={() => signIn()} className="mt-6 rounded-xl bg-[#0B1B3A] px-5 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500">
            Sign In
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/account" className="text-xs font-black uppercase tracking-widest text-orange-300">My Submissions</Link>
            <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
              <Dna className="text-orange-400" size={36} /> Submission Detail
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
              Track your organism submission status, reviewer feedback, metadata, and attached file metadata.
            </p>
          </div>
          {submission && <SubmissionStatusBadge status={submission.status} />}
        </div>
      </header>

      {message.type !== 'idle' && (
        <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          {message.text}
        </div>
      )}

      {submission ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="border-b border-slate-100 pb-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">{submission.submissionType}</p>
                <h2 className="mt-2 text-3xl font-black italic tracking-tight">{submission.scientificName}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">Submission ID: <span className="font-mono">{submission.id}</span></p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Info label="Submission Title" value={submission.title} />
                <Info label="Current Status" value={formatStatus(submission.status)} />
                <Info label="Organism Name" value={submission.scientificName} />
                <Info label="Strain / Isolate" value={submission.strainName || submission.isolateName || 'N/A'} />
                <Info label="Submitted Date" value={new Date(submission.createdAt).toLocaleString()} />
                <Info label="Last Updated" value={new Date(submission.updatedAt).toLocaleString()} />
                <Info label="Uploaded By" value={submission.submittedBy?.name || 'N/A'} />
                <Info label="Uploader Email" value={submission.submittedBy?.email || 'N/A'} />
                <Info label="Organization / Institution" value={submission.submittedBy?.affiliation || 'N/A'} />
                <Info label="Submission Type" value={submission.submissionType} />
              </div>
            </section>

            {isEditable && (
              <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-6 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-orange-100 pb-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">Submitter edits</p>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-[#0B1B3A]">Update submission and resubmit</h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Edit the fields below, save your changes, and the submission returns to the review queue.</p>
                  </div>
                  <button type="button" onClick={saveEdits} disabled={editState.type === 'loading'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500 disabled:opacity-50">
                    <Save size={15} /> {editState.type === 'loading' ? 'Saving...' : 'Save changes'}
                  </button>
                </div>

                {editState.type !== 'idle' && (
                  <div className={`mt-4 flex items-center gap-3 rounded-xl p-4 text-sm font-bold ${editState.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    {editState.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
                    {editState.text}
                  </div>
                )}

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <EditField label="Scientific Name" value={draft.scientificName} onChange={(value) => setDraft({ ...draft, scientificName: value })} required />
                  <EditField label="Display Name" value={draft.displayName} onChange={(value) => setDraft({ ...draft, displayName: value })} />
                  <EditField label="Strain Name" value={draft.strainName} onChange={(value) => setDraft({ ...draft, strainName: value })} required />
                  <EditField label="Isolate Name" value={draft.isolateName} onChange={(value) => setDraft({ ...draft, isolateName: value })} />
                  <EditField label="Taxonomy ID" value={draft.taxonomyId} onChange={(value) => setDraft({ ...draft, taxonomyId: value })} />
                  <EditField label="Domain" value={draft.domain} onChange={(value) => setDraft({ ...draft, domain: value })} />
                  <EditField label="Phylum" value={draft.phylum} onChange={(value) => setDraft({ ...draft, phylum: value })} />
                  <EditField label="Class" value={draft.className} onChange={(value) => setDraft({ ...draft, className: value })} />
                  <EditField label="Order" value={draft.orderName} onChange={(value) => setDraft({ ...draft, orderName: value })} />
                  <EditField label="Family" value={draft.family} onChange={(value) => setDraft({ ...draft, family: value })} />
                  <EditField label="Genus" value={draft.genus} onChange={(value) => setDraft({ ...draft, genus: value })} />
                  <EditField label="Species" value={draft.species} onChange={(value) => setDraft({ ...draft, species: value })} />
                  <EditField label="Source" value={draft.sourceType} onChange={(value) => setDraft({ ...draft, sourceType: value })} />
                  <EditField label="Host / Isolation Source" value={draft.host} onChange={(value) => setDraft({ ...draft, host: value })} />
                  <EditField label="Country" value={draft.country} onChange={(value) => setDraft({ ...draft, country: value })} />
                  <EditField label="State" value={draft.state} onChange={(value) => setDraft({ ...draft, state: value })} />
                  <EditField label="City" value={draft.city} onChange={(value) => setDraft({ ...draft, city: value })} />
                  <EditField label="Collection Date" type="date" value={draft.collectionDate} onChange={(value) => setDraft({ ...draft, collectionDate: value })} />
                  <EditField label="Location Text" value={draft.locationText} onChange={(value) => setDraft({ ...draft, locationText: value })} />
                  <EditField label="Latitude" value={draft.latitude} onChange={(value) => setDraft({ ...draft, latitude: value })} />
                  <EditField label="Longitude" value={draft.longitude} onChange={(value) => setDraft({ ...draft, longitude: value })} />
                  <EditField label="Genome Size (bp)" type="number" min={1} step={1} value={draft.genomeSize} onChange={(value) => setDraft({ ...draft, genomeSize: value })} />
                  <EditField label="GC Content (%)" type="number" min={0} max={100} step="0.01" value={draft.gcContent} onChange={(value) => setDraft({ ...draft, gcContent: value })} />
                  <EditField label="Genome Status" value={draft.genomeStatus} onChange={(value) => setDraft({ ...draft, genomeStatus: value })} />
                  <EditField label="BioSample Accession" value={draft.biosampleAccession} onChange={(value) => setDraft({ ...draft, biosampleAccession: value })} />
                  <EditField label="BioProject Accession" value={draft.bioprojectAccession} onChange={(value) => setDraft({ ...draft, bioprojectAccession: value })} />
                  <EditField label="Assembly Accession" value={draft.assemblyAccession} onChange={(value) => setDraft({ ...draft, assemblyAccession: value })} />
                  <EditField label="Repository Link" value={draft.repoLink} onChange={(value) => setDraft({ ...draft, repoLink: value })} />
                  <EditField label="Submitting Institution" value={draft.submittingInstitution} onChange={(value) => setDraft({ ...draft, submittingInstitution: value })} />
                  <EditField label="Data Source" value={draft.dataSource} onChange={(value) => setDraft({ ...draft, dataSource: value })} />
                  <EditField label="Last Verified" type="date" value={draft.lastVerifiedAt} onChange={(value) => setDraft({ ...draft, lastVerifiedAt: value })} />
                </div>
                <EditArea label="Description / Notes" value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} />
                <EditArea label="Data Use Limitations" value={draft.dataUseLimitations} onChange={(value) => setDraft({ ...draft, dataUseLimitations: value })} />
                <EditArea label="Metadata JSON" value={draft.metadata} onChange={(value) => setDraft({ ...draft, metadata: value })} rows={6} monospace />
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-black tracking-tight">Metadata</h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Info label="Taxonomy ID" value={submission.taxonomyId ? String(submission.taxonomyId) : 'N/A'} />
                <Info label="Domain" value={submission.domain || 'N/A'} />
                <Info label="Phylum" value={submission.phylum || 'N/A'} />
                <Info label="Class" value={submission.className || 'N/A'} />
                <Info label="Order" value={submission.orderName || 'N/A'} />
                <Info label="Family" value={submission.family || 'N/A'} />
                <Info label="Genus" value={submission.genus || 'N/A'} />
                <Info label="Species" value={submission.species || 'N/A'} />
                <Info label="Source" value={submission.sourceType || 'N/A'} />
                <Info label="Isolation Source" value={submission.host || 'N/A'} />
                <Info label="Collection Location" value={[submission.city, submission.state, submission.country].filter(Boolean).join(', ') || submission.locationText || 'N/A'} />
                <Info label="Latitude / Longitude" value={submission.latitude !== null && submission.latitude !== undefined && submission.longitude !== null && submission.longitude !== undefined ? `${submission.latitude}, ${submission.longitude}` : 'N/A'} />
                <Info label="Collection Date" value={submission.collectionDate ? new Date(submission.collectionDate).toLocaleDateString() : 'N/A'} />
                <Info label="Sequencing Platform" value={metadataValue(submission.metadata, ['sequencingPlatform', 'platform'])} />
                <Info label="Assembly Method" value={metadataValue(submission.metadata, ['assemblyMethod', 'assembler'])} />
                <Info label="Annotation Pipeline" value={metadataValue(submission.metadata, ['annotationPipeline', 'pipeline'])} />
                <Info label="Assembly Accession" value={submission.assemblyAccession || 'N/A'} />
                <Info label="BioSample ID" value={submission.biosampleAccession || 'N/A'} />
                <Info label="Project ID" value={submission.bioprojectAccession || 'N/A'} />
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notes / Description</p>
                <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-7 text-slate-700">{submission.description || 'N/A'}</p>
              </div>
            </section>

            <SubmissionFilesPanel files={submission.files || []} />
            {canManageResultCheckpoints && (
              <ResultCheckpointPanel
                submission={submission}
                authorization={session?.user?.accessToken || ''}
                onSaved={load}
                state={checkpointState}
                setState={setCheckpointState}
              />
            )}
            <SubmissionFilesPanel files={submission.genomeReferences || []} title="Genome References" eyebrow="FASTA & Annotation" emptyMessage="No FASTA or GFF3 reference files are attached to this submission." />
          </section>

          <aside className="space-y-6">
            {isEditable && (
              <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-xl font-black tracking-tight"><Edit3 className="text-orange-500" size={20} /> Resubmission flow</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">After saving changes, the submission is sent back to the review queue and the previous review decision is cleared.</p>
              </section>
            )}
            <SubmissionTimeline history={submission.statusHistory || []} />
            <ReviewerNotesPanel notes={submission.reviewerNotes || []} />
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-xl font-black tracking-tight"><UserRound className="text-orange-500" size={20} /> Access</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                This user view only shows your own submission and reviewer feedback marked visible to the submitter.
              </p>
            </section>
          </aside>
        </div>
      ) : message.type !== 'loading' && (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
          No submission detail available.
        </div>
      )}
    </Shell>
  );
}

function ResultCheckpointPanel({
  submission,
  authorization,
  onSaved,
  state,
  setState,
}: {
  submission: Submission;
  authorization: string;
  onSaved: () => Promise<void>;
  state: { type: 'idle' | 'loading' | 'success' | 'error'; text: string };
  setState: React.Dispatch<React.SetStateAction<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>>;
}) {
  const [toolName, setToolName] = useState('abricate');
  const [customToolName, setCustomToolName] = useState('');
  const [toolVersion, setToolVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const effectiveToolName = toolName === 'custom' ? customToolName.trim() : toolName;
  const existingCheckpoint = submission.files.find((item) => item.toolName === effectiveToolName);

  const saveCheckpoint = async () => {
    if (!file) {
      setState({ type: 'error', text: 'Choose a MAYA result file before saving a checkpoint.' });
      return;
    }
    if (!RESULT_FILE_PATTERN.test(file.name)) {
      setState({ type: 'error', text: 'Use TSV, CSV, JSON, TXT, HTML, DAT, or FASTA result files.' });
      return;
    }
    if (file.size > MAX_RESULT_FILE_BYTES) {
      setState({ type: 'error', text: 'Each MAYA result checkpoint must be 10 MB or smaller.' });
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9 _.-]{1,79}$/.test(effectiveToolName)) {
      setState({ type: 'error', text: 'Enter a valid custom tool name.' });
      return;
    }

    setState({ type: 'loading', text: 'Saving secure tool checkpoint...' });
    try {
      const response = await fetch(apiPath(existingCheckpoint
        ? `/organism-uploads/${submission.id}/maya-files/${existingCheckpoint.id}`
        : `/organism-uploads/${submission.id}/maya-files`), {
        method: existingCheckpoint ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${authorization}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: effectiveToolName,
          toolVersion,
          fileName: file.name,
          fileContent: await file.text(),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to save tool checkpoint');
      setFile(null);
      setToolVersion('');
      setState({ type: 'success', text: data.message || 'Tool checkpoint saved for review.' });
      await onSaved();
    } catch (error) {
      setState({ type: 'error', text: error instanceof Error ? error.message : 'Failed to save tool checkpoint' });
    }
  };

  return (
    <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-teal-100 pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">Per-tool checkpoint</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-[#0B1B3A]">Add or replace a MAYA result</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Each saved tool file is a persistent checkpoint. Replacing a result keeps the currently published output unchanged until an administrator reviews the amendment.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-teal-700"><FileUp size={14} /> Private until approved</span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">MAYA Tool</span><select value={toolName} onChange={(event) => setToolName(event.target.value)} className="h-11 w-full rounded-xl border border-teal-100 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500">{MAYA_TOOLS.map((tool) => <option key={tool} value={tool}>{tool === 'custom' ? 'Custom tool…' : tool}</option>)}</select></label>
        {toolName === 'custom' && <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Custom Tool Name</span><input value={customToolName} onChange={(event) => setCustomToolName(event.target.value)} placeholder="e.g. plasmidfinder" className="h-11 w-full rounded-xl border border-teal-100 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500" /></label>}
        <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Tool Version</span><input value={toolVersion} onChange={(event) => setToolVersion(event.target.value)} placeholder="Optional" className="h-11 w-full rounded-xl border border-teal-100 bg-white px-3 text-sm font-bold outline-none focus:border-teal-500" /></label>
        <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Result File</span><input type="file" accept=".tsv,.csv,.json,.txt,.html,.htm,.dat,.fasta,.fa,.fna" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block h-11 w-full rounded-xl border border-teal-100 bg-white px-3 py-2 text-xs font-semibold file:mr-3 file:border-0 file:bg-teal-50 file:px-2 file:py-1 file:text-xs file:font-black" /></label>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'TSV, CSV, JSON, TXT, HTML, DAT, and FASTA · 10 MB maximum'}{existingCheckpoint ? ' · This will replace the saved checkpoint for the selected tool.' : ''}</p>
        <button type="button" onClick={() => void saveCheckpoint()} disabled={state.type === 'loading'} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-teal-800 disabled:opacity-50"><Save size={15} />{state.type === 'loading' ? 'Saving...' : existingCheckpoint ? 'Replace checkpoint' : 'Save checkpoint'}</button>
      </div>
      {state.type !== 'idle' && <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${state.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : state.type === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-teal-200 bg-white text-teal-800'}`}>{state.text}</div>}
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo size="sm" homeLink={false} />
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-[#0B1B3A]">{value || 'N/A'}</p>
    </div>
  );
}

function metadataValue(metadata: Submission['metadata'], keys: string[]) {
  if (!metadata) return 'N/A';
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return 'N/A';
}

function formatStatus(status: SubmissionStatus) {
  return String(status).toLowerCase().replace(/_/g, ' ');
}

function submissionToDraft(submission: Submission): SubmissionDraft {
  return {
    ...EMPTY_DRAFT,
    scientificName: submission.scientificName || '',
    displayName: submission.displayName || '',
    taxonomyId: submission.taxonomyId ? String(submission.taxonomyId) : '',
    domain: submission.domain || '',
    phylum: submission.phylum || '',
    className: submission.className || '',
    orderName: submission.orderName || '',
    family: submission.family || '',
    genus: submission.genus || '',
    species: submission.species || '',
    description: submission.description || '',
    strainName: submission.strainName || '',
    isolateName: submission.isolateName || '',
    strainCode: submission.strainCode || '',
    sourceType: submission.sourceType || '',
    host: submission.host || '',
    country: submission.country || '',
    state: submission.state || '',
    city: submission.city || '',
    collectionDate: submission.collectionDate ? String(submission.collectionDate).slice(0, 10) : '',
    locationText: submission.locationText || '',
    latitude: submission.latitude !== null && submission.latitude !== undefined ? String(submission.latitude) : '',
    longitude: submission.longitude !== null && submission.longitude !== undefined ? String(submission.longitude) : '',
    biosampleAccession: submission.biosampleAccession || '',
    bioprojectAccession: submission.bioprojectAccession || '',
    assemblyAccession: submission.assemblyAccession || '',
    genomeStatus: submission.genomeStatus || '',
    genomeSize: submission.genomeSize !== null && submission.genomeSize !== undefined ? String(submission.genomeSize) : '',
    gcContent: submission.gcContent !== null && submission.gcContent !== undefined ? String(submission.gcContent) : '',
    repoLink: submission.repoLink || '',
    metadata: JSON.stringify(submission.metadata || {}, null, 2),
    surveillanceScope: 'N/A',
    evidenceBasis: 'N/A',
    submittingInstitution: '',
    dataSource: '',
    dataUseLimitations: '',
    lastVerifiedAt: '',
  };
}

function draftToPayload(draft: SubmissionDraft) {
  return {
    scientificName: draft.scientificName,
    displayName: draft.displayName,
    taxonomyId: draft.taxonomyId,
    domain: draft.domain,
    phylum: draft.phylum,
    className: draft.className,
    orderName: draft.orderName,
    family: draft.family,
    genus: draft.genus,
    species: draft.species,
    description: draft.description,
    strainName: draft.strainName,
    isolateName: draft.isolateName,
    strainCode: draft.strainCode,
    sourceType: draft.sourceType,
    host: draft.host,
    country: draft.country,
    state: draft.state,
    city: draft.city,
    collectionDate: draft.collectionDate,
    locationText: draft.locationText,
    latitude: draft.latitude,
    longitude: draft.longitude,
    biosampleAccession: draft.biosampleAccession,
    bioprojectAccession: draft.bioprojectAccession,
    assemblyAccession: draft.assemblyAccession,
    genomeStatus: draft.genomeStatus,
    genomeSize: draft.genomeSize,
    gcContent: draft.gcContent,
    repoLink: draft.repoLink,
    metadata: draft.metadata,
    surveillanceScope: draft.surveillanceScope,
    evidenceBasis: draft.evidenceBasis,
    submittingInstitution: draft.submittingInstitution,
    dataSource: draft.dataSource,
    dataUseLimitations: draft.dataUseLimitations,
    lastVerifiedAt: draft.lastVerifiedAt,
  };
}

function EditField({ label, value, onChange, type = 'text', required = false, min, max, step }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number | string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input
        required={required}
        type={type}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-orange-100 bg-white px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
      />
    </label>
  );
}

function EditArea({ label, value, onChange, rows = 4, monospace = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  monospace?: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white ${monospace ? 'font-mono' : ''}`}
      />
    </label>
  );
}
