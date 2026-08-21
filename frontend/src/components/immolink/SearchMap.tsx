'use client';

// Thin loader boundary in front of SearchMapImpl. Leaflet touches `window`
// at module-evaluation time, which crashes SSR — `next/dynamic(...,
// { ssr: false })` is the fix, but that option is only accepted from a
// Client Component, not from recherche/page.tsx (a Server Component). This
// file exists solely to be that Client Component boundary.
import dynamic from 'next/dynamic';
import type { SearchMapProperty } from './SearchMapImpl';

export type { SearchMapProperty };

const SearchMapImpl = dynamic(() => import('./SearchMapImpl').then((m) => m.SearchMapImpl), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-brand-green/8" />,
});

export function SearchMap({ properties }: { properties: SearchMapProperty[] }) {
  return <SearchMapImpl properties={properties} />;
}
