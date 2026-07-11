'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { AlertCircle, Globe2, LoaderCircle } from 'lucide-react';
import { evidenceLabel, formatDate, type SurveillanceLocation } from './types';

const WORLD_CENTER: [number, number] = [18, 8];
const WORLD_BOUNDS: LatLngBoundsExpression = [[-62, -178], [78, 178]];
const WORLD_TILE_OPTIONS = { noWrap: true };
const WORLD_MAP_OPTIONS = { maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1 };

function MapViewport({ locations }: { locations: SurveillanceLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (locations.length <= 1) {
      map.fitBounds(WORLD_BOUNDS, { padding: [8, 8], maxZoom: 2 });
      return;
    }
    const bounds = locations.map((location) => [location.latitude, location.longitude]) as LatLngBoundsExpression;
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 5 });
  }, [locations, map]);
  return null;
}

function markerColor(location: SurveillanceLocation) {
  if (location.evidenceBasis === 'COMBINED') return '#f97316';
  if (location.evidenceBasis === 'PHENOTYPIC') return '#2563eb';
  if (location.evidenceBasis === 'NOT_REPORTED') return '#64748b';
  return '#0f9f9a';
}

export default function WorldSurveillanceMap({
  locations,
  loading,
  error,
  truncated,
  limit,
}: {
  locations: SurveillanceLocation[];
  loading: boolean;
  error?: string | null;
  truncated?: boolean;
  limit?: number;
}) {
  return (
    <section id="global-map" aria-labelledby="global-map-title" className="relative min-h-[390px] overflow-hidden border border-slate-200 bg-[#dceff3] lg:min-h-[520px]">
      <div className="absolute right-4 top-4 z-[500] max-w-[calc(100%-5rem)] rounded-md border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <h2 id="global-map-title" className="text-sm font-black">Global record map</h2>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{locations.length.toLocaleString('en-IN')} geocoded records in view</p>
      </div>
      <MapContainer {...WORLD_MAP_OPTIONS} center={WORLD_CENTER} zoom={2} minZoom={1} maxZoom={12} scrollWheelZoom={false} className="h-full min-h-[390px] w-full lg:min-h-[520px]" style={{ height: '100%', width: '100%' }}>
        <TileLayer
          {...WORLD_TILE_OPTIONS}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
        />
        <MapViewport locations={locations} />
        {locations.map((location) => (
          <CircleMarker
            key={location.id}
            center={[location.latitude, location.longitude]}
            radius={Math.min(11, 5 + Math.log2(Math.max(1, location.amrDetectionCount + 1)))}
            pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: markerColor(location), fillOpacity: 0.86 }}
          >
            <Popup minWidth={250}>
              <div className="font-sans text-[#0B1B3A]">
                <p className="text-[10px] font-black uppercase text-teal-700">{evidenceLabel(location.evidenceBasis)} evidence</p>
                <h3 className="mt-1 text-sm font-black italic">{location.organismName}</h3>
                <p className="text-xs font-bold text-slate-600">{location.strainName}</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs">
                  <dt className="font-bold text-slate-500">Location</dt><dd>{[location.city, location.state, location.country].filter(Boolean).join(', ') || 'N/A'}</dd>
                  <dt className="font-bold text-slate-500">Collected</dt><dd>{formatDate(location.collectionDate)}</dd>
                  <dt className="font-bold text-slate-500">Source</dt><dd>{location.sourceType || 'N/A'}</dd>
                  <dt className="font-bold text-slate-500">MAYA runs</dt><dd>{location.mayaRunCount}</dd>
                </dl>
                <a href={`/organisms/${location.organismId}/results`} className="mt-3 inline-flex min-h-10 items-center rounded-md bg-[#0B1B3A] px-3 text-xs font-black text-white">Open genomic results</a>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {(loading || error || locations.length === 0) && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[550] w-[min(360px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white/95 p-5 text-center shadow-lg backdrop-blur">
          {loading ? (
            <><LoaderCircle className="mx-auto animate-spin text-teal-600" size={30} /><p className="mt-3 text-sm font-black">Loading approved geocoded records</p></>
          ) : error ? (
            <><AlertCircle className="mx-auto text-red-600" size={30} /><p className="mt-3 text-sm font-black">Map data is unavailable</p><p className="mt-1 text-xs font-semibold text-slate-500">{error}</p></>
          ) : (
            <><Globe2 className="mx-auto text-teal-700" size={30} /><p className="mt-3 text-sm font-black">No approved geocoded records in this view.</p><p className="mt-1 text-xs font-semibold text-slate-500">Adjust the filters or add verified latitude and longitude metadata.</p></>
          )}
        </div>
      )}

      {truncated && (
        <div className="absolute bottom-8 right-3 z-[500] max-w-xs rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 shadow-sm">
          Map limited to the {limit?.toLocaleString('en-IN')} most recently updated points. Aggregate metrics include all matching records.
        </div>
      )}
    </section>
  );
}
