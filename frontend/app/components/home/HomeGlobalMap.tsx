'use client';

import { Fragment, useEffect } from 'react';
import type { LatLngBoundsExpression } from 'leaflet';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  evidenceLabel,
  formatDate,
  type SurveillanceLocation,
} from '../surveillance/types';

const WORLD_CENTER: [number, number] = [20, 12];
const WORLD_MAP_OPTIONS = {
  maxBounds: [[-90, -180], [90, 180]] as LatLngBoundsExpression,
  maxBoundsViscosity: 1,
};
const WORLD_TILE_OPTIONS = {
  noWrap: true,
  bounds: [[-85, -180], [85, 180]] as LatLngBoundsExpression,
};

function WorldViewport() {
  const map = useMap();

  useEffect(() => {
    const frameWorld = () => {
      map.invalidateSize({ animate: false });
      const responsiveZoom = Math.min(3, Math.max(1, Math.log2(map.getSize().x / 256)));
      map.setView(WORLD_CENTER, responsiveZoom, { animate: false });
    };

    frameWorld();
    map.on('resize', frameWorld);
    return () => {
      map.off('resize', frameWorld);
    };
  }, [map]);

  return null;
}

function markerColor(location: SurveillanceLocation) {
  if (location.evidenceBasis === 'COMBINED') return '#ff6b00';
  if (location.evidenceBasis === 'PHENOTYPIC') return '#60a5fa';
  if (location.evidenceBasis === 'NOT_REPORTED') return '#94a3b8';
  return '#2dd4bf';
}

export default function HomeGlobalMap({ locations }: { locations: SurveillanceLocation[] }) {
  return (
    <div className="absolute inset-0 z-0 bg-[#06152e]" aria-label="Interactive map of approved global genomic surveillance locations">
      <MapContainer
        {...WORLD_MAP_OPTIONS}
        center={WORLD_CENTER}
        zoom={2}
        minZoom={0}
        maxZoom={8}
        zoomSnap={0.25}
        zoomDelta={0.25}
        zoomControl={false}
        scrollWheelZoom={false}
        className="bmga-world-hero-map h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          {...WORLD_TILE_OPTIONS}
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          maxZoom={19}
        />
        <WorldViewport />
        {locations.map((location) => (
          <Fragment key={location.id}>
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={Math.min(20, 12 + Math.log2(Math.max(1, location.amrDetectionCount + 1)))}
              pathOptions={{ color: markerColor(location), weight: 1, opacity: 0.28, fillColor: markerColor(location), fillOpacity: 0.08 }}
              interactive={false}
            />
            <CircleMarker
              center={[location.latitude, location.longitude]}
              radius={Math.min(10, 4.5 + Math.log2(Math.max(1, location.amrDetectionCount + 1)))}
              pathOptions={{
                color: '#ffffff',
                weight: 1.2,
                fillColor: markerColor(location),
                fillOpacity: 0.96,
              }}
            >
              <Popup minWidth={245}>
                <div className="font-sans text-[#0B1B3A]">
                  <p className="text-[10px] font-black uppercase text-teal-700">
                    {evidenceLabel(location.evidenceBasis)} evidence
                  </p>
                  <h3 className="mt-1 text-sm font-black italic">{location.organismName}</h3>
                  <p className="text-xs font-bold text-slate-600">{location.strainName}</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs">
                    <dt className="font-bold text-slate-500">Location</dt>
                    <dd>{[location.city, location.state, location.country].filter(Boolean).join(', ') || 'N/A'}</dd>
                    <dt className="font-bold text-slate-500">Collected</dt>
                    <dd>{formatDate(location.collectionDate)}</dd>
                    <dt className="font-bold text-slate-500">MAYA runs</dt>
                    <dd>{location.mayaRunCount}</dd>
                  </dl>
                  <a
                    href={`/organisms/${location.organismId}/results`}
                    className="mt-3 inline-flex min-h-10 items-center bg-[#0B1B3A] px-3 text-xs font-black text-white"
                  >
                    Open genomic results
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        ))}
      </MapContainer>
    </div>
  );
}
