import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyCard } from '@/components/immolink/PropertyCard';
import { SortSelect } from '@/components/immolink/SortSelect';
import { SearchMap } from '@/components/immolink/SearchMap';
import { listProperties, type PropertySort } from '@/lib/server/properties';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Recherche de biens immobiliers au Sénégal',
  description:
    'Parcourez les annonces immobilières au Sénégal — appartements, villas, terrains et bureaux à vendre ou à louer à Dakar et dans tout le pays.',
  alternates: { canonical: '/recherche' },
};

function chipClass(active: boolean) {
  return active
    ? 'bg-brand-green text-brand-cream border border-brand-green'
    : 'bg-white text-brand-slate border border-brand-green/15';
}

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau'];

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    txn?: string;
    q?: string;
    type?: string;
    priceMax?: string;
    beds?: string;
    sort?: string;
    agency?: string;
  }>;
}) {
  const {
    txn: txnParam,
    q,
    type: typeParam,
    priceMax: priceMaxParam,
    beds: bedsParam,
    sort: sortParam,
    agency,
  } = await searchParams;
  // Unset (no txn param) means "both" — important for agency/promoter links
  // where forcing Vente would hide half an agency's real inventory.
  const txn: 'Vente' | 'Location' | undefined =
    txnParam === 'location' ? 'Location' : txnParam === 'vente' ? 'Vente' : undefined;
  const type = TYPES.includes(typeParam ?? '') ? typeParam : undefined;
  const priceMax = priceMaxParam ? Number.parseInt(priceMaxParam, 10) : undefined;
  const bedsMin = bedsParam ? Number.parseInt(bedsParam, 10) : undefined;
  const sort: PropertySort =
    sortParam === 'price_asc' || sortParam === 'price_desc' ? sortParam : 'recent';

  const results = await listProperties({ txn, q, type, agency, priceMax, bedsMin, sort });

  const chips = [
    { label: q?.trim() || 'Dakar', active: true },
    { label: type ?? 'Tous types', active: Boolean(type) },
    ...(txn ? [{ label: txn, active: true }] : []),
    ...(agency ? [{ label: agency, active: true }] : []),
    {
      label: priceMax
        ? `Budget max ${(priceMax / 1_000_000).toLocaleString('fr-FR')}M FCFA`
        : 'Budget max',
      active: Boolean(priceMax),
    },
    { label: bedsMin ? `${bedsMin}+ chambres` : '3+ chambres', active: Boolean(bedsMin) },
    { label: '+ Filtres', active: false },
  ];

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Recherche
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-serif text-3xl sm:text-[34px]">
          {results.length} biens
          {txn === 'Location' ? ' en location' : txn === 'Vente' ? ' à vendre' : ''}
          {agency ? ` · ${agency}` : q?.trim() ? ` · ${q.trim()}` : ' à Dakar'}
        </h1>
        <SortSelect sort={sort} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2.5">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`rounded-full px-3.75 py-2.25 text-[13px] font-semibold ${chipClass(c.active)}`}
          >
            {c.label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6.5 lg:grid-cols-[1fr_420px]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {results.length === 0 && (
            <p className="col-span-full text-sm text-brand-muted2">
              Aucun bien ne correspond à cette recherche pour le moment.
            </p>
          )}
          {results.map((p) => (
            <PropertyCard key={p.id} property={p} size="sm" />
          ))}
        </div>

        {/* MAP */}
        <div className="sticky top-24 hidden h-[calc(100vh-120px)] overflow-hidden rounded-[20px] border border-brand-green/12 lg:block">
          <SearchMap
            properties={results.map((p) => ({
              id: p.id,
              title: p.title,
              price: p.price,
              unit: p.unit,
              city: p.city,
              quartier: p.quartier,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
