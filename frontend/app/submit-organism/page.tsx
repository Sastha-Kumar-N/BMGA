'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FilePlus2, ShieldCheck } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type StatusState = {
  type: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

const DEFAULT_FORM = {
  scientificName: '',
  displayName: '',
  taxonomyId: '',
  domain: 'Bacteria',
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
  sourceType: 'Clinical',
  host: '',
  country: 'India',
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
};

export default function SubmitOrganismPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [status, setStatus] = useState<StatusState>({ type: 'idle', message: '' });

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Submitting organism metadata for admin review...' });

    try {
      const response = await fetch(apiPath('/organism-uploads'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit organism upload');
      }
      setStatus({ type: 'success', message: 'Submission received. It will remain hidden until an admin approves it.' });
      setForm({ ...DEFAULT_FORM, country: form.country || 'India', domain: form.domain || 'Bacteria' });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to submit organism upload' });
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href="/account" className="text-xs font-black uppercase tracking-widest text-orange-600">Account Dashboard</Link>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-tight">
              <FilePlus2 className="text-orange-500" size={34} /> Submit Organism Data
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              These fields match the admin organism and genome metadata portal. Submissions enter a pending review queue and are published only after approval.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-700">
            <ShieldCheck size={16} /> Review Protected
          </div>
        </div>

        <form onSubmit={submit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 md:p-8">
          <Section title="Organism Taxonomy" />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Scientific Name" value={form.scientificName} onChange={(value) => setForm({ ...form, scientificName: value })} required />
            <Field label="Display Name" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} />
            <Field label="NCBI Taxonomy ID" value={form.taxonomyId} onChange={(value) => setForm({ ...form, taxonomyId: value })} />
            <Field label="Domain" value={form.domain} onChange={(value) => setForm({ ...form, domain: value })} />
            <Field label="Phylum" value={form.phylum} onChange={(value) => setForm({ ...form, phylum: value })} />
            <Field label="Class" value={form.className} onChange={(value) => setForm({ ...form, className: value })} />
            <Field label="Order" value={form.orderName} onChange={(value) => setForm({ ...form, orderName: value })} />
            <Field label="Family" value={form.family} onChange={(value) => setForm({ ...form, family: value })} />
            <Field label="Genus" value={form.genus} onChange={(value) => setForm({ ...form, genus: value })} />
            <Field label="Species" value={form.species} onChange={(value) => setForm({ ...form, species: value })} />
          </div>
          <Area label="Description / Notes" value={form.description} onChange={(value) => setForm({ ...form, description: value })} />

          <Section title="Genome / Isolate Metadata" />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Strain Name" value={form.strainName} onChange={(value) => setForm({ ...form, strainName: value })} required />
            <Field label="Isolate Name" value={form.isolateName} onChange={(value) => setForm({ ...form, isolateName: value })} />
            <Field label="Strain Code" value={form.strainCode} onChange={(value) => setForm({ ...form, strainCode: value })} />
            <Field label="Source Type" value={form.sourceType} onChange={(value) => setForm({ ...form, sourceType: value })} />
            <Field label="Host" value={form.host} onChange={(value) => setForm({ ...form, host: value })} />
            <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} />
            <Field label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })} />
            <Field label="City" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
            <Field label="Collection Date" type="date" value={form.collectionDate} onChange={(value) => setForm({ ...form, collectionDate: value })} />
            <Field label="Location Text" value={form.locationText} onChange={(value) => setForm({ ...form, locationText: value })} />
            <Field label="Latitude" value={form.latitude} onChange={(value) => setForm({ ...form, latitude: value })} />
            <Field label="Longitude" value={form.longitude} onChange={(value) => setForm({ ...form, longitude: value })} />
          </div>

          <Section title="Accessions & Assembly" />
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="BioSample Accession" value={form.biosampleAccession} onChange={(value) => setForm({ ...form, biosampleAccession: value })} />
            <Field label="BioProject Accession" value={form.bioprojectAccession} onChange={(value) => setForm({ ...form, bioprojectAccession: value })} />
            <Field label="Assembly Accession" value={form.assemblyAccession} onChange={(value) => setForm({ ...form, assemblyAccession: value })} />
            <Field label="Assembly Status" value={form.genomeStatus} onChange={(value) => setForm({ ...form, genomeStatus: value })} />
            <Field label="Genome Size" value={form.genomeSize} onChange={(value) => setForm({ ...form, genomeSize: value })} />
            <Field label="GC Content" value={form.gcContent} onChange={(value) => setForm({ ...form, gcContent: value })} />
            <Field label="Repository Link" value={form.repoLink} onChange={(value) => setForm({ ...form, repoLink: value })} />
          </div>
          <Area label="Additional Metadata JSON" value={form.metadata} onChange={(value) => setForm({ ...form, metadata: value })} rows={6} />

          {status.type !== 'idle' && (
            <div className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${status.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              {status.message}
            </div>
          )}

          <button type="submit" disabled={status.type === 'loading'} className="w-full rounded-2xl bg-[#0B1B3A] py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-60">
            {status.type === 'loading' ? 'Submitting...' : 'Submit for Admin Review'}
          </button>
        </form>
      </div>
    </main>
  );
}

function Section({ title }: { title: string }) {
  return <h2 className="border-b border-slate-100 pb-3 text-xl font-black tracking-tight">{title}</h2>;
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
      />
    </label>
  );
}

function Area({ label, value, onChange, rows = 4 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white"
      />
    </label>
  );
}
