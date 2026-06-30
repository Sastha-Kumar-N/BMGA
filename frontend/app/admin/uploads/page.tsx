'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck, Trash2, XCircle } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type OrganismUpload = {
  id: string;
  scientificName: string;
  strainName: string;
  status: ReviewStatus;
  sourceType?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  assemblyAccession?: string | null;
  genomeSize?: number | null;
  gcContent?: string | number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  reviewNote?: string | null;
  createdAt: string;
  submittedBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

const EMPTY_FORM = {
  scientificName: '',
  strainName: '',
  sourceType: '',
  country: 'India',
  state: '',
  city: '',
  latitude: '',
  longitude: '',
  assemblyAccession: '',
  genomeSize: '',
  gcContent: '',
  description: '',
  metadata: '{}',
};

export default function AdminUploadsPage() {
  const { data: session } = useSession();
  const [uploads, setUploads] = useState<OrganismUpload[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'ALL' | ReviewStatus>('PENDING');
  const [form, setForm] = useState(EMPTY_FORM);
  const [reviewNote, setReviewNote] = useState('');
  const [message, setMessage] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; text: string }>({ type: 'idle', text: '' });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const selectUpload = useCallback((upload: OrganismUpload) => {
    setSelectedId(upload.id);
    setReviewNote(upload.reviewNote || '');
    setForm({
      scientificName: upload.scientificName || '',
      strainName: upload.strainName || '',
      sourceType: upload.sourceType || '',
      country: upload.country || 'India',
      state: upload.state || '',
      city: upload.city || '',
      latitude: upload.latitude?.toString() || '',
      longitude: upload.longitude?.toString() || '',
      assemblyAccession: upload.assemblyAccession || '',
      genomeSize: upload.genomeSize?.toString() || '',
      gcContent: upload.gcContent?.toString() || '',
      description: upload.description || '',
      metadata: JSON.stringify(upload.metadata || {}, null, 2),
    });
  }, []);

  const load = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setMessage({ type: 'loading', text: 'Loading organism submissions...' });
    try {
      const response = await fetch(apiPath('/admin/organism-uploads'), { headers, cache: 'no-store' });
      const data = response.ok ? await response.json() as OrganismUpload[] : [];
      setUploads(data);
      const first = data.find((item) => item.status === 'PENDING') || data[0];
      if (first) selectUpload(first);
      setMessage({ type: 'idle', text: '' });
    } catch (error) {
      console.error('Upload review load failed', error);
      setMessage({ type: 'error', text: 'Failed to load organism submissions' });
    }
  }, [headers, selectUpload, session?.user?.accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = uploads.find((upload) => upload.id === selectedId);
  const filteredUploads = filter === 'ALL' ? uploads : uploads.filter((upload) => upload.status === filter);

  const saveEdits = async () => {
    if (!selected) return;
    setMessage({ type: 'loading', text: 'Saving submission edits...' });
    try {
      const response = await fetch(apiPath(`/admin/organism-uploads/${selected.id}`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ ...form, reviewNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to update submission');
      setMessage({ type: 'success', text: 'Submission edits saved' });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update submission' });
    }
  };

  const runAction = async (action: 'approve' | 'reject' | 'delete') => {
    if (!selected) return;
    setMessage({ type: 'loading', text: `${action === 'delete' ? 'Deleting' : action === 'approve' ? 'Approving' : 'Rejecting'} submission...` });
    try {
      const response = await fetch(apiPath(`/admin/organism-uploads/${selected.id}${action === 'delete' ? '' : `/${action}`}`), {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers,
        body: action === 'delete' ? undefined : JSON.stringify({ reviewNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Failed to ${action} submission`);
      setMessage({ type: 'success', text: data.message || `Submission ${action}d` });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : `Failed to ${action} submission` });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#0B1B3A] p-7 text-white">
          <Link href="/admin/cockpit" className="text-xs font-black uppercase tracking-widest text-orange-300">Admin Cockpit</Link>
          <h1 className="mt-3 flex items-center gap-3 text-4xl font-black tracking-tight">
            <ClipboardCheck className="text-orange-400" size={34} /> Organism Upload Review
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
            Approved submissions are published into the public organism database and become visible on the dashboard atlas.
          </p>
        </header>

        {message.type !== 'idle' && (
          <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${message.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {message.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
            {message.text}
          </div>
        )}

        <section className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:border-orange-500">
                <option value="ALL">All uploads</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
              {filteredUploads.map((upload) => (
                <button key={upload.id} onClick={() => selectUpload(upload)} className={`w-full px-4 py-4 text-left transition ${selectedId === upload.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black italic">{upload.scientificName}</p>
                    <StatusBadge status={upload.status} />
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{upload.strainName} | {upload.city || upload.state || 'No location'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">{upload.submittedBy?.email || 'Unknown submitter'}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            {selected ? (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Edit Before Approval</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">Submitted {new Date(selected.createdAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Scientific Name" value={form.scientificName} onChange={(value) => setForm({ ...form, scientificName: value })} />
                  <Field label="Strain Name" value={form.strainName} onChange={(value) => setForm({ ...form, strainName: value })} />
                  <Field label="Source Type" value={form.sourceType} onChange={(value) => setForm({ ...form, sourceType: value })} />
                  <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
                  <Field label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
                  <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                  <Field label="Latitude" value={form.latitude} onChange={(value) => setForm({ ...form, latitude: value })} />
                  <Field label="Longitude" value={form.longitude} onChange={(value) => setForm({ ...form, longitude: value })} />
                  <Field label="Assembly Accession" value={form.assemblyAccession} onChange={(value) => setForm({ ...form, assemblyAccession: value })} />
                  <Field label="Genome Size" value={form.genomeSize} onChange={(value) => setForm({ ...form, genomeSize: value })} />
                  <Field label="GC Content" value={form.gcContent} onChange={(value) => setForm({ ...form, gcContent: value })} />
                </div>
                <Area label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />
                <Area label="Metadata JSON" value={form.metadata} onChange={(value) => setForm({ ...form, metadata: value })} rows={6} />
                <Area label="Review Note" value={reviewNote} onChange={setReviewNote} rows={3} />

                <div className="grid gap-3 md:grid-cols-4">
                  <button onClick={saveEdits} disabled={message.type === 'loading' || selected.status === 'APPROVED'} className="rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-orange-500 disabled:opacity-50">
                    Save Edits
                  </button>
                  <button onClick={() => runAction('approve')} disabled={message.type === 'loading'} className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-emerald-700 disabled:opacity-50">
                    Approve
                  </button>
                  <button onClick={() => runAction('reject')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700 disabled:opacity-50">
                    <XCircle size={15} /> Reject
                  </button>
                  <button onClick={() => runAction('delete')} disabled={message.type === 'loading'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-700 hover:bg-red-100 disabled:opacity-50">
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-24 text-center text-sm font-bold text-slate-500">No organism upload selected.</div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const classes = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
  };
  return <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${classes[status]}`}>{status}</span>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
    </label>
  );
}

function Area({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-sm font-bold outline-none focus:border-orange-500 focus:bg-white" />
    </label>
  );
}
