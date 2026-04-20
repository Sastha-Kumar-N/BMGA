'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';

// Fix for Leaflet marker icons not showing in Next.js
const markerIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function IndiaMap({ data }: { data: any[] }) {
  return (
    <div className="h-[600px] w-full rounded-3xl overflow-hidden shadow-2xl border-4 border-white">
      <MapContainer 
        center={[20.5937, 78.9629]} // Center of India
        zoom={5} 
        style={{ height: '100%', width: '100%' }}
      >
        {/* UPDATED TILE LAYER:
          Using Google Maps tiles with the "&gl=IN" (Geolocation = India) parameter. 
          This strictly enforces the official Indian political borders for J&K and Arunachal Pradesh.
        */}
        <TileLayer
          url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=en&gl=IN"
          attribution="Map data &copy; Google"
        />
        
        {data?.map((strain: any) => {
          
          // Safely check for coordinates BEFORE returning JSX
          if (!strain.latitude || !strain.longitude) {
            return null; // Skip rendering if no GPS data
          }

          // Return the Marker for valid strains
          return (
            <Marker 
              key={strain.id} 
              position={[strain.latitude, strain.longitude]}
              icon={markerIcon} 
            >
              <Popup>
                <div className="font-sans">
                  <p className="text-[10px] font-black uppercase text-orange-500 tracking-widest mb-1">
                    {strain.sourceType || 'Sample'}
                  </p>
                  <p className="font-black text-[#0B1B3A] text-sm">
                    {strain.strainName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {strain.organism?.scientificName}
                  </p>
                  <p className="text-xs text-slate-400 mt-2 border-t pt-2">
                    📍 {strain.city}, {strain.country}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}