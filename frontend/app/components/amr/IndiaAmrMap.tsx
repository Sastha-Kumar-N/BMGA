'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { AmrDashboard } from './types';

const INDIA_CENTER: [number, number] = [22.5, 79];
const INDIA_BOUNDS: [[number, number], [number, number]] = [[5.5, 66], [38.8, 98.8]];

function Viewport({ records }: { records: AmrDashboard['records'] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize({ animate: false });
    if (records.length === 1) map.setView([records[0].latitude, records[0].longitude], 6, { animate: false });
    else if (records.length > 1) map.fitBounds(records.map((record) => [record.latitude, record.longitude] as [number, number]), { padding: [32, 32], maxZoom: 5 });
    else map.setView(INDIA_CENTER, 5, { animate: false });
  }, [map, records]);
  return null;
}

export default function IndiaAmrMap({ data, selectedState, onSelectState }: { data: AmrDashboard | null; selectedState?: string; onSelectState: (state?: string) => void }) {
  const points = (data?.records || []).filter((record) => record.latitude >= INDIA_BOUNDS[0][0] && record.latitude <= INDIA_BOUNDS[1][0] && record.longitude >= INDIA_BOUNDS[0][1] && record.longitude <= INDIA_BOUNDS[1][1]);
  const states = data?.map || [];
  return (
    <section aria-labelledby="amr-india-map-title" className="overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-widest text-orange-600">Geographic context</p><h2 id="amr-india-map-title" className="mt-1 text-2xl font-black text-[#0B1B3A]">India AMR findings map</h2><p className="mt-1 text-sm font-semibold text-slate-600">Point markers appear only where published records contain coordinates. State controls filter the findings explorer.</p></div>
        {selectedState && <button onClick={() => onSelectState(undefined)} className="self-start border border-slate-300 px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 hover:border-orange-500 hover:text-orange-600">Reset {selectedState}</button>}
      </div>
      <div className="grid min-h-[440px] lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="h-[440px] min-w-0 bg-[#dceff3]">
          <MapContainer center={INDIA_CENTER} zoom={5} minZoom={4} maxZoom={12} maxBounds={INDIA_BOUNDS} maxBoundsViscosity={0.8} scrollWheelZoom className="h-full w-full" style={{ height: '100%', width: '100%' }} aria-label="Map of AMR findings in India">
            <Viewport records={points} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
            {points.map((record) => <CircleMarker key={record.id} center={[record.latitude, record.longitude]} radius={record.importance === 'CRITICAL' ? 10 : record.importance === 'HIGH' ? 8 : 6} pathOptions={{ color: record.importance === 'CRITICAL' ? '#be123c' : '#0f766e', fillColor: record.importance === 'CRITICAL' ? '#fb7185' : '#14b8a6', fillOpacity: 0.85, weight: 2 }}><Popup><p className="text-[10px] font-black uppercase tracking-widest text-orange-600">{record.state || 'India'}</p><p className="mt-1 text-sm font-black text-slate-900">{record.title}</p><p className="mt-1 text-xs font-semibold text-slate-600">{record.pathogens.join(', ') || 'Pathogen not reported'}</p><Link className="mt-3 inline-block text-xs font-black text-teal-700 underline" href={`/amr-findings-india/${record.slug}`}>View finding</Link></Popup></CircleMarker>)}
          </MapContainer>
        </div>
        <div className="border-t border-slate-200 p-4 lg:max-h-[440px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-black uppercase tracking-widest text-slate-500">States and UTs</h3><span className="text-xs font-bold text-slate-500">{states.length} represented</span></div>
          {states.length ? <div className="space-y-2">{states.map((state) => <button key={state.label} onClick={() => onSelectState(selectedState === state.label ? undefined : state.label)} className={`w-full border p-3 text-left transition ${selectedState === state.label ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-orange-400'}`}><span className="flex items-center justify-between gap-3"><span className="text-sm font-black text-[#0B1B3A]">{state.label}</span><span className="font-mono text-sm font-black text-teal-700">{state.value}</span></span><p className="mt-1 truncate text-[11px] font-semibold text-slate-500" title={state.majorPathogens.join(', ')}>{state.majorPathogens.join(', ') || 'Pathogen details pending'}</p></button>)}</div> : <p className="border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No published geographic AMR records yet.</p>}
        </div>
      </div>
      <p className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-500">State totals count curated findings, not prevalence. Prevalence is displayed only on individual records with a valid numerator, denominator, and sampling context.</p>
    </section>
  );
}
