'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Dna, Home, LayoutDashboard, Lock, UserRound } from 'lucide-react';
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

export default function UserSubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken || !params.id) return;
    setMessage({ type: 'loading', text: 'Loading submission details...' });
    try {
      const response = await fetch(apiPath(`/submissions/${params.id}`), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as { submission?: Submission; error?: string };
      if (!response.ok || !data.submission) throw new Error(data.error || 'Failed to load submission');
      setSubmission(data.submission);
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load submission' });
    }
  }, [headers, params.id, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

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
            <SubmissionFilesPanel files={submission.genomeReferences || []} title="Genome References" eyebrow="FASTA & Annotation" emptyMessage="No FASTA or GFF3 reference files are attached to this submission." />
          </section>

          <aside className="space-y-6">
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3" aria-label={`${BRAND_FULL_NAME} home`}>
            <BrandLogo size="sm" />
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
