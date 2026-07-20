'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { signIn, signOut, useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  Dna,
  ExternalLink,
  FileCode2,
  FileText,
  HardDrive,
  History,
  Layers3,
  Lock,
  Microscope,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiPath } from '../lib/api-client';

type StatusState = {
  type: 'idle' | 'success' | 'error' | 'loading';
  message: string;
};

type AdminTabId = 'organism' | 'strain' | 'metadata' | 'references' | 'maya';
type RegistryMode = 'organism' | 'strain';
type GenomeReferenceKind = 'FASTA' | 'GFF3';

type OrganismRecord = {
  id: number;
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
};

type StrainRecord = {
  id: number;
  organismId: number;
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
  gcContent?: number | string | null;
  repoLink?: string | null;
  metadata?: Record<string, unknown> | null;
  surveillanceScope?: string | null;
  evidenceBasis?: string | null;
  submittingInstitution?: string | null;
  dataSource?: string | null;
  dataUseLimitations?: string | null;
  lastVerifiedAt?: string | null;
  organism?: { scientificName?: string | null } | null;
};

type GenomeReferenceRecord = {
  id: string;
  kind: 'FASTA' | 'FAI' | 'GFF3';
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  status: string;
  isPublic: boolean;
  validation?: Record<string, unknown> | null;
  updatedAt: string;
  publishedAt?: string | null;
};

type BlastDatabaseStatus = {
  state: 'EMPTY' | 'MISSING' | 'STALE' | 'BUILDING' | 'READY';
  sourceReferenceCount: number;
  indexedReferenceCount: number;
  totalBases: number | null;
  builtAt: string | null;
  software: string;
};

type AdminTab = {
  id: AdminTabId;
  icon: LucideIcon;
  label: string;
  description: string;
};

const EMPTY_ORGANISM_FORM = {
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
};

const EMPTY_STRAIN_FORM = {
  organismId: '',
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
  surveillanceScope: 'NATIONAL',
  evidenceBasis: 'GENOTYPIC',
  submittingInstitution: '',
  dataSource: '',
  dataUseLimitations: '',
  lastVerifiedAt: '',
  metadata: '{}',
};

type OrganismFormState = typeof EMPTY_ORGANISM_FORM;
type StrainFormState = typeof EMPTY_STRAIN_FORM;

const MAYA_TOOLS = [
  'abricate', 'antismash', 'barrnap', 'busco', 'checkm', 'diamond', 'fastp', 'fastqc',
  'fastqc_trimmed', 'hmmer', 'islandpath', 'jellyfish', 'kofam', 'minced', 'rnlst',
  'multiqc', 'prokka', 'quast', 'spades', 'trf', 'trnascan',
];

const ADMIN_TABS: AdminTab[] = [
  { id: 'organism', icon: Microscope, label: 'Create Organism', description: 'Create a new taxonomic record' },
  { id: 'strain', icon: Dna, label: 'Register Genome', description: 'Add isolate and assembly metadata' },
  { id: 'metadata', icon: Database, label: 'Registry Editor', description: 'Edit published organism or strain data' },
  { id: 'references', icon: FileCode2, label: 'References & BLAST', description: 'Manage FASTA, GFF3, JBrowse, and indexes' },
  { id: 'maya', icon: UploadCloud, label: 'MAYA Results', description: 'Ingest normalized pipeline outputs' },
];

export default function AdminPortal() {
  const { data: session, status: sessionStatus } = useSession();
  const mayaFileInputRef = useRef<HTMLInputElement>(null);
  const isAdmin = session?.user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<AdminTabId>('organism');
  const [registryMode, setRegistryMode] = useState<RegistryMode>('organism');
  const [organisms, setOrganisms] = useState<OrganismRecord[]>([]);
  const [strains, setStrains] = useState<StrainRecord[]>([]);
  const [orgForm, setOrgForm] = useState<OrganismFormState>({ ...EMPTY_ORGANISM_FORM });
  const [strainForm, setStrainForm] = useState<StrainFormState>({ ...EMPTY_STRAIN_FORM });
  const [editOrganismId, setEditOrganismId] = useState('');
  const [editOrganismForm, setEditOrganismForm] = useState<OrganismFormState>({ ...EMPTY_ORGANISM_FORM });
  const [editStrainId, setEditStrainId] = useState('');
  const [editStrainForm, setEditStrainForm] = useState<StrainFormState>({ ...EMPTY_STRAIN_FORM });
  const [referenceStrainId, setReferenceStrainId] = useState('');
  const [referenceKind, setReferenceKind] = useState<GenomeReferenceKind>('FASTA');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceInventory, setReferenceInventory] = useState<GenomeReferenceRecord[]>([]);
  const [blastStatus, setBlastStatus] = useState<BlastDatabaseStatus | null>(null);
  const [mayaFile, setMayaFile] = useState<File | null>(null);
  const [status, setStatus] = useState<StatusState>({ type: 'idle', message: '' });
  const [loadingRegistry, setLoadingRegistry] = useState(true);

  const [mayaForm, setMayaForm] = useState({
    organismId: '', strainId: '', toolName: 'abricate', runStatus: 'completed', version: '',
    tableName: '', summary: '{\n  "total_hits": 0\n}', warnings: '', errors: '',
  });

  const adminHeaders = useCallback((json = true) => ({
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);

  const loadBlastStatus = useCallback(async () => {
    const response = await fetch(apiPath('/admin/blast-database'), { headers: adminHeaders(false), cache: 'no-store' });
    if (response.ok) setBlastStatus(await response.json() as BlastDatabaseStatus);
  }, [adminHeaders]);

  const fetchData = useCallback(async () => {
    setLoadingRegistry(true);
    try {
      const [adminRes, orgRes, strainRes] = await Promise.all([
        fetch(apiPath('/admin/me'), { headers: adminHeaders(false), cache: 'no-store' }),
        fetch(apiPath('/organisms'), { cache: 'no-store' }),
        fetch(apiPath('/strains'), { cache: 'no-store' }),
      ]);
      if (!adminRes.ok) throw new Error('Your admin session is not valid. Please sign in again.');
      if (!orgRes.ok || !strainRes.ok) throw new Error('Failed to load organism and strain records.');

      const orgData = await orgRes.json() as OrganismRecord[];
      const strainData = await strainRes.json() as StrainRecord[];
      setOrganisms(orgData);
      setStrains(strainData);

      const firstOrgId = orgData[0]?.id?.toString() || '';
      const firstStrainId = strainData[0]?.id?.toString() || '';
      setStrainForm((current) => current.organismId ? current : { ...current, organismId: firstOrgId });
      setEditOrganismId((current) => current && orgData.some((item) => item.id.toString() === current) ? current : firstOrgId);
      setEditStrainId((current) => current && strainData.some((item) => item.id.toString() === current) ? current : firstStrainId);
      setReferenceStrainId((current) => current && strainData.some((item) => item.id.toString() === current) ? current : firstStrainId);
      setMayaForm((current) => ({
        ...current,
        organismId: current.organismId || firstOrgId,
        strainId: current.strainId || strainData.find((item) => item.organismId.toString() === (current.organismId || firstOrgId))?.id.toString() || '',
      }));
      await loadBlastStatus();
    } catch (error) {
      console.error('Failed to fetch admin data', error);
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load admin data.' });
    } finally {
      setLoadingRegistry(false);
    }
  }, [adminHeaders, loadBlastStatus]);

  useEffect(() => {
    if (!isAdmin) return;
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData, isAdmin]);

  useEffect(() => {
    const organism = organisms.find((item) => item.id.toString() === editOrganismId);
    if (organism) setEditOrganismForm(organismToForm(organism));
  }, [editOrganismId, organisms]);

  useEffect(() => {
    const strain = strains.find((item) => item.id.toString() === editStrainId);
    if (strain) setEditStrainForm(strainToForm(strain));
  }, [editStrainId, strains]);

  const loadReferenceInventory = useCallback(async () => {
    if (!referenceStrainId || !isAdmin) {
      setReferenceInventory([]);
      return;
    }
    const response = await fetch(apiPath(`/admin/strains/${referenceStrainId}/genome-references`), {
      headers: adminHeaders(false),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as { references?: GenomeReferenceRecord[]; error?: string };
    if (!response.ok) throw new Error(data.error || 'Failed to load genome references');
    setReferenceInventory(data.references || []);
  }, [adminHeaders, isAdmin, referenceStrainId]);

  useEffect(() => {
    void loadReferenceInventory().catch((error) => {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to load genome references.' });
    });
  }, [loadReferenceInventory]);

  const submitJson = async (url: string, method: 'POST' | 'PATCH', body: unknown, successMessage: string) => {
    setStatus({ type: 'loading', message: 'Saving validated changes...' });
    const response = await fetch(apiPath(url), {
      method,
      headers: adminHeaders(),
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}`);
    setStatus({ type: 'success', message: successMessage });
    await fetchData();
    return data;
  };

  const handleAddOrganism = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await submitJson('/organisms', 'POST', orgForm, `${orgForm.scientificName} added to the public organism registry.`);
      setOrgForm({ ...EMPTY_ORGANISM_FORM });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to add organism.' });
    }
  };

  const handleAddStrain = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await submitJson('/strains', 'POST', strainForm, `${strainForm.strainName} registered with genome metadata.`);
      setStrainForm((current) => ({ ...EMPTY_STRAIN_FORM, organismId: current.organismId }));
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to add strain.' });
    }
  };

  const handleUpdateOrganism = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editOrganismId) return;
    try {
      await submitJson(`/admin/organisms/${editOrganismId}/metadata`, 'PATCH', editOrganismForm, 'Published organism metadata updated and audit logged.');
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update organism metadata.' });
    }
  };

  const handleUpdateStrain = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editStrainId) return;
    try {
      await submitJson(`/admin/strains/${editStrainId}/metadata`, 'PATCH', editStrainForm, 'Published strain metadata updated and audit logged.');
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update strain metadata.' });
    }
  };

  const handleReferenceFile = (file?: File) => {
    if (!file) return;
    const valid = referenceKind === 'FASTA' ? /\.(fa|fna|fasta)$/i.test(file.name) : /\.(gff|gff3)$/i.test(file.name);
    if (!valid) {
      setReferenceFile(null);
      setStatus({ type: 'error', message: referenceKind === 'FASTA' ? 'FASTA files must use .fa, .fna, or .fasta.' : 'GFF3 files must use .gff or .gff3.' });
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setReferenceFile(null);
      setStatus({ type: 'error', message: 'Genome reference files must be 25 MB or smaller.' });
      return;
    }
    setReferenceFile(file);
    setStatus({ type: 'idle', message: '' });
  };

  const handleReferenceUpload = async () => {
    if (!referenceStrainId || !referenceFile) return;
    setStatus({ type: 'loading', message: `Validating and publishing ${referenceKind}...` });
    try {
      const response = await fetch(apiPath(`/admin/strains/${referenceStrainId}/genome-references`), {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ kind: referenceKind, fileName: referenceFile.name, fileContent: await referenceFile.text() }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || 'Reference upload failed');
      setReferenceFile(null);
      setStatus({ type: 'success', message: data.message || `${referenceKind} validated and published.` });
      await Promise.all([loadReferenceInventory(), loadBlastStatus(), fetchData()]);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish genome reference.' });
    }
  };

  const handleBlastRebuild = async () => {
    setStatus({ type: 'loading', message: 'Preparing NCBI BLAST database from approved FASTA references...' });
    setBlastStatus((current) => current ? { ...current, state: 'BUILDING' } : current);
    try {
      const response = await fetch(apiPath('/admin/blast-database/rebuild'), { method: 'POST', headers: adminHeaders() });
      const data = await response.json().catch(() => ({})) as { error?: string; message?: string; database?: BlastDatabaseStatus };
      if (!response.ok) throw new Error(data.error || 'BLAST database build failed');
      if (data.database) setBlastStatus(data.database);
      setStatus({ type: 'success', message: data.message || 'BLAST database is ready.' });
    } catch (error) {
      await loadBlastStatus();
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to prepare BLAST database.' });
    }
  };

  const handleMayaUpload = async () => {
    if (!mayaForm.organismId) return;
    setStatus({ type: 'loading', message: 'Ingesting MAYA result...' });
    try {
      await submitJson('/admin/maya-results', 'POST', {
        organismId: mayaForm.organismId,
        strainId: mayaForm.strainId || null,
        toolName: mayaForm.toolName,
        status: mayaForm.runStatus,
        version: mayaForm.version,
        summary: mayaForm.summary,
        tableName: mayaForm.tableName || `${mayaForm.toolName} MAYA output`,
        fileName: mayaFile?.name || '',
        fileContent: mayaFile ? await mayaFile.text() : '',
        warnings: mayaForm.warnings,
        errors: mayaForm.errors,
      }, `${mayaForm.toolName} MAYA results ingested.`);
      setMayaFile(null);
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to ingest MAYA result.' });
    }
  };

  const selectedReferenceStrain = useMemo(() => strains.find((item) => item.id.toString() === referenceStrainId) || null, [referenceStrainId, strains]);

  if (sessionStatus === 'loading') return <PortalState icon={RefreshCw} title="Checking admin session" body="Verifying the protected ingestion workspace." spinning />;
  if (!session) return <PortalState icon={Lock} title="Admin sign in required" body="This ingestion workspace is restricted to authenticated administrators." action={<button onClick={() => signIn()} className="min-h-11 rounded-md bg-orange-500 px-5 text-sm font-black text-white">Sign in</button>} />;
  if (!isAdmin) return <PortalState icon={AlertCircle} title="Admin access denied" body="Your account is authenticated but does not have the ADMIN role required for direct ingestion and publication." action={<button onClick={() => signOut()} className="min-h-11 rounded-md bg-[#0B1B3A] px-5 text-sm font-black text-white">Sign out</button>} />;

  return (
    <div className="min-h-screen bg-[#f4f7fa] text-[#0B1B3A]">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-l-4 border-orange-500 bg-[#07172f] p-6 text-white shadow-sm lg:flex lg:items-center lg:justify-between lg:gap-8">
          <div>
            <div className="flex items-center gap-3"><Layers3 className="text-orange-400" size={27} /><h1 className="text-2xl font-black sm:text-3xl">Admin Ingestion Workspace</h1></div>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">Manage taxonomic records, published genome metadata, validated reference files, BLAST preparation, and MAYA outputs without breaking linked scientific data.</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 lg:mt-0">
            <Link href="/admin/uploads" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-4 text-xs font-black text-white hover:border-orange-300"><UsersRound size={16} /> Review Queue</Link>
            <Link href="/admin/cockpit" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 px-4 text-xs font-black text-white hover:border-teal-300"><ServerCog size={16} /> Admin Cockpit</Link>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-500/15 px-4 text-xs font-black text-teal-200"><ShieldCheck size={16} /> Admin verified</span>
          </div>
        </header>

        <section className="mt-4 flex gap-3 border border-orange-200 bg-orange-50 p-4 text-sm font-semibold leading-6 text-orange-950">
          <Lock className="mt-0.5 shrink-0 text-orange-600" size={18} />
          <p><strong>Approval boundary:</strong> user uploads remain private in the review queue. Only an administrator can approve and publish them. This workspace performs direct administrator-authorized changes to already published registry data.</p>
        </section>

        <div className="mt-5 lg:hidden">
          <SelectInput label="Ingestion workflow" value={activeTab} onChange={(value) => setActiveTab(value as AdminTabId)} options={ADMIN_TABS.map((tab) => ({ value: tab.id, label: tab.label }))} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)] lg:items-start">
          <aside className="sticky top-24 hidden overflow-hidden bg-[#07172f] text-white lg:block">
            <div className="border-b border-white/10 px-5 py-4"><p className="text-xs font-black text-teal-300">Workflows</p><p className="mt-1 text-xs font-semibold text-slate-400">Select an operation</p></div>
            <nav aria-label="Admin ingestion workflows" className="p-2">
              {ADMIN_TABS.map((tab) => <WorkflowButton key={tab.id} tab={tab} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} />)}
            </nav>
            <div className="border-t border-white/10 p-3">
              <Link href="/submit-organism" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white"><UploadCloud size={16} /> View user submission form</Link>
              <Link href="/admin/audit-logs" className="flex min-h-11 items-center gap-3 rounded-md px-3 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white"><History size={16} /> Audit logs</Link>
            </div>
          </aside>

          <main className="min-w-0 border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 md:px-7">
              <p className="text-xs font-black text-orange-600">{ADMIN_TABS.find((tab) => tab.id === activeTab)?.label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">{ADMIN_TABS.find((tab) => tab.id === activeTab)?.description}</p>
            </div>

            <div className="p-5 md:p-7">
              {activeTab === 'organism' && (
                <form onSubmit={handleAddOrganism} className="space-y-6">
                  <SectionTitle title="Create a new organism" subtitle="Creates a public taxonomic parent record through this administrator-authorized workflow." />
                  <OrganismFields form={orgForm} onChange={(patch) => setOrgForm((current) => ({ ...current, ...patch }))} />
                  <PrimaryButton label="Create organism record" loading={status.type === 'loading'} />
                </form>
              )}

              {activeTab === 'strain' && (
                <form onSubmit={handleAddStrain} className="space-y-6">
                  <SectionTitle title="Register a genome or isolate" subtitle="Attach source, accession, surveillance, assembly, and reusable metadata to an existing organism." />
                  <StrainFields form={strainForm} organisms={organisms} includeOrganism onChange={(patch) => setStrainForm((current) => ({ ...current, ...patch }))} />
                  <PrimaryButton label="Register genome metadata" loading={status.type === 'loading'} />
                </form>
              )}

              {activeTab === 'metadata' && (
                <div className="space-y-6">
                  <SectionTitle title="Edit published registry data" subtitle="Current values are loaded before editing. Updates preserve linked strains, MAYA results, references, and tool records." />
                  <div className="inline-flex border border-slate-200 bg-slate-50 p-1">
                    <ModeButton active={registryMode === 'organism'} onClick={() => setRegistryMode('organism')} label="Organism" />
                    <ModeButton active={registryMode === 'strain'} onClick={() => setRegistryMode('strain')} label="Genome / strain" />
                  </div>
                  {registryMode === 'organism' ? (
                    <form onSubmit={handleUpdateOrganism} className="space-y-6">
                      <SelectInput label="Published organism" value={editOrganismId} onChange={setEditOrganismId} options={organisms.map((item) => ({ value: item.id.toString(), label: item.scientificName }))} />
                      {editOrganismId ? <OrganismFields form={editOrganismForm} onChange={(patch) => setEditOrganismForm((current) => ({ ...current, ...patch }))} /> : <EmptyState text="No published organism records are available." />}
                      <PrimaryButton label="Update organism metadata" loading={status.type === 'loading'} disabled={!editOrganismId} />
                    </form>
                  ) : (
                    <form onSubmit={handleUpdateStrain} className="space-y-6">
                      <SelectInput label="Published genome / strain" value={editStrainId} onChange={setEditStrainId} options={strains.map((item) => ({ value: item.id.toString(), label: `${item.strainName} | ${item.organism?.scientificName || 'Unknown organism'}` }))} />
                      {editStrainId ? <StrainFields form={editStrainForm} organisms={organisms} onChange={(patch) => setEditStrainForm((current) => ({ ...current, ...patch }))} /> : <EmptyState text="No published genome or strain records are available." />}
                      <PrimaryButton label="Update strain metadata" loading={status.type === 'loading'} disabled={!editStrainId} />
                    </form>
                  )}
                  <div className="border-t border-slate-200 pt-5"><Link href="/admin/cockpit#delete-management" className="inline-flex min-h-11 items-center gap-2 text-sm font-black text-red-700 hover:text-red-900">Destructive actions remain in Delete Management <ArrowRight size={15} /></Link></div>
                </div>
              )}

              {activeTab === 'references' && (
                <div className="space-y-7">
                  <SectionTitle title="Genome references and BLAST preparation" subtitle="Validated FASTA and GFF3 files feed JBrowse/IGV. BLAST indexes are prepared server-side from approved FASTA." />
                  <SelectInput label="Published genome / strain" value={referenceStrainId} onChange={setReferenceStrainId} options={strains.map((item) => ({ value: item.id.toString(), label: `${item.strainName} | ${item.organism?.scientificName || 'Unknown organism'}` }))} />

                  {selectedReferenceStrain ? (
                    <div className="grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div><p className="text-sm font-black">{selectedReferenceStrain.organism?.scientificName || 'Unknown organism'} / {selectedReferenceStrain.strainName}</p><p className="mt-1 text-xs font-semibold text-slate-500">Assembly: {selectedReferenceStrain.assemblyAccession || 'N/A'} · {referenceInventory.length} managed reference files</p></div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/organisms/${selectedReferenceStrain.organismId}/genome?strain=${selectedReferenceStrain.id}&tool=jbrowse`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-black hover:border-orange-400">Open JBrowse <ExternalLink size={14} /></Link>
                        <Link href={`/organisms/${selectedReferenceStrain.organismId}/genome?strain=${selectedReferenceStrain.id}&tool=blast`} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-black hover:border-teal-500">Open BLAST <ExternalLink size={14} /></Link>
                      </div>
                    </div>
                  ) : <EmptyState text="Select a published strain before managing references." />}

                  <ReferenceInventory files={referenceInventory} loading={loadingRegistry} />

                  <section className="border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-black">Upload or replace a reference</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Uploading the same kind replaces only that strain reference after validation. FASTA automatically generates its matching FAI index.</p>
                    <div className="mt-5 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
                      <SelectInput label="Reference kind" value={referenceKind} onChange={(value) => { setReferenceKind(value as GenomeReferenceKind); setReferenceFile(null); }} options={[{ value: 'FASTA', label: 'FASTA nucleotide reference' }, { value: 'GFF3', label: 'GFF3 annotation' }]} />
                      <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">Reference file</span><input type="file" accept={referenceKind === 'FASTA' ? '.fa,.fna,.fasta' : '.gff,.gff3'} onChange={(event) => handleReferenceFile(event.target.files?.[0])} className="block min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-black" /></label>
                      <button type="button" onClick={handleReferenceUpload} disabled={!referenceFile || !referenceStrainId || status.type === 'loading'} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-orange-500 px-5 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><UploadCloud size={17} /> Validate & publish</button>
                    </div>
                    {referenceFile && <p className="mt-3 text-xs font-semibold text-slate-500">Selected: {referenceFile.name} · {formatBytes(referenceFile.size)}</p>}
                  </section>

                  <BlastDatabasePanel status={blastStatus} onRefresh={loadBlastStatus} onRebuild={handleBlastRebuild} loading={status.type === 'loading'} />
                </div>
              )}

              {activeTab === 'maya' && (
                <div className="space-y-6">
                  <SectionTitle title="Ingest MAYA results" subtitle="Upload a TSV, CSV, TXT, or JSON result table and normalized summary metadata for the selected organism." />
                  <div className="grid gap-5 md:grid-cols-2">
                    <SelectInput label="Target organism" value={mayaForm.organismId} onChange={(value) => setMayaForm((current) => ({ ...current, organismId: value, strainId: '' }))} options={organisms.map((item) => ({ value: item.id.toString(), label: item.scientificName }))} />
                    <SelectInput label="Target genome / strain" value={mayaForm.strainId} onChange={(value) => setMayaForm((current) => ({ ...current, strainId: value }))} options={[{ value: '', label: 'Organism-level result' }, ...strains.filter((item) => !mayaForm.organismId || item.organismId.toString() === mayaForm.organismId).map((item) => ({ value: item.id.toString(), label: item.strainName }))]} />
                    <SelectInput label="MAYA tool" value={mayaForm.toolName} onChange={(value) => setMayaForm((current) => ({ ...current, toolName: value }))} options={MAYA_TOOLS.map((tool) => ({ value: tool, label: tool }))} />
                    <SelectInput label="Run status" value={mayaForm.runStatus} onChange={(value) => setMayaForm((current) => ({ ...current, runStatus: value }))} options={['completed', 'warning', 'partial', 'failed', 'pending', 'not_available'].map((item) => ({ value: item, label: item }))} />
                    <TextInput label="Tool version" value={mayaForm.version} onChange={(value) => setMayaForm((current) => ({ ...current, version: value }))} />
                    <TextInput label="Table name" value={mayaForm.tableName} onChange={(value) => setMayaForm((current) => ({ ...current, tableName: value }))} />
                  </div>
                  <TextArea label="Summary JSON" value={mayaForm.summary} onChange={(value) => setMayaForm((current) => ({ ...current, summary: value }))} rows={7} mono />
                  <button type="button" onClick={() => mayaFileInputRef.current?.click()} className="flex min-h-24 w-full items-center gap-4 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-left hover:border-orange-400">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white text-orange-600"><FileText size={22} /></span>
                    <span><span className="block text-sm font-black">{mayaFile?.name || 'Attach optional MAYA output file'}</span><span className="mt-1 block text-xs font-semibold text-slate-500">TSV, CSV, TXT, or JSON · 5 MB maximum</span></span>
                  </button>
                  <input ref={mayaFileInputRef} type="file" className="sr-only" accept=".tsv,.csv,.txt,.json" onChange={(event) => setMayaFile(event.target.files?.[0] || null)} />
                  <TextArea label="Warnings" value={mayaForm.warnings} onChange={(value) => setMayaForm((current) => ({ ...current, warnings: value }))} rows={3} />
                  <TextArea label="Errors" value={mayaForm.errors} onChange={(value) => setMayaForm((current) => ({ ...current, errors: value }))} rows={3} />
                  <button type="button" onClick={handleMayaUpload} disabled={status.type === 'loading' || !mayaForm.organismId} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0B1B3A] px-5 text-sm font-black text-white hover:bg-orange-500 disabled:opacity-50"><UploadCloud size={17} />{status.type === 'loading' ? 'Processing...' : 'Ingest MAYA result'}</button>
                </div>
              )}

              {status.type !== 'idle' && (
                <div aria-live="polite" className={`mt-6 flex items-start gap-3 rounded-md border p-4 text-sm font-bold ${status.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                  {status.type === 'error' ? <AlertCircle className="shrink-0" size={19} /> : status.type === 'loading' ? <RefreshCw className="shrink-0 animate-spin" size={19} /> : <CheckCircle2 className="shrink-0" size={19} />}
                  {status.message}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function WorkflowButton({ tab, active, onClick }: { tab: AdminTab; active: boolean; onClick: () => void }) {
  const Icon = tab.icon;
  return <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={`flex w-full gap-3 rounded-md border-l-4 px-3 py-3 text-left transition ${active ? 'border-orange-500 bg-white/10 text-white' : 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'}`}><Icon className="mt-0.5 shrink-0" size={18} /><span><span className="block text-sm font-black">{tab.label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-400">{tab.description}</span></span></button>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="border-b border-slate-200 pb-5"><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{subtitle}</p></div>;
}

function OrganismFields({ form, onChange }: { form: OrganismFormState; onChange: (patch: Partial<OrganismFormState>) => void }) {
  return <><div className="grid gap-5 md:grid-cols-2"><TextInput label="Scientific name" value={form.scientificName} onChange={(value) => onChange({ scientificName: value })} required /><TextInput label="Display name" value={form.displayName} onChange={(value) => onChange({ displayName: value })} /><TextInput label="NCBI taxonomy ID" value={form.taxonomyId} onChange={(value) => onChange({ taxonomyId: value })} /><TextInput label="Domain" value={form.domain} onChange={(value) => onChange({ domain: value })} /><TextInput label="Phylum" value={form.phylum} onChange={(value) => onChange({ phylum: value })} /><TextInput label="Class" value={form.className} onChange={(value) => onChange({ className: value })} /><TextInput label="Order" value={form.orderName} onChange={(value) => onChange({ orderName: value })} /><TextInput label="Family" value={form.family} onChange={(value) => onChange({ family: value })} /><TextInput label="Genus" value={form.genus} onChange={(value) => onChange({ genus: value })} /><TextInput label="Species" value={form.species} onChange={(value) => onChange({ species: value })} /></div><TextArea label="Description and public notes" value={form.description} onChange={(value) => onChange({ description: value })} rows={4} /></>;
}

function StrainFields({ form, organisms, includeOrganism = false, onChange }: { form: StrainFormState; organisms: OrganismRecord[]; includeOrganism?: boolean; onChange: (patch: Partial<StrainFormState>) => void }) {
  return <><div className="grid gap-5 md:grid-cols-2">{includeOrganism && <SelectInput label="Parent organism" value={form.organismId} onChange={(value) => onChange({ organismId: value })} options={organisms.map((item) => ({ value: item.id.toString(), label: item.scientificName }))} />}<TextInput label="Strain name" value={form.strainName} onChange={(value) => onChange({ strainName: value })} required /><TextInput label="Isolate name" value={form.isolateName} onChange={(value) => onChange({ isolateName: value })} /><TextInput label="Strain code" value={form.strainCode} onChange={(value) => onChange({ strainCode: value })} /><TextInput label="BioSample accession" value={form.biosampleAccession} onChange={(value) => onChange({ biosampleAccession: value })} /><TextInput label="BioProject accession" value={form.bioprojectAccession} onChange={(value) => onChange({ bioprojectAccession: value })} /><TextInput label="Assembly accession" value={form.assemblyAccession} onChange={(value) => onChange({ assemblyAccession: value })} /><TextInput label="Assembly status" value={form.genomeStatus} onChange={(value) => onChange({ genomeStatus: value })} /><TextInput label="Genome size" value={form.genomeSize} onChange={(value) => onChange({ genomeSize: value })} /><TextInput label="GC content" value={form.gcContent} onChange={(value) => onChange({ gcContent: value })} /><TextInput label="Source type" value={form.sourceType} onChange={(value) => onChange({ sourceType: value })} /><TextInput label="Host" value={form.host} onChange={(value) => onChange({ host: value })} /><TextInput label="Country" value={form.country} onChange={(value) => onChange({ country: value })} /><TextInput label="State" value={form.state} onChange={(value) => onChange({ state: value })} /><TextInput label="City" value={form.city} onChange={(value) => onChange({ city: value })} /><TextInput label="Collection date" value={form.collectionDate} onChange={(value) => onChange({ collectionDate: value })} /><TextInput label="Location description" value={form.locationText} onChange={(value) => onChange({ locationText: value })} /><TextInput label="Latitude" value={form.latitude} onChange={(value) => onChange({ latitude: value })} /><TextInput label="Longitude" value={form.longitude} onChange={(value) => onChange({ longitude: value })} /><TextInput label="Repository link" value={form.repoLink} onChange={(value) => onChange({ repoLink: value })} /><SelectInput label="Surveillance scope" value={form.surveillanceScope} onChange={(value) => onChange({ surveillanceScope: value })} options={[{ value: 'NATIONAL', label: 'National surveillance' }, { value: 'GLOBAL', label: 'Global surveillance' }]} /><SelectInput label="Evidence basis" value={form.evidenceBasis} onChange={(value) => onChange({ evidenceBasis: value })} options={[{ value: 'GENOTYPIC', label: 'Genotypic' }, { value: 'PHENOTYPIC', label: 'Phenotypic' }, { value: 'COMBINED', label: 'Combined' }, { value: 'NOT_REPORTED', label: 'Not reported' }]} /><TextInput label="Submitting institution" value={form.submittingInstitution} onChange={(value) => onChange({ submittingInstitution: value })} /><TextInput label="Data source or programme" value={form.dataSource} onChange={(value) => onChange({ dataSource: value })} /><TextInput label="Last verified date" value={form.lastVerifiedAt} onChange={(value) => onChange({ lastVerifiedAt: value })} /></div><TextArea label="Data use limitations" value={form.dataUseLimitations} onChange={(value) => onChange({ dataUseLimitations: value })} rows={3} /><TextArea label="Additional metadata JSON" value={form.metadata} onChange={(value) => onChange({ metadata: value })} rows={6} mono /></>;
}

function ReferenceInventory({ files, loading }: { files: GenomeReferenceRecord[]; loading: boolean }) {
  return <section><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-black">Managed reference files</h3><span className="text-xs font-bold text-slate-500">{files.length} files</span></div><div className="overflow-x-auto border border-slate-200"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-4 py-3 font-black">Kind</th><th className="px-4 py-3 font-black">File</th><th className="px-4 py-3 font-black">Size</th><th className="px-4 py-3 font-black">Validation</th><th className="px-4 py-3 font-black">Checksum</th><th className="px-4 py-3 font-black">Status</th><th className="px-4 py-3 font-black">Updated</th></tr></thead><tbody className="divide-y divide-slate-200">{files.map((file) => <tr key={file.id}><td className="px-4 py-3 font-black text-orange-700">{file.kind}</td><td className="max-w-52 truncate px-4 py-3 font-semibold" title={file.originalFileName}>{file.originalFileName}</td><td className="px-4 py-3 font-mono">{formatBytes(file.fileSizeBytes)}</td><td className="px-4 py-3 font-semibold text-slate-600">{referenceValidation(file)}</td><td className="px-4 py-3 font-mono text-slate-500" title={file.checksumSha256}>{file.checksumSha256.slice(0, 12)}...</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 font-black ${file.status === 'PUBLISHED' && file.isPublic ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{file.status}</span></td><td className="px-4 py-3 text-slate-500">{new Date(file.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table>{!files.length && <EmptyState text={loading ? 'Loading reference inventory...' : 'No FASTA or GFF3 files are published for this strain.'} />}</div></section>;
}

function BlastDatabasePanel({ status, onRefresh, onRebuild, loading }: { status: BlastDatabaseStatus | null; onRefresh: () => Promise<void>; onRebuild: () => Promise<void>; loading: boolean }) {
  const state = status?.state || 'MISSING';
  const canBuild = Boolean(status?.sourceReferenceCount);
  return <section className="border-t border-slate-200 pt-6"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><div className="flex items-center gap-3"><HardDrive className="text-teal-700" size={22} /><h3 className="text-lg font-black">NCBI BLAST database</h3><span className={`rounded-md px-2 py-1 text-[10px] font-black ${state === 'READY' ? 'bg-emerald-50 text-emerald-700' : state === 'BUILDING' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{state}</span></div><p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">Prepared server-side from validated, published FASTA records. Prebuilt binary database uploads are intentionally rejected because executing untrusted indexes would weaken the production security boundary.</p></div><button type="button" onClick={() => void onRefresh()} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-black hover:border-teal-500"><RefreshCw size={14} /> Refresh</button></div><dl className="mt-5 grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-4"><DatabaseMetric label="Approved FASTA" value={status ? String(status.sourceReferenceCount) : 'N/A'} /><DatabaseMetric label="Indexed references" value={status ? String(status.indexedReferenceCount) : 'N/A'} /><DatabaseMetric label="Indexed bases" value={status?.totalBases === null || status?.totalBases === undefined ? 'N/A' : status.totalBases.toLocaleString()} /><DatabaseMetric label="Last built" value={status?.builtAt ? new Date(status.builtAt).toLocaleString() : 'N/A'} /></dl><button type="button" onClick={() => void onRebuild()} disabled={!canBuild || loading || state === 'BUILDING'} className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-black text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><ServerCog size={17} />{state === 'BUILDING' ? 'Building database...' : 'Prepare BLAST database'}</button>{!canBuild && <p className="mt-3 text-xs font-semibold text-amber-700">Publish at least one validated FASTA reference before preparing the BLAST database.</p>}</section>;
}

function DatabaseMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 bg-white p-4"><dt className="text-[10px] font-black text-slate-500">{label}</dt><dd className="mt-2 break-words font-mono text-sm font-black">{value}</dd></div>;
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button type="button" onClick={onClick} className={`min-h-10 rounded-md px-4 text-xs font-black ${active ? 'bg-[#0B1B3A] text-white' : 'text-slate-600 hover:bg-white'}`}>{label}</button>;
}

function TextInput({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}{required && <span className="text-red-600"> *</span>}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15" /></label>;
}

function TextArea({ label, value, onChange, rows = 4, mono = false }: { label: string; value: string; onChange: (value: string) => void; rows?: number; mono?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 ${mono ? 'font-mono' : ''}`} /></label>;
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="mb-2 block text-xs font-black text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15">{!options.length && <option value="">No records available</option>}{options.map((option) => <option key={option.value || option.label} value={option.value}>{option.label}</option>)}</select></label>;
}

function PrimaryButton({ label, loading, disabled = false }: { label: string; loading: boolean; disabled?: boolean }) {
  return <button type="submit" disabled={loading || disabled} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0B1B3A] px-5 text-sm font-black text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><RefreshCw className="animate-spin" size={17} /> Saving...</> : label}</button>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-8 text-center text-sm font-semibold text-slate-500">{text}</div>;
}

function PortalState({ icon: Icon, title, body, action, spinning = false }: { icon: LucideIcon; title: string; body: string; action?: React.ReactNode; spinning?: boolean }) {
  return <main className="flex min-h-[70vh] items-center justify-center bg-[#f4f7fa] p-6 text-[#0B1B3A]"><div className="max-w-lg border border-slate-200 bg-white p-8 text-center shadow-sm"><Icon className={`mx-auto text-orange-500 ${spinning ? 'animate-spin' : ''}`} size={38} /><h1 className="mt-5 text-2xl font-black">{title}</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{body}</p>{action && <div className="mt-6">{action}</div>}</div></main>;
}

function organismToForm(record: OrganismRecord): OrganismFormState {
  return { scientificName: text(record.scientificName), displayName: text(record.displayName), taxonomyId: text(record.taxonomyId), domain: text(record.domain) || 'Bacteria', phylum: text(record.phylum), className: text(record.className), orderName: text(record.orderName), family: text(record.family), genus: text(record.genus), species: text(record.species), description: text(record.description) };
}

function strainToForm(record: StrainRecord): StrainFormState {
  return { organismId: String(record.organismId), strainName: text(record.strainName), isolateName: text(record.isolateName), strainCode: text(record.strainCode), sourceType: text(record.sourceType), host: text(record.host), country: text(record.country), state: text(record.state), city: text(record.city), collectionDate: dateValue(record.collectionDate), locationText: text(record.locationText), latitude: text(record.latitude), longitude: text(record.longitude), biosampleAccession: text(record.biosampleAccession), bioprojectAccession: text(record.bioprojectAccession), assemblyAccession: text(record.assemblyAccession), genomeStatus: text(record.genomeStatus), genomeSize: text(record.genomeSize), gcContent: text(record.gcContent), repoLink: text(record.repoLink), surveillanceScope: text(record.surveillanceScope) || 'GLOBAL', evidenceBasis: text(record.evidenceBasis) || 'GENOTYPIC', submittingInstitution: text(record.submittingInstitution), dataSource: text(record.dataSource), dataUseLimitations: text(record.dataUseLimitations), lastVerifiedAt: dateValue(record.lastVerifiedAt), metadata: JSON.stringify(record.metadata || {}, null, 2) };
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function dateValue(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '';
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return 'N/A';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function referenceValidation(file: GenomeReferenceRecord) {
  const validation = file.validation || {};
  if (file.kind === 'FASTA') return validation.sequenceCount ? `${validation.sequenceCount} sequences` : 'Validated FASTA';
  if (file.kind === 'FAI') return 'Generated index';
  return validation.featureCount ? `${validation.featureCount} features` : 'Validated GFF3';
}
