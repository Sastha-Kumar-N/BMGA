'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Database,
  FileJson2,
  Home,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import BrandLogo from '../components/BrandLogo';
import { apiPath } from '../lib/api-client';

type FairStatus = {
  title: string;
  identifier: string;
  counts: { organisms: number; strains: number; publishedReferenceFiles: number };
  modifiedAt?: string | null;
  license: { name: string; url: string } | null;
  registry: { name: string; url: string | null; status: string };
  contactEmail: string;
  machineMetadata: string;
  openApi: string;
  fairClaim: string;
};

export default function FairPage() {
  const [status, setStatus] = useState<FairStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch(apiPath('/fair/status'), { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load FAIR status');
        setStatus(data);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Failed to load FAIR status'));
  }, []);

  return (
    <main className="min-h-screen bg-[#f4f7fa] text-[#0B1B3A]">
      <header className="border-b border-slate-200 bg-white px-5 py-4 md:px-8">
        <div className="mx-auto flex max-w-[1350px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <BrandLogo />
          <nav className="flex flex-wrap gap-2">
            <Nav href="/" icon={Home} label="Home" />
            <Nav href="/dashboard" icon={LayoutDashboard} label="India Dashboard" />
            <Nav href="/surveillance" icon={RefreshCcw} label="Global Surveillance" />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1350px] space-y-6 px-5 py-8 md:px-8">
        <section className="grid gap-6 bg-[#0B1B3A] p-7 text-white lg:grid-cols-[minmax(0,1fr)_360px] lg:p-10">
          <div>
            <p className="text-[10px] font-black uppercase text-orange-300">Findable · Accessible · Interoperable · Reusable</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">FAIR Data Gateway</h1>
            <p className="mt-4 max-w-3xl text-sm font-semibold leading-7 text-slate-300">Machine-readable dataset discovery, stable strain records, documented access boundaries, checksums, provenance fields, evidence labels, and reuse controls for BMGA genomic surveillance data.</p>
          </div>
          <div className="border border-white/15 bg-white/5 p-5">
            <p className="text-[10px] font-black uppercase text-slate-400">Current statement</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{status?.fairClaim || 'Loading live FAIR status...'}</p>
          </div>
        </section>

        {error && <div className="flex items-center gap-3 border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><AlertCircle size={18} />{error}</div>}
        {!status && !error && <div className="flex min-h-40 items-center justify-center border border-slate-200 bg-white"><LoaderCircle className="mr-3 animate-spin text-orange-500" size={19} />Loading live metadata</div>}

        {status && (
          <>
            <section className="grid gap-px border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
              <Metric icon={Database} label="Organisms" value={status.counts.organisms.toLocaleString()} />
              <Metric icon={BookOpenCheck} label="Strains" value={status.counts.strains.toLocaleString()} />
              <Metric icon={FileJson2} label="Published Reference Files" value={status.counts.publishedReferenceFiles.toLocaleString()} />
              <Metric icon={RefreshCcw} label="Last Data Update" value={status.modifiedAt ? new Date(status.modifiedAt).toLocaleDateString() : 'N/A'} />
            </section>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <FairCard letter="F" title="Findable" items={['Stable organism, strain, and submission routes', 'DCAT 3 and Bioschemas JSON-LD catalog', status.registry.url ? 'FAIRsharing record linked' : 'FAIRsharing registration pending owner action']} />
              <FairCard letter="A" title="Accessible" items={['Public reviewed metadata APIs', 'HTTP range delivery for approved FASTA/GFF3', 'Authenticated private submission and BLAST controls']} />
              <FairCard letter="I" title="Interoperable" items={['FASTA, FAI, GFF3, JSON, and JSON-LD', 'NCBI taxonomy and accession fields', 'OpenAPI service description and SHA-256 checksums']} />
              <FairCard letter="R" title="Reusable" items={[status.license ? `License: ${status.license.name}` : 'Dataset reuse license not configured', 'Per-record provenance and data-use limitations', 'Explicit genotypic versus phenotypic evidence labels']} />
            </section>

            <section className="grid gap-5 border border-slate-200 bg-white p-6 lg:grid-cols-3">
              <Resource icon={FileJson2} title="DCAT / Bioschemas Catalog" body="Machine-readable JSON-LD generated from the current database." href={apiPath('/fair/catalog')} />
              <Resource icon={Link2} title="OpenAPI Description" body="Discover public metadata and authenticated compute endpoints." href={apiPath('/openapi.json')} />
              <Resource icon={ShieldCheck} title="Registry Status" body={status.registry.url ? 'The owner-supplied FAIRsharing record is linked.' : 'External registration requires the database owner to submit and verify the resource.'} href={status.registry.url || '/fair#registration'} />
            </section>

            <section id="registration" className="border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-xl font-black text-amber-950">FAIRsharing Registration Handoff</h2>
              <p className="mt-3 text-sm font-semibold leading-7 text-amber-950">
                The portal is prepared with metadata and stable endpoints, but external registration cannot be completed from source code. The organization owner must choose the license, verify institutional contacts and policies, submit the FAIRsharing database record, then set <code className="bg-white px-1.5 py-1">FAIRSHARING_RECORD_URL</code>. Until then, BMGA reports the registry as pending rather than registered.{' '}
                <a href="https://fairsharing.org/new" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-black underline">Open FAIRsharing registration <ArrowUpRight size={13} /></a>
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Nav({ href, icon: Icon, label }: { href: string; icon: typeof Home; label: string }) {
  return <Link href={href} className="inline-flex h-10 items-center gap-2 border border-slate-200 px-3 text-xs font-black text-slate-700 hover:border-orange-400 hover:text-orange-700"><Icon size={15} />{label}</Link>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string }) {
  return <div className="flex items-center gap-3 bg-white p-5"><span className="flex h-10 w-10 items-center justify-center bg-orange-50 text-orange-600"><Icon size={19} /></span><span><span className="block text-[9px] font-black uppercase text-slate-400">{label}</span><span className="mt-1 block text-lg font-black">{value}</span></span></div>;
}

function FairCard({ letter, title, items }: { letter: string; title: string; items: string[] }) {
  return <section className="border border-slate-200 bg-white p-5"><span className="flex h-10 w-10 items-center justify-center bg-[#0B1B3A] text-lg font-black text-white">{letter}</span><h2 className="mt-4 text-xl font-black">{title}</h2><ul className="mt-3 space-y-3">{items.map((item) => <li key={item} className="flex gap-2 text-sm font-semibold leading-6 text-slate-600"><CheckCircle2 className="mt-1 shrink-0 text-teal-600" size={15} />{item}</li>)}</ul></section>;
}

function Resource({ icon: Icon, title, body, href }: { icon: typeof FileJson2; title: string; body: string; href: string }) {
  return <a href={href} className="group border-l-2 border-orange-500 pl-4"><Icon className="text-orange-600" size={20} /><h2 className="mt-3 text-lg font-black">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{body}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-black uppercase text-orange-700">Open resource <ArrowUpRight size={13} /></span></a>;
}
