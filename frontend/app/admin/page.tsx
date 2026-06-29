'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  AlertCircle,
  CheckCircle,
  Database,
  Dna,
  FileText,
  Layers,
  Lock,
  LogOut,
  Microscope,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type StatusState = {
  type: 'idle' | 'success' | 'error' | 'loading';
  message: string;
};

type AdminTabId = 'organism' | 'strain' | 'metadata' | 'maya';

type OrganismOption = {
  id: number;
  scientificName: string;
};

type StrainOption = {
  id: number;
  organismId: number;
  strainName: string;
  organism?: {
    scientificName?: string | null;
  } | null;
};

type AdminTab = {
  id: AdminTabId;
  icon: LucideIcon;
  label: string;
};

const MAYA_TOOLS = [
  'abricate',
  'antismash',
  'barrnap',
  'busco',
  'checkm',
  'diamond',
  'fastp',
  'fastqc',
  'fastqc_trimmed',
  'hmmer',
  'islandpath',
  'jellyfish',
  'kofam',
  'minced',
  'rnlst',
  'multiqc',
  'prokka',
  'quast',
  'spades',
  'trf',
  'trnascan',
];

const ADMIN_TABS: AdminTab[] = [
  { id: 'organism', icon: Microscope, label: 'Organism' },
  { id: 'strain', icon: Dna, label: 'Genome Metadata' },
  { id: 'metadata', icon: Database, label: 'Edit Organism' },
  { id: 'maya', icon: UploadCloud, label: 'MAYA Results' },
];

export default function AdminPortal() {
  const { data: session, status: sessionStatus } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = session?.user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<AdminTabId>('organism');
  const [organisms, setOrganisms] = useState<OrganismOption[]>([]);
  const [strains, setStrains] = useState<StrainOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<StatusState>({ type: 'idle', message: '' });

  const [orgForm, setOrgForm] = useState({
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
  });

  const [strainForm, setStrainForm] = useState({
    organismId: '',
    strainName: '',
    isolateName: '',
    strainCode: '',
    sourceType: 'Clinical',
    host: '',
    country: 'India',
    state: '',
    city: '',
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
  });

  const [metadataForm, setMetadataForm] = useState({
    organismId: '',
    displayName: '',
    taxonomyId: '',
    phylum: '',
    className: '',
    orderName: '',
    family: '',
    description: '',
  });

  const [mayaForm, setMayaForm] = useState({
    organismId: '',
    strainId: '',
    toolName: 'abricate',
    runStatus: 'completed',
    version: '',
    tableName: '',
    summary: '{\n  "total_hits": 0\n}',
    warnings: '',
    errors: '',
  });

  const adminHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const fetchData = useCallback(async () => {
    try {
      const [adminRes, orgRes, strainRes] = await Promise.all([
        fetch(apiPath('/admin/me'), { headers: adminHeaders() }),
        fetch(apiPath('/organisms')),
        fetch(apiPath('/strains')),
      ]);

      if (!adminRes.ok) {
        throw new Error('Your admin session is not valid. Please sign in again.');
      }
      if (!orgRes.ok || !strainRes.ok) {
        throw new Error('Failed to load organism and strain records.');
      }

      const orgData = await orgRes.json() as OrganismOption[];
      const strainData = await strainRes.json() as StrainOption[];

      setOrganisms(orgData);
      setStrains(strainData);

      const firstOrgId = orgData[0]?.id?.toString() || '';
      const firstStrainId = strainData.find((strain) => strain.organismId?.toString() === firstOrgId)?.id?.toString() || '';
      if (firstOrgId) {
        setStrainForm((prev) => prev.organismId ? prev : { ...prev, organismId: firstOrgId });
        setMetadataForm((prev) => prev.organismId ? prev : { ...prev, organismId: firstOrgId });
        setMayaForm((prev) => prev.organismId ? prev : { ...prev, organismId: firstOrgId, strainId: firstStrainId });
      }
    } catch (err) {
      console.error('Failed to fetch admin data', err);
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load admin data.' });
    }
  }, [adminHeaders]);

  useEffect(() => {
    if (isAdmin) {
      const timer = window.setTimeout(() => {
        void fetchData();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [fetchData, isAdmin]);

  const submitJson = async (url: string, body: unknown, successMessage: string) => {
    setStatus({ type: 'loading', message: 'Saving admin changes...' });
    const response = await fetch(apiPath(url), {
      method: url.includes('/metadata') ? 'PATCH' : 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    setStatus({ type: 'success', message: successMessage });
    await fetchData();
  };

  const handleAddOrganism = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await submitJson('/organisms', orgForm, `${orgForm.scientificName} added to the organism registry.`);
      setOrgForm((prev) => ({ ...prev, scientificName: '', displayName: '', taxonomyId: '', description: '' }));
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to add organism.' });
    }
  };

  const handleAddStrain = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await submitJson('/strains', strainForm, `${strainForm.strainName} registered with genome metadata.`);
      setStrainForm((prev) => ({ ...prev, strainName: '', isolateName: '', strainCode: '', city: '', latitude: '', longitude: '' }));
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to add strain.' });
    }
  };

  const handleUpdateOrganismMetadata = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await submitJson(`/admin/organisms/${metadataForm.organismId}/metadata`, metadataForm, 'Organism metadata updated.');
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update metadata.' });
    }
  };

  const handleMayaUpload = async () => {
    if (!mayaForm.organismId) return;
    setStatus({ type: 'loading', message: 'Ingesting MAYA result...' });

    const send = async (fileContent = '', fileName = '') => {
      await submitJson('/admin/maya-results', {
        organismId: mayaForm.organismId,
        strainId: mayaForm.strainId || null,
        toolName: mayaForm.toolName,
        status: mayaForm.runStatus,
        version: mayaForm.version,
        summary: mayaForm.summary,
        tableName: mayaForm.tableName || `${mayaForm.toolName} MAYA output`,
        fileName,
        fileContent,
        warnings: mayaForm.warnings,
        errors: mayaForm.errors,
      }, `${mayaForm.toolName} MAYA results ingested.`);
      setFile(null);
    };

    try {
      if (!file) {
        await send();
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          await send(String(event.target?.result || ''), file.name);
        } catch (error) {
          setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to ingest MAYA result.' });
        }
      };
      reader.readAsText(file);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to ingest MAYA result.' });
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1B3A] text-orange-400">
        <div className="font-black uppercase tracking-widest">Checking admin session...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1B3A] p-6 text-white">
        <div className="max-w-md rounded-[32px] border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <Lock className="mx-auto mb-5 text-orange-400" size={44} />
          <h1 className="text-3xl font-black tracking-tighter">Admin Sign In Required</h1>
          <p className="mt-3 text-sm font-medium text-slate-300">This portal is restricted to the MAYA administrator account.</p>
          <button onClick={() => signIn()} className="mt-6 rounded-2xl bg-orange-500 px-6 py-3 text-sm font-black uppercase tracking-widest text-white">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B1B3A] p-6 text-white">
        <div className="max-w-lg rounded-[32px] border border-red-400/20 bg-red-500/10 p-8 text-center shadow-2xl">
          <AlertCircle className="mx-auto mb-5 text-red-300" size={44} />
          <h1 className="text-3xl font-black tracking-tighter">Admin Access Denied</h1>
          <p className="mt-3 text-sm font-medium text-red-100">Your account is signed in, but it does not have the `ADMIN` role required for MAYA ingestion.</p>
          <button onClick={() => signOut()} className="mt-6 rounded-2xl bg-white px-6 py-3 text-sm font-black uppercase tracking-widest text-[#0B1B3A]">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1B3A] p-6 text-slate-200 selection:bg-orange-500/30 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-4 text-4xl font-black tracking-tighter text-white">
              <Layers className="text-orange-500" size={36} />
              MAYA Admin Portal
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-400">Private ingestion console for organisms, genome metadata, and MAYA result outputs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-200 hover:bg-white/10">
              Dashboard
            </Link>
            <button onClick={() => signOut()} className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-red-200">
              <LogOut size={14} /> Sign Out
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-emerald-300">
              <ShieldCheck size={18} />
              <span className="text-xs font-black uppercase tracking-widest">Admin Verified</span>
            </div>
          </div>
        </header>

        <div className="mb-8 grid gap-2 rounded-3xl border border-white/10 bg-white/5 p-2 md:grid-cols-4">
          {ADMIN_TABS.map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-4 text-xs font-black uppercase tracking-widest transition ${
                  activeTab === tab.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={16} /> {tab.label}
              </button>
            );
          })}
        </div>

        <section className="rounded-[32px] border-4 border-slate-50 bg-white p-6 text-[#0B1B3A] shadow-2xl lg:p-10">
          {activeTab === 'organism' && (
            <form onSubmit={handleAddOrganism} className="space-y-6">
              <SectionTitle title="Add New Organism" subtitle="Create a taxonomic organism record before registering genomes or MAYA outputs." />
              <div className="grid gap-5 md:grid-cols-2">
                <TextInput label="Scientific Name" value={orgForm.scientificName} onChange={(value) => setOrgForm({ ...orgForm, scientificName: value })} required />
                <TextInput label="Display Name" value={orgForm.displayName} onChange={(value) => setOrgForm({ ...orgForm, displayName: value })} />
                <TextInput label="NCBI Taxonomy ID" value={orgForm.taxonomyId} onChange={(value) => setOrgForm({ ...orgForm, taxonomyId: value })} />
                <TextInput label="Domain" value={orgForm.domain} onChange={(value) => setOrgForm({ ...orgForm, domain: value })} />
                <TextInput label="Phylum" value={orgForm.phylum} onChange={(value) => setOrgForm({ ...orgForm, phylum: value })} />
                <TextInput label="Class" value={orgForm.className} onChange={(value) => setOrgForm({ ...orgForm, className: value })} />
                <TextInput label="Order" value={orgForm.orderName} onChange={(value) => setOrgForm({ ...orgForm, orderName: value })} />
                <TextInput label="Family" value={orgForm.family} onChange={(value) => setOrgForm({ ...orgForm, family: value })} />
                <TextInput label="Genus" value={orgForm.genus} onChange={(value) => setOrgForm({ ...orgForm, genus: value })} />
                <TextInput label="Species" value={orgForm.species} onChange={(value) => setOrgForm({ ...orgForm, species: value })} />
              </div>
              <TextArea label="Description / Notes" value={orgForm.description} onChange={(value) => setOrgForm({ ...orgForm, description: value })} />
              <PrimaryButton label="Save Organism" loading={status.type === 'loading'} />
            </form>
          )}

          {activeTab === 'strain' && (
            <form onSubmit={handleAddStrain} className="space-y-6">
              <SectionTitle title="Register Genome / Isolate Metadata" subtitle="Attach accessions, assembly metadata, source information, and extra JSON metadata to a genome." />
              <div className="grid gap-5 md:grid-cols-2">
                <SelectInput label="Parent Organism" value={strainForm.organismId} onChange={(value) => setStrainForm({ ...strainForm, organismId: value })} options={organisms.map((organism) => ({ value: organism.id.toString(), label: organism.scientificName }))} />
                <TextInput label="Strain Name" value={strainForm.strainName} onChange={(value) => setStrainForm({ ...strainForm, strainName: value })} required />
                <TextInput label="Isolate Name" value={strainForm.isolateName} onChange={(value) => setStrainForm({ ...strainForm, isolateName: value })} />
                <TextInput label="Strain Code" value={strainForm.strainCode} onChange={(value) => setStrainForm({ ...strainForm, strainCode: value })} />
                <TextInput label="BioSample Accession" value={strainForm.biosampleAccession} onChange={(value) => setStrainForm({ ...strainForm, biosampleAccession: value })} />
                <TextInput label="BioProject Accession" value={strainForm.bioprojectAccession} onChange={(value) => setStrainForm({ ...strainForm, bioprojectAccession: value })} />
                <TextInput label="Assembly Accession" value={strainForm.assemblyAccession} onChange={(value) => setStrainForm({ ...strainForm, assemblyAccession: value })} />
                <TextInput label="Assembly Status" value={strainForm.genomeStatus} onChange={(value) => setStrainForm({ ...strainForm, genomeStatus: value })} />
                <TextInput label="Genome Size" value={strainForm.genomeSize} onChange={(value) => setStrainForm({ ...strainForm, genomeSize: value })} />
                <TextInput label="GC Content" value={strainForm.gcContent} onChange={(value) => setStrainForm({ ...strainForm, gcContent: value })} />
                <TextInput label="Source Type" value={strainForm.sourceType} onChange={(value) => setStrainForm({ ...strainForm, sourceType: value })} />
                <TextInput label="Host" value={strainForm.host} onChange={(value) => setStrainForm({ ...strainForm, host: value })} />
                <TextInput label="Country" value={strainForm.country} onChange={(value) => setStrainForm({ ...strainForm, country: value })} />
                <TextInput label="State" value={strainForm.state} onChange={(value) => setStrainForm({ ...strainForm, state: value })} />
                <TextInput label="City" value={strainForm.city} onChange={(value) => setStrainForm({ ...strainForm, city: value })} />
                <TextInput label="Latitude" value={strainForm.latitude} onChange={(value) => setStrainForm({ ...strainForm, latitude: value })} />
                <TextInput label="Longitude" value={strainForm.longitude} onChange={(value) => setStrainForm({ ...strainForm, longitude: value })} />
                <TextInput label="Repository Link" value={strainForm.repoLink} onChange={(value) => setStrainForm({ ...strainForm, repoLink: value })} />
              </div>
              <TextArea label="Additional Metadata JSON" value={strainForm.metadata} onChange={(value) => setStrainForm({ ...strainForm, metadata: value })} rows={5} />
              <PrimaryButton label="Register Genome Metadata" loading={status.type === 'loading'} />
            </form>
          )}

          {activeTab === 'metadata' && (
            <form onSubmit={handleUpdateOrganismMetadata} className="space-y-6">
              <SectionTitle title="Edit Organism Metadata" subtitle="Patch taxonomic annotations and public notes for an existing organism." />
              <SelectInput label="Organism" value={metadataForm.organismId} onChange={(value) => setMetadataForm({ ...metadataForm, organismId: value })} options={organisms.map((organism) => ({ value: organism.id.toString(), label: organism.scientificName }))} />
              <div className="grid gap-5 md:grid-cols-2">
                <TextInput label="Display Name" value={metadataForm.displayName} onChange={(value) => setMetadataForm({ ...metadataForm, displayName: value })} />
                <TextInput label="Taxonomy ID" value={metadataForm.taxonomyId} onChange={(value) => setMetadataForm({ ...metadataForm, taxonomyId: value })} />
                <TextInput label="Phylum" value={metadataForm.phylum} onChange={(value) => setMetadataForm({ ...metadataForm, phylum: value })} />
                <TextInput label="Class" value={metadataForm.className} onChange={(value) => setMetadataForm({ ...metadataForm, className: value })} />
                <TextInput label="Order" value={metadataForm.orderName} onChange={(value) => setMetadataForm({ ...metadataForm, orderName: value })} />
                <TextInput label="Family" value={metadataForm.family} onChange={(value) => setMetadataForm({ ...metadataForm, family: value })} />
              </div>
              <TextArea label="Description" value={metadataForm.description} onChange={(value) => setMetadataForm({ ...metadataForm, description: value })} />
              <PrimaryButton label="Update Organism Metadata" loading={status.type === 'loading'} />
            </form>
          )}

          {activeTab === 'maya' && (
            <div className="space-y-6">
              <SectionTitle title="Ingest MAYA Results" subtitle="Upload a TSV, CSV, or JSON result table and normalized summary metadata for the selected organism." />
              <div className="grid gap-5 md:grid-cols-2">
                <SelectInput label="Target Organism" value={mayaForm.organismId} onChange={(value) => setMayaForm({ ...mayaForm, organismId: value })} options={organisms.map((organism) => ({ value: organism.id.toString(), label: organism.scientificName }))} />
                <SelectInput label="Target Genome / Strain" value={mayaForm.strainId} onChange={(value) => setMayaForm({ ...mayaForm, strainId: value })} options={[{ value: '', label: 'Organism-level result' }, ...strains.filter((strain) => !mayaForm.organismId || strain.organismId?.toString() === mayaForm.organismId).map((strain) => ({ value: strain.id.toString(), label: `${strain.strainName} (${strain.organism?.scientificName})` }))]} />
                <SelectInput label="MAYA Tool" value={mayaForm.toolName} onChange={(value) => setMayaForm({ ...mayaForm, toolName: value })} options={MAYA_TOOLS.map((tool) => ({ value: tool, label: tool }))} />
                <SelectInput label="Run Status" value={mayaForm.runStatus} onChange={(value) => setMayaForm({ ...mayaForm, runStatus: value })} options={['completed', 'warning', 'partial', 'failed', 'pending', 'not_available'].map((item) => ({ value: item, label: item }))} />
                <TextInput label="Tool Version" value={mayaForm.version} onChange={(value) => setMayaForm({ ...mayaForm, version: value })} />
                <TextInput label="Table Name" value={mayaForm.tableName} onChange={(value) => setMayaForm({ ...mayaForm, tableName: value })} />
              </div>
              <TextArea label="Summary JSON" value={mayaForm.summary} onChange={(value) => setMayaForm({ ...mayaForm, summary: value })} rows={7} />
              <div onClick={() => fileInputRef.current?.click()} className={`cursor-pointer rounded-3xl border-4 border-dashed p-12 text-center transition-all ${file ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                <input type="file" ref={fileInputRef} className="hidden" accept=".tsv,.csv,.txt,.json" onChange={(event) => event.target.files && setFile(event.target.files[0])} />
                {file ? (
                  <div className="flex flex-col items-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-lg shadow-orange-500/30"><FileText size={32} /></div>
                    <p className="text-xl font-black">{file.name}</p>
                    <p className="text-sm font-bold text-orange-500">{(file.size / 1024).toFixed(2)} KB ready for ingestion</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center opacity-70">
                    <UploadCloud size={64} className="mb-4 text-slate-400" />
                    <p className="text-xl font-black">Click to attach MAYA output</p>
                    <p className="mt-2 text-sm font-bold text-slate-400">TSV, CSV, TXT, or JSON table output</p>
                  </div>
                )}
              </div>
              <TextArea label="Warnings" value={mayaForm.warnings} onChange={(value) => setMayaForm({ ...mayaForm, warnings: value })} rows={3} />
              <TextArea label="Errors" value={mayaForm.errors} onChange={(value) => setMayaForm({ ...mayaForm, errors: value })} rows={3} />
              <button onClick={handleMayaUpload} disabled={status.type === 'loading'} className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#0B1B3A] py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-50">
                {status.type === 'loading' ? 'Processing...' : 'Ingest MAYA Result'}
              </button>
            </div>
          )}

          {status.type !== 'idle' && status.type !== 'loading' && (
            <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 font-bold ${status.type === 'success' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-red-200 bg-red-50 text-red-700'}`}>
              {status.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
              {status.message}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-slate-100 pb-6">
      <h2 className="text-2xl font-black tracking-tighter">{title}</h2>
      <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
    </div>
  );
}

function TextInput({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 font-bold outline-none transition-colors focus:border-orange-500" />
    </label>
  );
}

function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm font-bold outline-none transition-colors focus:border-orange-500" />
    </label>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-4 font-bold outline-none transition-colors focus:border-orange-500">
        {options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function PrimaryButton({ label, loading }: { label: string; loading: boolean }) {
  return (
    <button type="submit" disabled={loading} className="w-full rounded-2xl bg-[#0B1B3A] py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-50">
      {loading ? 'Saving...' : label}
    </button>
  );
}
