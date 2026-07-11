'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Dna, FileCode2, FilePlus2, Globe2, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { apiPath } from '../../lib/api-client';

type StatusState = {
  type: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

type MayaAttachment = {
  toolName: string;
  toolVersion: string;
  file: File;
};

type GenomeReferenceAttachments = Partial<Record<'FASTA' | 'GFF3', File>>;

const MAYA_TOOLS = [
  'abricate', 'antismash', 'barrnap', 'busco', 'checkm', 'diamond', 'fastp', 'fastqc',
  'fastqc_trimmed', 'hmmer', 'islandpath', 'jellyfish', 'kofam', 'minced', 'multiqc',
  'prokka', 'quast', 'rnlst', 'spades', 'trf', 'trnascan',
];

const MAX_RESULT_FILE_BYTES = 5 * 1024 * 1024;
const RESULT_FILE_PATTERN = /\.(tsv|csv|json|txt)$/i;
const MAX_GENOME_REFERENCE_BYTES = 25 * 1024 * 1024;
const REFERENCE_FILE_PATTERNS = {
  FASTA: /\.(fa|fna|fasta)$/i,
  GFF3: /\.(gff|gff3)$/i,
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
  surveillanceScope: 'NATIONAL',
  evidenceBasis: 'GENOTYPIC',
  submittingInstitution: '',
  dataSource: '',
  dataUseLimitations: '',
  lastVerifiedAt: '',
};

function initialForm(surveillanceMode: boolean) {
  return {
    ...DEFAULT_FORM,
    country: surveillanceMode ? '' : 'India',
    surveillanceScope: surveillanceMode ? 'GLOBAL' : 'NATIONAL',
  };
}

export function OrganismSubmissionForm({ surveillanceMode = false }: { surveillanceMode?: boolean }) {
  const { data: session } = useSession();
  const [form, setForm] = useState(() => initialForm(surveillanceMode));
  const [status, setStatus] = useState<StatusState>({ type: 'idle', message: '' });
  const [mayaAttachments, setMayaAttachments] = useState<MayaAttachment[]>([]);
  const [genomeReferences, setGenomeReferences] = useState<GenomeReferenceAttachments>({});
  const [pendingTool, setPendingTool] = useState('abricate');
  const [pendingToolVersion, setPendingToolVersion] = useState('');

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.user?.accessToken || ''}`,
  }), [session?.user?.accessToken]);
  const referenceAttachments = useMemo(() => (
    Object.entries(genomeReferences).filter((entry): entry is ['FASTA' | 'GFF3', File] => Boolean(entry[1]))
  ), [genomeReferences]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.user?.accessToken) {
      setStatus({ type: 'error', message: 'Please sign in before submitting surveillance data.' });
      return;
    }
    setStatus({ type: 'loading', message: 'Submitting metadata, genome references, and MAYA files for admin review...' });

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
      const uploadId = data.upload?.id as string | undefined;
      if (!uploadId) throw new Error('Submission was created without a valid review identifier.');

      const failedFiles: string[] = [];
      for (const [kind, file] of referenceAttachments) {
        try {
          const fileResponse = await fetch(apiPath(`/organism-uploads/${uploadId}/genome-references`), {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ kind, fileName: file.name, fileContent: await file.text() }),
          });
          if (!fileResponse.ok) {
            const fileError = await fileResponse.json().catch(() => ({}));
            throw new Error(fileError.error || 'Genome reference upload failed');
          }
        } catch {
          failedFiles.push(file.name);
        }
      }
      for (const attachment of mayaAttachments) {
        try {
          const fileContent = await attachment.file.text();
          const fileResponse = await fetch(apiPath(`/organism-uploads/${uploadId}/maya-files`), {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
              toolName: attachment.toolName,
              toolVersion: attachment.toolVersion,
              fileName: attachment.file.name,
              fileContent,
            }),
          });
          if (!fileResponse.ok) {
            const fileError = await fileResponse.json().catch(() => ({}));
            throw new Error(fileError.error || 'File upload failed');
          }
        } catch {
          failedFiles.push(attachment.file.name);
        }
      }

      setForm(initialForm(surveillanceMode));
      setMayaAttachments([]);
      setGenomeReferences({});
      if (failedFiles.length) {
        setStatus({ type: 'error', message: `Metadata submission ${uploadId} was created, but these MAYA files were not attached: ${failedFiles.join(', ')}. Open the submission detail before review to retry.` });
      } else {
        const referenceCount = referenceAttachments.length;
        setStatus({ type: 'success', message: `Submission ${uploadId} received. It remains private until admin approval${referenceCount ? `, with ${referenceCount} genome reference file${referenceCount === 1 ? '' : 's'}` : ''}${mayaAttachments.length ? ` and ${mayaAttachments.length} MAYA file${mayaAttachments.length === 1 ? '' : 's'}` : ''}.` });
      }
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Failed to submit organism upload' });
    }
  };

  const attachMayaFile = (file?: File) => {
    if (!file) return;
    if (!RESULT_FILE_PATTERN.test(file.name)) {
      setStatus({ type: 'error', message: 'MAYA result files must use TSV, CSV, JSON, or TXT format.' });
      return;
    }
    if (file.size > MAX_RESULT_FILE_BYTES) {
      setStatus({ type: 'error', message: 'Each MAYA result file must be 5 MB or smaller.' });
      return;
    }
    if (mayaAttachments.some((attachment) => attachment.toolName === pendingTool)) {
      setStatus({ type: 'error', message: `A ${pendingTool} result is already attached. Remove it before choosing a replacement.` });
      return;
    }
    setMayaAttachments((current) => [...current, { toolName: pendingTool, toolVersion: pendingToolVersion.trim(), file }]);
    setPendingToolVersion('');
    setStatus({ type: 'idle', message: '' });
  };

  const attachGenomeReference = (kind: 'FASTA' | 'GFF3', file?: File) => {
    if (!file) return;
    if (!REFERENCE_FILE_PATTERNS[kind].test(file.name)) {
      setStatus({ type: 'error', message: kind === 'FASTA' ? 'Reference FASTA must use .fa, .fna, or .fasta.' : 'Genome annotation must use .gff or .gff3.' });
      return;
    }
    if (file.size > MAX_GENOME_REFERENCE_BYTES) {
      setStatus({ type: 'error', message: 'Each genome reference file must be 25 MB or smaller.' });
      return;
    }
    setGenomeReferences((current) => ({ ...current, [kind]: file }));
    setStatus({ type: 'idle', message: '' });
  };

  return (
    <div className={surveillanceMode ? 'text-[#0B1B3A]' : 'min-h-screen bg-[#f6f8fb] px-5 py-8 text-[#0B1B3A] md:px-8'}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link href={surveillanceMode ? '/surveillance' : '/account'} className="text-xs font-black uppercase tracking-widest text-orange-600">{surveillanceMode ? 'Global Surveillance' : 'Account Dashboard'}</Link>
            <h1 className="mt-2 flex items-center gap-3 text-4xl font-black tracking-tight">
              {surveillanceMode ? <Globe2 className="text-teal-700" size={34} /> : <FilePlus2 className="text-orange-500" size={34} />} {surveillanceMode ? 'Submit Surveillance Data' : 'Submit Organism Data'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Submit strain metadata and optional MAYA pipeline results from any country. Records enter the existing review queue and remain private until an administrator approves them.
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
            <Field label="Country" value={form.country} onChange={(value) => setForm({ ...form, country: value })} required={surveillanceMode} />
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
          <Section title="Surveillance Provenance & Evidence" />
          <div className="grid gap-5 md:grid-cols-2">
            <SelectField label="Record Scope" value={form.surveillanceScope} onChange={(value) => setForm({ ...form, surveillanceScope: value })} options={[{ value: 'GLOBAL', label: 'Global surveillance' }, { value: 'NATIONAL', label: 'National surveillance' }]} />
            <SelectField label="Evidence Basis" value={form.evidenceBasis} onChange={(value) => setForm({ ...form, evidenceBasis: value })} options={[{ value: 'GENOTYPIC', label: 'Genotypic' }, { value: 'PHENOTYPIC', label: 'Phenotypic' }, { value: 'COMBINED', label: 'Combined genotype + phenotype' }, { value: 'NOT_REPORTED', label: 'Not reported' }]} />
            <Field label="Submitting Institution" value={form.submittingInstitution} onChange={(value) => setForm({ ...form, submittingInstitution: value })} />
            <Field label="Data Source / Programme" value={form.dataSource} onChange={(value) => setForm({ ...form, dataSource: value })} />
            <Field label="Last Verified" type="date" value={form.lastVerifiedAt} onChange={(value) => setForm({ ...form, lastVerifiedAt: value })} />
          </div>
          <Area label="Data Use Limitations" value={form.dataUseLimitations} onChange={(value) => setForm({ ...form, dataUseLimitations: value })} rows={3} />
          <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm font-semibold leading-6 text-teal-950">
            <Dna className="mt-0.5 shrink-0 text-teal-700" size={20} />
            <p>MAYA pipeline detections are recorded as genotypic evidence. Select phenotypic or combined only when linked laboratory susceptibility evidence is included in the submitted metadata.</p>
          </div>

          <Section title="Genome Reference Files (Optional)" />
          <p className="text-sm font-semibold leading-6 text-slate-600">
            Attach the assembly FASTA and matching GFF3 annotation used by MAYA. The server validates both, generates the FASTA index, and keeps every file private until this submission is approved.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {(['FASTA', 'GFF3'] as const).map((kind) => {
              const file = genomeReferences[kind];
              return (
                <div key={kind} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <FileCode2 className={kind === 'FASTA' ? 'text-teal-700' : 'text-orange-600'} size={21} />
                    <div>
                      <p className="text-sm font-black">{kind === 'FASTA' ? 'Reference FASTA' : 'Genome Annotation GFF3'}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{kind === 'FASTA' ? '.fa, .fna, or .fasta' : '.gff or .gff3'} · 25 MB maximum</p>
                    </div>
                  </div>
                  {file ? (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white px-3 py-3">
                      <span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{file.name}</span><span className="text-[11px] font-semibold text-slate-500">{(file.size / 1024).toFixed(1)} KB</span></span>
                      <button type="button" title={`Remove ${kind}`} aria-label={`Remove ${file.name}`} onClick={() => setGenomeReferences((current) => { const next = { ...current }; delete next[kind]; return next; })} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-700 hover:bg-red-50"><Trash2 size={16} /></button>
                    </div>
                  ) : (
                    <label className="mt-4 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-4 text-xs font-black uppercase text-slate-700 transition hover:border-orange-400 hover:text-orange-700">
                      <UploadCloud size={17} /> Attach {kind}
                      <input type="file" className="sr-only" accept={kind === 'FASTA' ? '.fa,.fna,.fasta' : '.gff,.gff3'} onChange={(event) => { attachGenomeReference(kind, event.target.files?.[0]); event.currentTarget.value = ''; }} />
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          <Section title="MAYA Pipeline Results (Optional)" />
          <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[1fr_1fr_1.3fr]">
            <SelectField label="MAYA Tool" value={pendingTool} onChange={setPendingTool} options={MAYA_TOOLS.map((tool) => ({ value: tool, label: tool }))} />
            <Field label="Tool Version" value={pendingToolVersion} onChange={setPendingToolVersion} />
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Result File</span>
              <span className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-teal-400 bg-white px-4 text-xs font-black uppercase text-teal-800 transition hover:bg-teal-50">
                <UploadCloud size={17} /> Attach TSV, CSV, JSON, or TXT
                <input type="file" className="sr-only" accept=".tsv,.csv,.json,.txt" onChange={(event) => { attachMayaFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              </span>
            </label>
          </div>
          {mayaAttachments.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {mayaAttachments.map((attachment) => (
                <li key={attachment.toolName} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="text-sm font-black">{attachment.toolName}{attachment.toolVersion ? ` ${attachment.toolVersion}` : ''}</p><p className="mt-1 truncate text-xs font-semibold text-slate-500">{attachment.file.name} · {(attachment.file.size / 1024).toFixed(1)} KB</p></div>
                  <button type="button" title="Remove attached file" aria-label={`Remove ${attachment.file.name}`} onClick={() => setMayaAttachments((current) => current.filter((item) => item.toolName !== attachment.toolName))} className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-md border border-red-200 text-red-700 hover:bg-red-50 sm:self-auto"><Trash2 size={17} /></button>
                </li>
              ))}
            </ul>
          )}

          <Area label="Additional Metadata JSON" value={form.metadata} onChange={(value) => setForm({ ...form, metadata: value })} rows={6} />

          {status.type !== 'idle' && (
            <div aria-live="polite" className={`flex items-center gap-3 rounded-2xl p-4 text-sm font-bold ${status.type === 'error' ? 'border border-red-200 bg-red-50 text-red-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {status.type === 'error' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              {status.message}
            </div>
          )}

          <button type="submit" disabled={status.type === 'loading'} className="w-full rounded-2xl bg-[#0B1B3A] py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-orange-500 disabled:opacity-60">
            {status.type === 'loading' ? 'Submitting...' : `Submit${referenceAttachments.length ? ` with ${referenceAttachments.length} reference file${referenceAttachments.length === 1 ? '' : 's'}` : ''}${mayaAttachments.length ? ` and ${mayaAttachments.length} MAYA file${mayaAttachments.length === 1 ? '' : 's'}` : ''} for Admin Review`}
          </button>
        </form>
      </div>
    </div>
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

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none transition focus:border-orange-500 focus:bg-white">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
