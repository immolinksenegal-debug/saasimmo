'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TABS = [
  { label: 'Acheter', txn: 'vente' },
  { label: 'Louer', txn: 'location' },
  { label: 'Vendre', txn: 'vente' },
  { label: 'Investir', txn: 'vente' },
] as const;

const DEFAULT_TYPE = 'Tous types';
const TYPES = [DEFAULT_TYPE, 'Appartement', 'Villa', 'Terrain', 'Bureau'];
const BUDGETS = [
  { label: 'Indifférent', value: '' },
  { label: '50M FCFA', value: '50000000' },
  { label: '100M FCFA', value: '100000000' },
  { label: '250M FCFA', value: '250000000' },
];
const BEDS = [
  { label: 'Indifférent', value: '' },
  { label: '1+', value: '1' },
  { label: '2+', value: '2' },
  { label: '3+', value: '3' },
  { label: '4+', value: '4' },
];

export function HomeSearchPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]['label']>('Acheter');
  const [ville, setVille] = useState('');
  const [type, setType] = useState(DEFAULT_TYPE);
  const [budget, setBudget] = useState('');
  const [beds, setBeds] = useState('');

  const activeTxn = TABS.find((t) => t.label === tab)?.txn ?? 'vente';

  function onSearch() {
    const params = new URLSearchParams({ txn: activeTxn });
    if (ville.trim()) params.set('q', ville.trim());
    if (type !== DEFAULT_TYPE) params.set('type', type);
    if (budget) params.set('priceMax', budget);
    if (beds) params.set('beds', beds);
    router.push(`/recherche?${params.toString()}`);
  }

  return (
    <div className="mt-8 max-w-3xl rounded-[22px] bg-brand-cream p-2.5 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.55)] sm:mt-9.5">
      <div className="im-scroll flex gap-1.5 overflow-x-auto px-1.5 pt-1.5 pb-3">
        {TABS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setTab(t.label)}
            className={`im-tap flex-none cursor-pointer rounded-full px-4 py-2 text-[13.5px] font-bold whitespace-nowrap sm:px-5 sm:py-2.5 sm:text-sm ${
              tab === t.label ? 'bg-brand-green text-brand-cream' : 'text-brand-slate'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-brand-green/10 bg-white sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="border-b border-brand-green/8 px-4.5 py-3.5 lg:border-r lg:border-b-0">
          <div className="mb-1 text-[11px] font-bold tracking-wide text-brand-muted uppercase">
            Ville / Quartier
          </div>
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Dakar, Almadies…"
            className="w-full border-none bg-transparent text-[15px] font-semibold text-brand-ink outline-none"
          />
        </div>
        <div className="border-b border-brand-green/8 px-4.5 py-3.5 lg:border-r lg:border-b-0">
          <div className="mb-1 text-[11px] font-bold tracking-wide text-brand-muted uppercase">
            Type de bien
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border-none bg-transparent text-[15px] font-semibold text-brand-ink outline-none"
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="border-b border-brand-green/8 px-4.5 py-3.5 lg:border-r lg:border-b-0">
          <div className="mb-1 text-[11px] font-bold tracking-wide text-brand-muted uppercase">
            Budget max
          </div>
          <select
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full border-none bg-transparent text-[15px] font-semibold text-brand-ink outline-none"
          >
            {BUDGETS.map((b) => (
              <option key={b.label} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div className="px-4.5 py-3.5 lg:border-r lg:border-brand-green/8">
          <div className="mb-1 text-[11px] font-bold tracking-wide text-brand-muted uppercase">
            Chambres
          </div>
          <select
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            className="w-full border-none bg-transparent text-[15px] font-semibold text-brand-ink outline-none"
          >
            {BEDS.map((b) => (
              <option key={b.label} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={onSearch}
          className="im-tap cursor-pointer bg-brand-red px-7.5 py-4 text-[15px] font-bold text-white"
        >
          Rechercher
        </button>
      </div>
    </div>
  );
}
