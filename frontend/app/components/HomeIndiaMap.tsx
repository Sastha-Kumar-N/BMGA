'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { AlertCircle, MapPin, RefreshCcw } from 'lucide-react';

export type HomeMapStrain = {
  id: number;
  strainName?: string | null;
  organismId: number;
  organism?: {
    scientificName?: string | null;
  } | null;
  sourceType?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  genomeSize?: number | null;
  gcContent?: number | string | null;
};

type HomeMapPoint = HomeMapStrain & {
  latitudeValue: number;
  longitudeValue: number;
};

type HomeIndiaMapProps = {
  strains: HomeMapStrain[];
  loading?: boolean;
  error?: string | null;
};

const INDIA_CENTER: LatLngExpression = [22.6, 79.2];
const INDIA_BOUNDS: LatLngBoundsExpression = [
  [6.4, 67.3],
  [36.8, 97.5],
];
const INDIA_TILE_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en&gl=IN';

function numericValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isIndiaCoordinate(latitude: number, longitude: number, country?: string | null) {
  const countryLabel = (country || '').toLowerCase();
  const looksLikeIndia = !countryLabel || countryLabel.includes('india');
  return looksLikeIndia && latitude >= 6 && latitude <= 38 && longitude >= 67 && longitude <= 98;
}

function createHomeMarkerIcon(sourceType?: string | null) {
  const source = (sourceType || '').toLowerCase();
  const color = /clinical|hospital|patient/.test(source)
    ? '#2563eb'
    : /environment|soil|river|water|wastewater/.test(source)
      ? '#16a34a'
      : /animal|poultry|livestock/.test(source)
        ? '#f97316'
        : /food|milk|meat|fish/.test(source)
          ? '#7c3aed'
          : '#f97316';

  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
      <path d="M17 42C14.4 37.8 3 27.7 3 16.9C3 8.7 9.3 2 17 2s14 6.7 14 14.9C31 27.7 19.6 37.8 17 42Z" fill="${color}" stroke="#ffffff" stroke-width="3"/>
      <circle cx="17" cy="16.5" r="5.2" fill="#ffffff"/>
    </svg>
  `);

  return new L.Icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${svg}`,
    iconSize: [34, 44],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });
}

function formatGenomeSize(value?: number | null) {
  if (!value) return 'N/A';
  return `${(value / 1_000_000).toFixed(2)} Mb`;
}

function formatGc(value?: number | string | null) {
  const parsed = numericValue(value);
  return parsed === null ? 'N/A' : `${parsed.toFixed(2)}%`;
}

function MapViewport({ points }: { points: HomeMapPoint[] }) {
  const map = useMap();
  const pointCount = points.length;

  useEffect(() => {
    if (pointCount > 1) {
      map.fitBounds(points.map((point) => [point.latitudeValue, point.longitudeValue]) as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 6 });
      return;
    }

    map.fitBounds(INDIA_BOUNDS, { padding: [10, 10], maxZoom: 5 });
  }, [map, pointCount, points]);

  return null;
}

export default function HomeIndiaMap({ strains, loading = false, error = null }: HomeIndiaMapProps) {
  const points = useMemo<HomeMapPoint[]>(() => (
    strains
      .map((strain) => {
        const latitudeValue = numericValue(strain.latitude);
        const longitudeValue = numericValue(strain.longitude);
        if (latitudeValue === null || longitudeValue === null) return null;
        if (!isIndiaCoordinate(latitudeValue, longitudeValue, strain.country)) return null;

        return {
          ...strain,
          latitudeValue,
          longitudeValue,
        };
      })
      .filter((point): point is HomeMapPoint => Boolean(point))
  ), [strains]);

  return (
    <div className="isolate relative z-0 h-full min-h-[420px] overflow-hidden rounded-lg border border-cyan-300/10 bg-[#06152E] shadow-xl shadow-cyan-950/20 lg:min-h-[560px]">
      <MapContainer
        center={INDIA_CENTER}
        zoom={5}
        minZoom={4}
        maxZoom={10}
        scrollWheelZoom={false}
        className="bmga-home-map h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url={INDIA_TILE_URL}
          attribution="Map data &copy; Google"
          maxZoom={18}
        />
        <MapViewport points={points} />

        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.latitudeValue, point.longitudeValue]}
            icon={createHomeMarkerIcon(point.sourceType)}
            title={`${point.organism?.scientificName || 'Unknown organism'} ${point.strainName || ''}`}
          >
            <Popup minWidth={240}>
              <div className="font-sans">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                  {point.sourceType || 'Genome source'}
                </p>
                <h3 className="mt-2 text-sm font-black italic text-[#0B1B3A]">
                  {point.organism?.scientificName || 'Unknown organism'}
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {point.strainName || 'Unnamed strain'}
                </p>
                <p className="mt-2 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-500">
                  {[point.city, point.state, point.country || 'India'].filter(Boolean).join(', ')}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="font-black uppercase tracking-widest text-slate-400">Genome</p>
                    <p className="mt-1 font-mono font-black text-[#0B1B3A]">{formatGenomeSize(point.genomeSize)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2">
                    <p className="font-black uppercase tracking-widest text-slate-400">GC</p>
                    <p className="mt-1 font-mono font-black text-[#0B1B3A]">{formatGc(point.gcContent)}</p>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] bg-gradient-to-t from-[#071833]/95 via-[#071833]/70 to-transparent p-5">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <HeroSignal label="Mapped Points" value={loading ? '...' : points.length.toLocaleString('en-IN')} />
          <HeroSignal label="India Locations" value={loading ? '...' : new Set(points.map((point) => [point.city, point.state].filter(Boolean).join('|'))).size.toLocaleString('en-IN')} />
          <HeroSignal label="Live Records" value={loading ? '...' : strains.length.toLocaleString('en-IN')} />
        </div>
      </div>

      {(loading || error || points.length === 0) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[550] w-[min(360px,calc(100%-40px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/15 bg-[#071833]/90 p-6 text-center text-white shadow-2xl backdrop-blur">
          {loading ? (
            <>
              <RefreshCcw className="mx-auto mb-4 animate-spin text-orange-300" size={34} />
              <p className="text-xs font-black uppercase tracking-widest text-slate-300">Loading India locations</p>
            </>
          ) : error ? (
            <>
              <AlertCircle className="mx-auto mb-4 text-red-300" size={34} />
              <p className="text-sm font-black">Unable to load map locations</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{error}</p>
            </>
          ) : (
            <>
              <MapPin className="mx-auto mb-4 text-slate-300" size={34} />
              <p className="text-sm font-black">No India locations available yet</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Add latitude and longitude metadata to strains to populate this map.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function HeroSignal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}
