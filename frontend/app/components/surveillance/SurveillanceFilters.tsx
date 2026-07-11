'use client';

import { RefreshCw, RotateCcw, Search } from 'lucide-react';
import { evidenceLabel, type SurveillanceFilterOptions, type SurveillanceFilterState } from './types';

export default function SurveillanceFilters({
  filters,
  options,
  refreshing,
  onChange,
  onReset,
  onRefresh,
}: {
  filters: SurveillanceFilterState;
  options: SurveillanceFilterOptions;
  refreshing: boolean;
  onChange: (key: keyof SurveillanceFilterState, value: string) => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  return (
    <section aria-label="Surveillance data filters" className="border-y border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1.3fr)_repeat(4,minmax(140px,1fr))_auto]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-black uppercase text-slate-500">Search records</span>
          <span className="relative block">
            <Search aria-hidden="true" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.search}
              onChange={(event) => onChange('search', event.target.value)}
              placeholder="Organism, strain, accession"
              className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
            />
          </span>
        </label>
        <FilterSelect label="Organism" value={filters.organismId} onChange={(value) => onChange('organismId', value)}>
          <option value="">All organisms</option>
          {options.organisms.map((organism) => <option key={organism.id} value={organism.id}>{organism.scientificName}</option>)}
        </FilterSelect>
        <FilterSelect label="Country / region" value={filters.country} onChange={(value) => onChange('country', value)}>
          <option value="">All countries</option>
          {options.countries.map((country) => <option key={country.value} value={country.value}>{country.value} ({country.count})</option>)}
        </FilterSelect>
        <FilterSelect label="Source" value={filters.source} onChange={(value) => onChange('source', value)}>
          <option value="">All sources</option>
          {options.sources.map((source) => <option key={source.value} value={source.value}>{source.value} ({source.count})</option>)}
        </FilterSelect>
        <FilterSelect label="Evidence basis" value={filters.evidenceBasis} onChange={(value) => onChange('evidenceBasis', value)}>
          <option value="">All evidence</option>
          {options.evidenceBasis.map((basis) => <option key={basis} value={basis}>{evidenceLabel(basis)}</option>)}
        </FilterSelect>
        <div className="flex items-end gap-2">
          <button type="button" title="Refresh data" aria-label="Refresh surveillance data" onClick={onRefresh} disabled={refreshing} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-teal-700 transition hover:bg-teal-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">
            <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={onReset} className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-black uppercase text-slate-700 transition hover:border-orange-300 hover:text-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600">Date and surveillance scope</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <FilterInput label="Collected from" type="date" value={filters.from} onChange={(value) => onChange('from', value)} />
          <FilterInput label="Collected to" type="date" value={filters.to} onChange={(value) => onChange('to', value)} />
          <FilterSelect label="Record scope" value={filters.scope} onChange={(value) => onChange('scope', value)}>
            <option value="">National and global</option>
            <option value="GLOBAL">Global submissions</option>
            <option value="NATIONAL">National submissions</option>
          </FilterSelect>
        </div>
      </details>
    </section>
  );
}

function FilterSelect({ label, value, onChange, children }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20">
        {children}
      </select>
    </label>
  );
}

function FilterInput({ label, value, onChange, type }: { label: string; value: string; onChange: (value: string) => void; type: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase text-slate-500">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20" />
    </label>
  );
}
