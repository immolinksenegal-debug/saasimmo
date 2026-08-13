'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { value: 'recent', label: 'Trier : Pertinence' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
] as const;

export function SortSelect({ sort }: { sort: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'recent') {
      params.delete('sort');
    } else {
      params.set('sort', value);
    }
    router.push(`/recherche?${params.toString()}`);
  }

  return (
    <select
      value={sort}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-[10px] border border-brand-green/15 bg-white px-3.5 py-2.5 text-[13.5px] font-semibold"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
