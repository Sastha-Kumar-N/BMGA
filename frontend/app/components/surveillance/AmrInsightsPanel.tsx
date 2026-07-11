'use client';

import { AlertTriangle, Dna, FlaskConical, ShieldAlert } from 'lucide-react';
import { formatCount, type AmrInsightsResponse } from './types';

export default function AmrInsightsPanel({ data, loading, error, expanded = false }: {
  data: AmrInsightsResponse | null;
  loading: boolean;
  error?: string | null;
  expanded?: boolean;
}) {
  if (loading && !data) return <PanelState text="Loading normalized AMR detections" />;
  if (error && !data) return <PanelState text={error} error />;

  const hasData = Boolean(data?.totalDetections);
  return (
    <section aria-labelledby="amr-insights-title" className="border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 id="amr-insights-title" className="flex items-center gap-2 text-base font-black"><ShieldAlert size={19} className="text-red-600" /> AMR signal overview</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{formatCount(data?.totalDetections)} normalized gene-level detections in the current view</p>
        </div>
        <div className="inline-flex self-start rounded-md border border-slate-200 bg-slate-50 p-1 text-[11px] font-black uppercase">
          <span className="rounded bg-teal-700 px-3 py-2 text-white">Genotypic</span>
          <span className={`px-3 py-2 ${data?.interpretation.phenotypicAvailability ? 'text-blue-700' : 'text-slate-400'}`}>Phenotypic {data?.interpretation.phenotypicAvailability ? '' : '(no data)'}</span>
        </div>
      </div>

      <div className="border-b border-teal-100 bg-teal-50 px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          <Dna className="mt-0.5 shrink-0 text-teal-700" size={20} />
          <div>
            <p className="text-xs font-black uppercase text-teal-900">Evidence interpretation</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-teal-950">{data?.interpretation.statement || 'MAYA pipeline detections are reported as genotypic evidence.'}</p>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="px-5 py-16 text-center">
          <FlaskConical className="mx-auto text-teal-700" size={34} />
          <p className="mt-3 text-sm font-black">No normalized AMR detections are available for this view.</p>
          <p className="mx-auto mt-1 max-w-xl text-xs font-semibold leading-5 text-slate-500">Completed aggregate-only MAYA outputs may still be counted as pipeline runs. Individual detections appear here only when gene-level AMR rows are available.</p>
        </div>
      ) : (
        <div className={`grid gap-0 divide-y divide-slate-200 ${expanded ? 'xl:grid-cols-3 xl:divide-x xl:divide-y-0' : ''}`}>
          <BarList title="Detected genes" rows={data?.topGenes || []} />
          <BarList title="Drug classes" rows={data?.drugClasses || []} />
          {expanded && <BarList title="Countries" rows={data?.countries || []} />}
        </div>
      )}

      {expanded && hasData && (
        <div className="border-t border-slate-200 px-4 py-5 sm:px-5">
          <h3 className="text-sm font-black">Detection ingestion timeline</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">Counts reflect database ingestion dates, not isolate collection dates.</p>
          <TrendBars rows={data?.trend || []} />
        </div>
      )}
    </section>
  );
}

function BarList({ title, rows }: { title: string; rows: Array<{ label: string; count: number }> }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="min-w-0 p-4 sm:p-5">
      <h3 className="text-xs font-black uppercase text-slate-500">{title}</h3>
      <div className="mt-4 space-y-3">
        {rows.slice(0, 8).map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold" title={row.label}>{row.label}</span><span className="font-mono font-black">{formatCount(row.count)}</span></div>
            <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded bg-teal-600" style={{ width: `${Math.max(3, (row.count / maximum) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendBars({ rows }: { rows: Array<{ period: string; count: number }> }) {
  const visible = rows.slice(-18);
  const maximum = Math.max(1, ...visible.map((row) => row.count));
  return (
    <div className="mt-5 flex min-h-36 items-end gap-2 overflow-x-auto pb-2" aria-label="AMR detection ingestion trend">
      {visible.map((row) => (
        <div key={row.period} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-[10px] font-black text-slate-500">{row.count}</span>
          <div className="w-full max-w-14 rounded-t bg-orange-500" style={{ height: `${Math.max(6, (row.count / maximum) * 92)}px` }} />
          <span className="whitespace-nowrap text-[9px] font-bold text-slate-500">{row.period}</span>
        </div>
      ))}
    </div>
  );
}

function PanelState({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <div className={`flex min-h-72 items-center justify-center border bg-white p-8 text-center ${error ? 'border-red-200 text-red-700' : 'border-slate-200 text-teal-700'}`}>
      <div><AlertTriangle className="mx-auto" size={28} /><p className="mt-3 text-sm font-black">{text}</p></div>
    </div>
  );
}
