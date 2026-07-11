'use client';

import Link from 'next/link';
import { Binary, ChevronLeft, ChevronRight, Database, ExternalLink } from 'lucide-react';
import {
  evidenceLabel,
  formatCount,
  formatDate,
  type SurveillanceRecord,
  type SurveillanceRecordsResponse,
} from './types';

export default function SurveillanceRecordsTable({
  data,
  loading,
  error,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  compact = false,
}: {
  data: SurveillanceRecordsResponse | null;
  loading: boolean;
  error?: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  compact?: boolean;
}) {
  const records = data?.records || [];
  return (
    <section aria-labelledby="surveillance-records-title" className="border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 id="surveillance-records-title" className="text-base font-black">Approved strain records</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{data ? `${formatCount(data.total)} matching records` : 'Database-backed record explorer'}</p>
        </div>
        {!compact && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            Rows
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="h-10 rounded-md border border-slate-300 bg-white px-2 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
        )}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">Organism / strain</th>
              <th scope="col" className="px-4 py-3">Country</th>
              <th scope="col" className="px-4 py-3">Collection date</th>
              <th scope="col" className="px-4 py-3">Source</th>
              <th scope="col" className="px-4 py-3">MAYA status</th>
              <th scope="col" className="px-4 py-3">Evidence</th>
              <th scope="col" className="px-4 py-3">Updated</th>
              <th scope="col" className="w-28 px-4 py-3"><span className="sr-only">Open record or genome tools</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((record) => <RecordRow key={record.id} record={record} />)}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-100 md:hidden">
        {records.map((record) => <MobileRecord key={record.id} record={record} />)}
      </div>

      {!loading && !error && records.length === 0 && (
        <div className="px-5 py-16 text-center">
          <Database className="mx-auto text-teal-700" size={34} />
          <p className="mt-3 text-sm font-black">No approved surveillance records match these filters.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Adjust or reset the current filters to broaden the view.</p>
        </div>
      )}
      {loading && !data && <p className="px-5 py-16 text-center text-xs font-black uppercase text-teal-700">Loading approved surveillance records</p>}
      {error && !data && <p role="alert" className="px-5 py-16 text-center text-sm font-bold text-red-700">{error}</p>}

      {data && data.totalPages > 1 && (
        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-500">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-black disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><ChevronLeft size={16} /> Previous</button>
            <button type="button" onClick={() => onPageChange(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-black disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">Next <ChevronRight size={16} /></button>
          </div>
        </div>
      )}
    </section>
  );
}

function RecordRow({ record }: { record: SurveillanceRecord }) {
  return (
    <tr className="align-top transition hover:bg-teal-50/40">
      <td className="px-4 py-3"><p className="font-black italic">{record.organism.scientificName}</p><p className="mt-0.5 text-xs font-bold text-slate-500">{record.strainName}</p></td>
      <td className="px-4 py-3 font-semibold">{record.country || 'N/A'}<p className="mt-0.5 text-xs text-slate-500">{[record.city, record.state].filter(Boolean).join(', ') || 'Location not reported'}</p></td>
      <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatDate(record.collectionDate)}</td>
      <td className="px-4 py-3 font-semibold">{record.sourceType || 'N/A'}</td>
      <td className="px-4 py-3"><StatusBadge status={record.latestMayaStatus} /><p className="mt-1 text-[11px] font-semibold text-slate-500">{formatCount(record.mayaRunCount)} runs</p></td>
      <td className="px-4 py-3"><EvidenceBadge value={record.evidenceBasis} /><p className="mt-1 text-[11px] font-semibold text-slate-500">{formatCount(record.amrDetectionCount)} AMR detections</p></td>
      <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatDate(record.updatedAt)}</td>
      <td className="px-4 py-3"><div className="flex gap-1"><Link href={`/organisms/${record.organismId}/results`} aria-label={`Open results for ${record.organism.scientificName} ${record.strainName}`} title="Open MAYA results" className="inline-flex h-10 w-10 items-center justify-center rounded-md text-teal-700 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><ExternalLink size={17} /></Link><Link href={`/organisms/${record.organismId}/genome?strain=${record.id}`} aria-label={`Open genome tools for ${record.organism.scientificName} ${record.strainName}`} title="Open genome tools" className="inline-flex h-10 w-10 items-center justify-center rounded-md text-orange-700 hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"><Binary size={17} /></Link></div></td>
    </tr>
  );
}

function MobileRecord({ record }: { record: SurveillanceRecord }) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h3 className="truncate font-black italic">{record.organism.scientificName}</h3><p className="mt-1 truncate text-xs font-bold text-slate-500">{record.strainName}</p></div>
        <div className="flex shrink-0 gap-1"><Link href={`/organisms/${record.organismId}/results`} aria-label={`Open results for ${record.organism.scientificName} ${record.strainName}`} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-teal-700"><ExternalLink size={17} /></Link><Link href={`/organisms/${record.organismId}/genome?strain=${record.id}`} aria-label={`Open genome tools for ${record.organism.scientificName} ${record.strainName}`} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-orange-200 text-orange-700"><Binary size={17} /></Link></div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <MobileField label="Country" value={record.country || 'N/A'} />
        <MobileField label="Collected" value={formatDate(record.collectionDate)} />
        <MobileField label="Source" value={record.sourceType || 'N/A'} />
        <MobileField label="Updated" value={formatDate(record.updatedAt)} />
      </dl>
      <div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={record.latestMayaStatus} /><EvidenceBadge value={record.evidenceBasis} /></div>
    </article>
  );
}

function MobileField({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-black uppercase text-slate-400">{label}</dt><dd className="mt-1 font-bold text-slate-700">{value}</dd></div>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'COMPLETED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700' : status === 'WARNING' || status === 'PARTIAL' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-black uppercase ${tone}`}>{status.replaceAll('_', ' ').toLowerCase()}</span>;
}

function EvidenceBadge({ value }: { value: string }) {
  const tone = value === 'GENOTYPIC' ? 'border-teal-200 bg-teal-50 text-teal-800' : value === 'PHENOTYPIC' ? 'border-blue-200 bg-blue-50 text-blue-800' : value === 'COMBINED' ? 'border-orange-200 bg-orange-50 text-orange-800' : 'border-slate-200 bg-slate-50 text-slate-600';
  return <span className={`inline-flex rounded border px-2 py-1 text-[10px] font-black uppercase ${tone}`}>{evidenceLabel(value)}</span>;
}
