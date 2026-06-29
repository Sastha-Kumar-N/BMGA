'use client';

import { useMemo, useState } from 'react';
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

type DensityCell = {
  id: string;
  left: number;
  top: number;
  color: string;
  opacity: number;
};

type IndiaOrganismAtlasProps = {
  strains: AtlasStrain[];
  activeStrainId?: number | null;
  onOpenOrganism: (organismId: number) => void;
};

const INDIA_BOUNDS = {
  minLat: 6.3,
  maxLat: 37.6,
  minLng: 67.5,
  maxLng: 97.6,
};

const SOURCE_STYLES: Record<string, { color: string; label: string }> = {
  clinical: { color: '#dc2626', label: 'Clinical' },
  environmental: { color: '#059669', label: 'Environmental' },
  food: { color: '#d97706', label: 'Food' },
  animal: { color: '#7c3aed', label: 'Animal' },
  wastewater: { color: '#0284c7', label: 'Wastewater' },
  unknown: { color: '#475569', label: 'Unspecified' },
};

const DENSITY_OFFSETS = [
  [0, 0, 0.42],
  [1.4, -1.1, 0.28],
  [-1.5, 1.2, 0.24],
  [2.4, 1.4, 0.2],
  [-2.4, -1.3, 0.18],
  [0.4, 2.5, 0.16],
];

function asNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function projectPoint(latitude: number, longitude: number) {
  const left = ((longitude - INDIA_BOUNDS.minLng) / (INDIA_BOUNDS.maxLng - INDIA_BOUNDS.minLng)) * 100;
  const top = ((INDIA_BOUNDS.maxLat - latitude) / (INDIA_BOUNDS.maxLat - INDIA_BOUNDS.minLat)) * 100;

  return {
    left: clamp(left, 4, 96),
    top: clamp(top, 4, 96),
  };
}

function sourceKey(sourceType?: string | null) {
  const normalized = (sourceType || 'unknown').toLowerCase().trim();
  return SOURCE_STYLES[normalized] ? normalized : 'unknown';
}

function formatGenomeSize(value?: number | null) {
  if (!value) return 'N/A';
  return `${(value / 1_000_000).toFixed(2)} Mb`;
}

function getSourceStyle(sourceType?: string | null) {
  return SOURCE_STYLES[sourceKey(sourceType)];
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
  const selectedPoint = atlasPoints.find((point) => point.id === selectedId) || atlasPoints[0];

  const densityCells = useMemo<DensityCell[]>(() => (
    atlasPoints.flatMap((point) => {
      const projected = projectPoint(point.latitudeValue, point.longitudeValue);
      const sourceStyle = getSourceStyle(point.sourceType);

      return DENSITY_OFFSETS.map(([xOffset, yOffset, opacity], index) => ({
        id: `${point.id}-${index}`,
        left: clamp(projected.left + xOffset, 2, 96),
        top: clamp(projected.top + yOffset, 2, 96),
        color: sourceStyle.color,
        opacity,
      }));
    })
  ), [atlasPoints]);

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
      <div className="relative min-h-[620px] overflow-hidden rounded-2xl border border-slate-200 bg-[#dbeef2] shadow-sm">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(rgba(11,27,58,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(11,27,58,0.08) 1px, transparent 1px)',
            backgroundSize: '34px 34px',
          }}
        />
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/50 to-transparent" />

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 620 720" role="img" aria-label="Stylized map of India">
          <path
            d="M255 32 C288 52 318 80 342 112 C370 150 405 166 445 178 C480 188 503 218 506 252 C510 294 478 319 460 350 C438 386 452 423 439 460 C422 510 386 540 362 582 C338 624 311 668 278 690 C245 654 231 600 201 560 C174 524 139 497 130 454 C121 410 143 371 131 329 C120 287 91 261 96 222 C101 185 139 171 169 151 C200 130 212 94 230 66 C238 53 246 42 255 32 Z"
            fill="#eef8f3"
            stroke="#3f8f7c"
            strokeWidth="3"
          />
          <path
            d="M138 234 C182 222 222 232 263 260 C306 290 357 292 404 279 M151 338 C201 323 250 329 298 354 C340 376 387 377 438 362 M181 470 C224 449 270 452 306 485 C330 506 357 514 390 510"
            fill="none"
            stroke="#94bdb2"
            strokeDasharray="8 9"
            strokeWidth="2"
          />
          <path
            d="M222 68 C251 109 262 151 250 197 M345 115 C321 156 309 199 315 245 M438 187 C405 218 382 250 374 291 M158 158 C190 195 209 231 216 268 M141 328 C178 358 203 391 212 431 M435 365 C397 394 374 430 366 472 M201 558 C234 550 264 560 289 586 M331 585 C315 620 297 653 279 684"
            fill="none"
            stroke="#b8d4cc"
            strokeDasharray="5 12"
            strokeWidth="1.5"
          />
          <text x="250" y="214" fill="#64748b" fontSize="20" fontWeight="800">Delhi</text>
          <text x="202" y="312" fill="#64748b" fontSize="20" fontWeight="800">Bhopal</text>
          <text x="151" y="420" fill="#64748b" fontSize="20" fontWeight="800">Mumbai</text>
          <text x="318" y="437" fill="#64748b" fontSize="20" fontWeight="800">Hyderabad</text>
          <text x="345" y="522" fill="#64748b" fontSize="20" fontWeight="800">Chennai</text>
          <text x="431" y="345" fill="#64748b" fontSize="20" fontWeight="800">Kolkata</text>
          <text x="170" y="62" fill="#64748b" fontSize="17" fontWeight="800">Himalayan belt</text>
          <text x="64" y="296" fill="#64748b" fontSize="17" fontWeight="800">Arabian Sea</text>
          <text x="439" y="504" fill="#64748b" fontSize="17" fontWeight="800">Bay of Bengal</text>
        </svg>

        {densityCells.map((cell) => (
          <span
            key={cell.id}
            className="absolute h-4 w-4 border border-white/40"
            style={{
              left: `${cell.left}%`,
              top: `${cell.top}%`,
              opacity: cell.opacity,
              backgroundColor: cell.color,
              transform: 'translate(-50%, -50%)',
            }}
          />
        ))}

        {atlasPoints.map((point) => {
          const projected = projectPoint(point.latitudeValue, point.longitudeValue);
          const sourceStyle = getSourceStyle(point.sourceType);
          const isSelected = selectedPoint?.id === point.id;

          return (
            <button
              key={point.id}
              data-atlas-point="true"
              type="button"
              onClick={() => setManualSelectedId(point.id)}
              title={`${point.organism?.scientificName || 'Unknown organism'} ${point.strainName || ''}`}
              className={`absolute z-10 rounded-full border-2 border-white shadow-lg shadow-slate-900/20 transition hover:scale-125 focus:outline-none focus:ring-4 focus:ring-orange-300 ${
                isSelected ? 'h-6 w-6' : 'h-5 w-5'
              }`}
              style={{
                left: `${projected.left}%`,
                top: `${projected.top}%`,
                backgroundColor: sourceStyle.color,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="sr-only">Select {point.organism?.scientificName || 'organism point'}</span>
            </button>
          );
        })}

        {atlasPoints.length === 0 && (
          <div className="absolute left-1/2 top-1/2 z-20 w-[min(360px,calc(100%-40px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-dashed border-slate-300 bg-white/90 p-6 text-center shadow-xl backdrop-blur">
            <MapPin className="mx-auto mb-4 text-slate-300" size={38} />
            <h3 className="text-lg font-black text-[#0B1B3A]">No mapped organisms in this result set</h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
              Add latitude and longitude metadata in the admin portal or clear the current filter to show atlas points.
            </p>
          </div>
        )}

        {selectedPoint && (
          <div className="absolute left-5 top-5 z-20 w-[min(360px,calc(100%-40px))] rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                  {getSourceStyle(selectedPoint.sourceType).label} source
                </p>
                <h3 className="mt-2 text-lg font-black italic text-[#0B1B3A]">
                  {selectedPoint.organism?.scientificName || 'Unknown organism'}
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {selectedPoint.strainName || 'Unnamed strain'} | {selectedPoint.city || 'Unknown city'}, {selectedPoint.state || selectedPoint.country || 'India'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualSelectedId(null)}
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear selected atlas point"
              >
                x
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AtlasPopupMetric label="Genome" value={formatGenomeSize(selectedPoint.genomeSize)} />
              <AtlasPopupMetric label="GC" value={selectedPoint.gcContent ? `${selectedPoint.gcContent}%` : 'N/A'} />
              <AtlasPopupMetric label="BioSample" value={selectedPoint.biosampleAccession || 'N/A'} />
              <AtlasPopupMetric label="Assembly" value={selectedPoint.assemblyAccession || 'N/A'} />
            </div>
            <button
              onClick={() => onOpenOrganism(selectedPoint.organismId)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 py-3 text-xs font-black uppercase tracking-widest text-white transition hover:bg-orange-500"
            >
              Open genomics page <ArrowUpRight size={14} />
            </button>
          </div>
        )}

        <div className="absolute bottom-4 left-4 rounded-xl border border-white/60 bg-white/80 px-4 py-3 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">
          Projection: latitude/longitude metadata | India bounds
        </div>
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
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 truncate font-mono text-[11px] font-bold text-[#0B1B3A]">{value}</p>
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
