'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, Database, Home, LayoutDashboard, XCircle } from 'lucide-react';
import { apiPath } from '../../../lib/api-client';
import { AuditTimeline, type AuditLogRecord } from '../../components/AuditTimeline';
import {
  ReviewerNotesPanel,
  SubmissionFilesPanel,
  SubmissionStatusBadge,
  SubmissionTimeline,
  type SubmissionFile,
  type SubmissionHistoryEntry,
  type SubmissionReviewerNote,
  type SubmissionStatus,
} from '../../../components/submissions/SubmissionPanels';

type Person = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  affiliation?: string | null;
};

type OrganismUpload = {
  id: string;
  title?: string;
  submissionType?: string;
  status: SubmissionStatus;
  reviewNote?: string | null;
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
  description?: string | null;
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
  surveillanceScope?: string | null;
  evidenceBasis?: string | null;
  submittingInstitution?: string | null;
  dataSource?: string | null;
  dataUseLimitations?: string | null;
  lastVerifiedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  publishedOrganismId?: number | null;
  publishedStrainId?: number | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  submittedBy?: Person | null;
  reviewedBy?: Person | null;
  files?: SubmissionFile[];
  genomeReferences?: SubmissionFile[];
  statusHistory?: SubmissionHistoryEntry[];
  reviewerNotes?: SubmissionReviewerNote[];
};

type UploadDetailResponse = {
  upload: OrganismUpload;
  auditLogs: AuditLogRecord[];
};

export default function AdminUploadDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const uploadId = params.id;
  const [detail, setDetail] = useState<UploadDetailResponse | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [newReviewerNote, setNewReviewerNote] = useState('');
  const [visibleToSubmitter, setVisibleToSubmitter] = useState(true);
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken || !uploadId) return;
    setMessage({ type: 'loading', text: 'Loading organism submission detail...' });
    try {
      const response = await fetch(apiPath(`/admin/organism-uploads/${uploadId}`), { headers, cache: 'no-store' });
      const data = await response.json().catch(() => ({})) as Partial<UploadDetailResponse> & { error?: string };
      if (!response.ok || !data.upload) throw new Error(data.error || 'Failed to load organism submission');
      setDetail({ upload: data.upload, auditLogs: data.auditLogs || [] });
      setReviewNote(data.upload.reviewNote || '');
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load organism submission' });
    }
  }, [headers, session?.user?.accessToken, uploadId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (action: 'approve' | 'reject') => {
    if (!detail) return;
    setMessage({ type: 'loading', text: `${action === 'approve' ? 'Approving' : 'Rejecting'} submission...` });
    try {
      const response = await fetch(apiPath(`/admin/organism-uploads/${detail.upload.id}/${action}`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ reviewNote }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || `Failed to ${action} submission`);
      setMessage({ type: 'success', text: data.message || `Submission ${action}d` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : `Failed to ${action} submission` });
    }
  };

  const runStatusUpdate = async (status: 'UNDER_REVIEW' | 'NEEDS_CHANGES' | 'ARCHIVED') => {
    if (!detail) return;
    setMessage({ type: 'loading', text: 'Updating submission status...' });
    try {
      const response = await fetch(apiPath(`/admin/submissions/${detail.upload.id}/status`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ status, note: reviewNote, visibleToSubmitter }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to update submission status');
      setMessage({ type: 'success', text: data.message || 'Submission status updated' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update submission status' });
    }
  };

  const addReviewerNote = async () => {
    if (!detail) return;
    setMessage({ type: 'loading', text: 'Adding reviewer note...' });
    try {
      const response = await fetch(apiPath(`/admin/submissions/${detail.upload.id}/notes`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: newReviewerNote, visibleToSubmitter }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Failed to add reviewer note');
      setNewReviewerNote('');
      setMessage({ type: 'success', text: data.message || 'Reviewer note added' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to add reviewer note' });
    }
  };

  const upload = detail?.upload;

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white shadow-xl md:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link href="/admin/uploads" className="text-xs font-black uppercase tracking-widest text-orange-300">Organism Upload Review</Link>
              <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
                <ClipboardCheck className="text-orange-400" size={36} /> Submission Detail
              </h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                Review the submitted organism metadata, publication status, reviewer notes, and audit history.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:border-orange-300 hover:text-orange-200">
                <Home size={15} /> Home
              </Link>
              <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-400">
                <LayoutDashboard size={15} /> Dashboard
              </Link>
            </div>
          </div>
        </header>

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        {upload ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <SubmissionStatusBadge status={upload.status} />
                    <h2 className="mt-3 text-3xl font-black italic tracking-tight">{upload.scientificName}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">Submission ID: <span className="font-mono">{upload.id}</span></p>
                  </div>
                  {upload.publishedOrganismId && (
                    <Link href={`/organisms/${upload.publishedOrganismId}/results`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500">
                      <Database size={15} /> Public Record
                    </Link>
                  )}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Info label="Submitted By" value={`${upload.submittedBy?.name || 'Unknown'} (${upload.submittedBy?.email || 'no email'})`} />
                  <Info label="Submitted" value={new Date(upload.createdAt).toLocaleString()} />
                  <Info label="Reviewed By" value={upload.reviewedBy?.name || upload.reviewedBy?.email || 'Not reviewed'} />
                  <Info label="Reviewed" value={upload.reviewedAt ? new Date(upload.reviewedAt).toLocaleString() : 'Pending'} />
                  <Info label="Source" value={upload.sourceType || 'Not provided'} />
                  <Info label="Location" value={[upload.city, upload.state, upload.country].filter(Boolean).join(', ') || upload.locationText || 'Not provided'} />
                  <Info label="Coordinates" value={upload.latitude !== null && upload.latitude !== undefined && upload.longitude !== null && upload.longitude !== undefined ? `${upload.latitude}, ${upload.longitude}` : 'Not provided'} />
                  <Info label="Host" value={upload.host || 'Not provided'} />
                  <Info label="Assembly" value={upload.assemblyAccession || 'Not provided'} />
                  <Info label="Genome Size" value={upload.genomeSize ? upload.genomeSize.toLocaleString() : 'Not provided'} />
                  <Info label="GC Content" value={upload.gcContent ? `${upload.gcContent}` : 'Not provided'} />
                  <Info label="Taxonomy ID" value={upload.taxonomyId ? String(upload.taxonomyId) : 'Not provided'} />
                  <Info label="Submission Type" value={upload.submissionType || 'Organism Upload'} />
                  <Info label="Submission Title" value={upload.title || `${upload.scientificName} / ${upload.strainName}`} />
                  <Info label="Surveillance Scope" value={upload.surveillanceScope?.replaceAll('_', ' ') || 'Not provided'} />
                  <Info label="Evidence Basis" value={upload.evidenceBasis?.replaceAll('_', ' ') || 'Not provided'} />
                  <Info label="Submitting Institution" value={upload.submittingInstitution || 'Not provided'} />
                  <Info label="Data Source" value={upload.dataSource || 'Not provided'} />
                  <Info label="Last Verified" value={upload.lastVerifiedAt ? new Date(upload.lastVerifiedAt).toLocaleString() : 'Not provided'} />
                </div>

                {upload.description && (
                  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Description</p>
                    <p className="mt-2 text-sm font-semibold leading-7 text-slate-700">{upload.description}</p>
                  </div>
                )}
                {upload.dataUseLimitations && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Data Use Limitations</p>
                    <p className="mt-2 text-sm font-semibold leading-7 text-amber-950">{upload.dataUseLimitations}</p>
                  </div>
                )}
              </div>

              <SubmissionFilesPanel files={upload.files || []} />
              <SubmissionFilesPanel files={upload.genomeReferences || []} title="Genome References" eyebrow="FASTA & Annotation Review" emptyMessage="No FASTA or GFF3 reference files are attached to this submission." />
              <SubmissionTimeline history={upload.statusHistory || []} />
              <AuditTimeline logs={detail.auditLogs} />
            </section>

            <aside className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black tracking-tight">Review Decision</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Record an admin note before approval or rejection.</p>
                <textarea rows={6} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                <label className="mt-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500">
                  <input type="checkbox" checked={visibleToSubmitter} onChange={(event) => setVisibleToSubmitter(event.target.checked)} className="h-4 w-4 accent-orange-500" />
                  Visible to submitter
                </label>
                <div className="mt-4 grid gap-3">
                  <button onClick={() => runStatusUpdate('UNDER_REVIEW')} disabled={message.type === 'loading'} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                    Mark Under Review
                  </button>
                  <button onClick={() => runStatusUpdate('NEEDS_CHANGES')} disabled={message.type === 'loading'} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-orange-700 hover:bg-orange-100 disabled:opacity-50">
                    Request Changes
                  </button>
                  <button onClick={() => runAction('approve')} disabled={message.type === 'loading'} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve & Publish
                  </button>
                  <button onClick={() => runAction('reject')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">
                    <XCircle size={15} /> Reject
                  </button>
                  <button onClick={() => runStatusUpdate('ARCHIVED')} disabled={message.type === 'loading'} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                    Archive
                  </button>
                  <Link href={`/admin/uploads?selected=${upload.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-[#0B1B3A] hover:border-orange-300 hover:text-orange-600">
                    Open Edit Queue
                  </Link>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black tracking-tight">Add Reviewer Note</h2>
                <textarea rows={5} value={newReviewerNote} onChange={(event) => setNewReviewerNote(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
                <button onClick={addReviewerNote} disabled={message.type === 'loading'} className="mt-3 w-full rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-50">
                  Add Note
                </button>
              </section>

              <ReviewerNotesPanel notes={upload.reviewerNotes || []} showVisibility />

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl font-black tracking-tight">Raw Metadata</h2>
                <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-[#0B1B3A] p-4 text-xs font-semibold leading-6 text-slate-100">
                  {JSON.stringify(upload.metadata || {}, null, 2)}
                </pre>
              </section>
            </aside>
          </div>
        ) : message.type !== 'loading' && (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-16 text-center text-sm font-bold text-slate-500 shadow-sm">
            No organism submission found.
          </div>
        )}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-[#0B1B3A]">{value}</p>
    </div>
  );
}
