'use client';

// Real interactive map for /recherche — OpenStreetMap tiles via Leaflet (no
// API key / billing account needed, unlike Google Maps or Mapbox). Property
// coordinates are approximate (see lib/geo/senegal-locations.ts — there's no
// geocoding provider wired into this starter, city/quartier are free text).
//
// Leaflet touches `window` at module-evaluation time (not just on mount),
// which crashes SSR outright — this file is only ever reached through
// SearchMap.tsx's `next/dynamic(..., { ssr: false })`, never imported
// directly. Do not import SearchMapImpl from a Server Component.
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import Link from 'next/link';
import { coordsFor, jitter } from '@/lib/geo/senegal-locations';

export interface SearchMapProperty {
  id: string;
  title: string;
  price: number;
  unit: string;
  city: string;
  quartier: string;
}

function formatCompactFcfa(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

function pinIcon(label: string) {
  return L.divIcon({
    html: `<span class="im-map-pin">${label}</span>`,
    className: '',
    iconSize: [0, 0],
  });
}

export function SearchMapImpl({ properties }: { properties: SearchMapProperty[] }) {
  const points = properties.map((p) => ({
    ...p,
    coords: jitter(p.id, coordsFor(p.city, p.quartier)),
  }));

  const center: [number, number] =
    points.length > 0
      ? [
          points.reduce((s, p) => s + p.coords[0], 0) / points.length,
          points.reduce((s, p) => s + p.coords[1], 0) / points.length,
        ]
      : [14.6928, -17.4467];

  return (
    <MapContainer
      center={center}
      zoom={points.length > 0 ? 12 : 11}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <Marker key={p.id} position={p.coords} icon={pinIcon(formatCompactFcfa(p.price))}>
          <Popup>
            <div className="text-[13px] font-semibold text-brand-ink">{p.title}</div>
            <div className="mb-1.5 text-xs text-brand-muted2">
              {p.quartier}, {p.city}
            </div>
            <Link href={`/biens/${p.id}`} className="text-xs font-bold text-brand-green underline">
              Voir l&apos;annonce →
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
