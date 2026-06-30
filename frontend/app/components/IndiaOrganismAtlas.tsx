'use client';

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { ImageOverlay, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, Database, FlaskConical, MapPin, Microscope } from 'lucide-react';

export type AtlasOrganism = {
  id: number;
  scientificName?: string | null;
  taxonomyId?: number | null;
};

export type AtlasStrain = {
  id: number;
  strainName?: string | null;
  organismId: number;
  organism?: AtlasOrganism | null;
  sourceType?: string | null;
  host?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  biosampleAccession?: string | null;
  assemblyAccession?: string | null;
  genomeSize?: number | null;
  gcContent?: number | string | null;
};

type AtlasPoint = AtlasStrain & {
  latitudeValue: number;
  longitudeValue: number;
};

type IndiaOrganismAtlasProps = {
  strains: AtlasStrain[];
  activeStrainId?: number | null;
  onOpenOrganism: (organismId: number) => void;
};

const INDIA_CENTER: LatLngExpression = [22.6, 79.2];
const INDIA_VIEW_BOUNDS: LatLngBoundsExpression = [
  [6.4, 67.3],
  [36.8, 97.5],
];
const FALLBACK_IMAGE_BOUNDS: LatLngBoundsExpression = [
  [-10, 48],
  [45, 112],
];

const GOOGLE_INDIA_TILE_URL = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en&gl=IN';
const FALLBACK_INDIA_MAP_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 720">
    <defs>
      <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
        <path d="M72 0H0V72" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="1"/>
      </pattern>
      <linearGradient id="land" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#e9f7e8"/>
        <stop offset="1" stop-color="#c8eddc"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.16"/>
      </filter>
    </defs>
    <rect width="900" height="720" fill="#74d3e2"/>
    <rect width="900" height="720" fill="url(#grid)"/>
    <path d="M0 34C112 18 190 66 268 98C358 136 436 104 520 72C635 28 757 44 900 92V0H0Z" fill="#eef5e7"/>
    <path d="M0 148C111 131 194 148 271 188C349 229 440 210 514 188C605 161 726 162 900 222V92C756 46 641 36 525 76C432 108 357 143 261 104C178 71 101 28 0 42Z" fill="#d9efd8"/>
    <path d="M0 230C104 209 198 231 276 270C346 306 424 315 515 289C617 260 754 278 900 340V220C744 160 622 159 520 188C427 214 348 229 270 188C192 148 104 132 0 151Z" fill="#d8efda"/>
    <path d="M335 72C384 98 420 137 451 178C485 224 537 248 594 264C648 279 684 322 684 371C684 423 643 460 615 502C585 548 586 600 554 646C528 685 496 708 456 718C417 682 402 626 367 579C328 528 276 490 265 431C256 383 282 337 270 293C256 243 218 218 227 172C235 129 286 111 315 88C323 82 329 76 335 72Z" fill="url(#land)" stroke="#2f8f7e" stroke-width="4" filter="url(#softShadow)"/>
    <path d="M280 172C335 202 389 235 444 265C498 294 558 294 612 278M272 292C340 317 410 334 478 328C548 322 602 346 660 384M300 431C364 406 429 414 479 450C518 478 564 488 615 476M366 579C407 554 452 563 487 596C507 615 531 625 558 622" fill="none" stroke="#78bba7" stroke-width="2.5" stroke-dasharray="9 10" opacity="0.9"/>
    <text x="175" y="112" fill="#334155" font-family="Arial, sans-serif" font-size="24" font-weight="700">Pakistan</text>
    <text x="405" y="104" fill="#334155" font-family="Arial, sans-serif" font-size="19" font-weight="700">Uttarakhand</text>
    <text x="588" y="128" fill="#334155" font-family="Arial, sans-serif" font-size="24" font-weight="700">Nepal</text>
    <text x="686" y="174" fill="#334155" font-family="Arial, sans-serif" font-size="20" font-weight="700">Bhutan</text>
    <text x="684" y="270" fill="#334155" font-family="Arial, sans-serif" font-size="22" font-weight="700">Bangladesh</text>
    <text x="260" y="227" fill="#475569" font-family="Arial, sans-serif" font-size="20" font-weight="700">Rajasthan</text>
    <text x="401" y="246" fill="#0f172a" font-family="Arial, sans-serif" font-size="33" font-weight="800">India</text>
    <text x="365" y="312" fill="#475569" font-family="Arial, sans-serif" font-size="18" font-weight="700">Madhya Pradesh</text>
    <text x="246" y="400" fill="#475569" font-family="Arial, sans-serif" font-size="21" font-weight="700">Mumbai</text>
    <text x="336" y="436" fill="#475569" font-family="Arial, sans-serif" font-size="18" font-weight="700">Maharashtra</text>
    <text x="443" y="464" fill="#475569" font-family="Arial, sans-serif" font-size="19" font-weight="700">Telangana</text>
    <text x="400" y="563" fill="#475569" font-family="Arial, sans-serif" font-size="19" font-weight="700">Karnataka</text>
    <text x="475" y="634" fill="#475569" font-family="Arial, sans-serif" font-size="18" font-weight="700">Tamil Nadu</text>
    <text x="620" y="572" fill="#475569" font-family="Arial, sans-serif" font-size="18" font-weight="700">Bay of Bengal</text>
    <text x="76" y="528" fill="#475569" font-family="Arial, sans-serif" font-size="18" font-weight="700">Arabian Sea</text>
  </svg>
`)}`;

const SOURCE_STYLES: Record<string, { color: string; label: string }> = {
  clinical: { color: '#2f80c9', label: 'Clinical' },
  environmental: { color: '#16a34a', label: 'Environmental' },
  food: { color: '#f97316', label: 'Food & Water' },
  animal: { color: '#7c3aed', label: 'Animal' },
  wastewater: { color: '#0ea5e9', label: 'Wastewater' },
  unknown: { color: '#64748b', label: 'Unspecified' },
};

const markerIconCache = new Map<string, InstanceType<typeof L.Icon>>();

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function sourceKey(sourceType?: string | null) {
  const normalized = (sourceType || 'unknown').toLowerCase().trim();
  if (/clinical|hospital|patient/.test(normalized)) return 'clinical';
  if (/environment|soil|river|water/.test(normalized)) return 'environmental';
  if (/food|milk|meat|fish/.test(normalized)) return 'food';
  if (/animal|poultry|livestock/.test(normalized)) return 'animal';
  if (/wastewater|sewage/.test(normalized)) return 'wastewater';
  return SOURCE_STYLES[normalized] ? normalized : 'unknown';
}

function formatGenomeSize(value?: number | null) {
  if (!value) return 'N/A';
  return `${(value / 1_000_000).toFixed(2)} Mb`;
}

function getSourceStyle(sourceType?: string | null) {
  return SOURCE_STYLES[sourceKey(sourceType)];
}

function createMarkerIcon(color: string, selected: boolean) {
  const cacheKey = `${color}-${selected ? 'selected' : 'default'}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;

  const width = selected ? 38 : 31;
  const height = selected ? 52 : 43;
  const stroke = selected ? '#fb923c' : '#ffffff';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 38 52">
      <filter id="shadow" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#0f172a" flood-opacity="0.28"/>
      </filter>
      <path filter="url(#shadow)" d="M19 2C9.7 2 2.2 9.4 2.2 18.6c0 12.4 16.8 30.5 16.8 30.5s16.8-18.1 16.8-30.5C35.8 9.4 28.3 2 19 2Z" fill="${color}" stroke="${stroke}" stroke-width="3"/>
      <circle cx="19" cy="18.7" r="6.2" fill="#ffffff" fill-opacity="0.95"/>
      <circle cx="19" cy="18.7" r="3.1" fill="${color}"/>
    </svg>
  `;

  const icon = new L.Icon({
    iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height - 4],
    popupAnchor: [0, -height + 10],
  });
  markerIconCache.set(cacheKey, icon);
  return icon;
}

function pointPosition(point: AtlasPoint): LatLngExpression {
  return [point.latitudeValue, point.longitudeValue];
}

function MapViewportController({ points, activeStrainId }: { points: AtlasPoint[]; activeStrainId?: number | null }) {
  const map = useMap();
  const pointCount = points.length;

  useEffect(() => {
    map.fitBounds(INDIA_VIEW_BOUNDS, { padding: [10, 10], maxZoom: 5 });
  }, [activeStrainId, map, pointCount]);

  return null;
}

export default function IndiaOrganismAtlas({ strains, activeStrainId, onOpenOrganism }: IndiaOrganismAtlasProps) {
  const atlasPoints = useMemo<AtlasPoint[]>(() => (
    strains
      .map((strain) => {
        const latitudeValue = asNumber(strain.latitude);
        const longitudeValue = asNumber(strain.longitude);
        if (latitudeValue === null || longitudeValue === null) return null;

        return {
          ...strain,
          latitudeValue,
          longitudeValue,
        };
      })
      .filter((strain): strain is AtlasPoint => Boolean(strain))
  ), [strains]);

  const [manualSelectedId, setManualSelectedId] = useState<number | null>(null);
  const selectedId = activeStrainId || manualSelectedId;
  const selectedPoint = atlasPoints.find((point) => point.id === selectedId) || atlasPoints[0] || null;

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    atlasPoints.forEach((point) => {
      const key = sourceKey(point.sourceType);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([key, count]) => ({
      key,
      count,
      ...SOURCE_STYLES[key],
    }));
  }, [atlasPoints]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative h-[620px] overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-200">
        <MapContainer
          center={INDIA_CENTER}
          zoom={5}
          minZoom={4}
          maxZoom={11}
          scrollWheelZoom
          className="bmga-leaflet-map h-full w-full"
          style={{ height: '100%', width: '100%' }}
        >
          <ImageOverlay
            url={FALLBACK_INDIA_MAP_URL}
            bounds={FALLBACK_IMAGE_BOUNDS}
            pane="tilePane"
          />
          <TileLayer
            url={GOOGLE_INDIA_TILE_URL}
            attribution="Map data &copy; Google"
            maxZoom={18}
          />
          <MapViewportController points={atlasPoints} activeStrainId={selectedId} />

          {atlasPoints.map((point) => {
            const sourceStyle = getSourceStyle(point.sourceType);
            const isSelected = selectedPoint?.id === point.id;

            return (
              <Marker
                key={point.id}
                position={pointPosition(point)}
                icon={createMarkerIcon(sourceStyle.color, isSelected)}
                title={`${point.organism?.scientificName || 'Unknown organism'} ${point.strainName || ''}`}
                eventHandlers={{
                  click: () => setManualSelectedId(point.id),
                }}
              >
                <Popup minWidth={270}>
                  <div className="font-sans">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                      {sourceStyle.label} source
                    </p>
                    <h3 className="mt-2 text-base font-black italic text-[#0B1B3A]">
                      {point.organism?.scientificName || 'Unknown organism'}
                    </h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {point.strainName || 'Unnamed strain'} | {point.city || 'Unknown city'}, {point.state || point.country || 'India'}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <AtlasPopupMetric label="Genome" value={formatGenomeSize(point.genomeSize)} />
                      <AtlasPopupMetric label="GC" value={point.gcContent ? `${point.gcContent}%` : 'N/A'} />
                      <AtlasPopupMetric label="BioSample" value={point.biosampleAccession || 'N/A'} />
                      <AtlasPopupMetric label="Assembly" value={point.assemblyAccession || 'N/A'} />
                    </div>
                    <button
                      onClick={() => onOpenOrganism(point.organismId)}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0B1B3A] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-orange-500"
                    >
                      Open genomics page <ArrowUpRight size={13} />
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {atlasPoints.length === 0 && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] w-[min(360px,calc(100%-40px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-slate-300 bg-white/95 p-6 text-center shadow-xl backdrop-blur">
            <MapPin className="mx-auto mb-4 text-slate-300" size={38} />
            <h3 className="text-lg font-black text-[#0B1B3A]">No mapped organisms in this result set</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Add latitude and longitude metadata in the admin portal or clear the current filter to show atlas points.
            </p>
          </div>
        )}
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atlas Dossier</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-[#0B1B3A]">Sampling Sources</h3>
          </div>
          <div className="rounded-xl bg-orange-50 p-3 text-orange-600">
            <MapPin size={22} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <AtlasMetric icon={Database} label="Mapped Points" value={atlasPoints.length.toString()} />
          <AtlasMetric icon={Microscope} label="Organisms" value={new Set(atlasPoints.map((point) => point.organismId)).size.toString()} />
        </div>

        <div className="mt-6 space-y-2">
          {sourceCounts.map((source) => (
            <div key={source.key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: source.color }} />
                <span className="text-xs font-black uppercase tracking-widest text-slate-500">{source.label}</span>
              </div>
              <span className="font-mono text-sm font-black text-[#0B1B3A]">{source.count}</span>
            </div>
          ))}
          {sourceCounts.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-bold text-slate-400">
              Add latitude and longitude metadata to display organism points on the atlas.
            </div>
          )}
        </div>

        {selectedPoint && (
          <div className="mt-6 rounded-2xl border border-[#0B1B3A]/10 bg-[#0B1B3A] p-5 text-white">
            <div className="flex items-center gap-2 text-orange-300">
              <FlaskConical size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Selected Point</span>
            </div>
            <h4 className="mt-3 text-xl font-black italic tracking-tight">
              {selectedPoint.organism?.scientificName || 'Unknown organism'}
            </h4>
            <p className="mt-1 text-sm font-bold text-slate-300">{selectedPoint.strainName || 'Unnamed strain'}</p>
            <dl className="mt-4 space-y-3 text-xs">
              <AtlasDetail label="Location" value={`${selectedPoint.city || 'Unknown'}, ${selectedPoint.state || selectedPoint.country || 'India'}`} />
              <AtlasDetail label="Source" value={selectedPoint.sourceType || 'Unspecified'} />
              <AtlasDetail label="Host" value={selectedPoint.host || 'N/A'} />
              <AtlasDetail label="Taxonomy" value={selectedPoint.organism?.taxonomyId ? `TXID ${selectedPoint.organism.taxonomyId}` : 'N/A'} />
            </dl>
            <button
              onClick={() => onOpenOrganism(selectedPoint.organismId)}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-[#0B1B3A] transition hover:bg-orange-500 hover:text-white"
            >
              Open genomics page <ArrowUpRight size={14} />
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function AtlasPopupMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 truncate font-mono text-[11px] font-bold text-[#0B1B3A]">{value}</p>
    </div>
  );
}

function AtlasMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <Icon size={18} className="text-orange-500" />
      <p className="mt-3 text-2xl font-black text-[#0B1B3A]">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

function AtlasDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <dt className="font-black uppercase tracking-widest text-slate-500">{label}</dt>
      <dd className="max-w-[180px] text-right font-mono font-bold text-slate-200">{value}</dd>
    </div>
  );
}
