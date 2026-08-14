'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Property } from '@prisma/client';
import { useFavorites } from '@/lib/useFavorites';
import { useAuth } from '@/contexts/AuthContext';
import { priceFmt, txnTextClass, badgeClassFor } from '@/lib/mock/immolink';

const SIZES = {
  lg: {
    imageHeight: 'h-54',
    title: 'text-lg',
    price: 'text-[26px]',
    padding: 'p-4.5',
    showPhotos: true,
  },
  md: {
    imageHeight: 'h-49',
    title: 'text-[17px]',
    price: 'text-[23px]',
    padding: 'p-4.5',
    showPhotos: false,
  },
  sm: {
    imageHeight: 'h-45',
    title: 'text-base',
    price: 'text-xl',
    padding: 'px-4 py-3.5',
    showPhotos: false,
  },
} as const;

export function PropertyCard({
  property: p,
  size = 'md',
}: {
  property: Property;
  size?: keyof typeof SIZES;
}) {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites(user?.id);
  const fav = isFavorite(p.id);
  const cfg = SIZES[size];

  return (
    <Link
      href={`/biens/${p.id}`}
      className="block overflow-hidden rounded-[20px] border border-brand-green/8 bg-white shadow-[0_14px_30px_-22px_rgba(0,0,0,0.4)] transition-transform hover:-translate-y-1"
    >
      <div className={`relative ${cfg.imageHeight}`}>
        <Image src={p.image} alt={p.title} fill className="object-cover" />
        <span
          className={`absolute top-3.5 left-3.5 rounded-full px-3 py-1 text-xs font-bold text-white ${badgeClassFor(p.badge)}`}
        >
          {p.badge}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite(p.id);
          }}
          aria-label={fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          className="im-tap absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/92 text-[17px]"
        >
          {fav ? '❤' : '♡'}
        </button>
        {cfg.showPhotos && (
          <span className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white">
            ◻ {p.photos} photos
          </span>
        )}
      </div>
      <div className={cfg.padding}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className={`text-[12.5px] font-bold ${txnTextClass(p.txn)}`}>
            {p.txn} · {p.type}
          </span>
          <span className="text-[12.5px] font-semibold text-brand-muted">{p.city}</span>
        </div>
        <h3 className={`mb-1 font-extrabold tracking-tight ${cfg.title}`}>{p.title}</h3>
        <div className="mb-3 text-[13.5px] font-medium text-brand-muted2">📍 {p.quartier}</div>
        <div className="mb-3 flex gap-3.5 border-b border-brand-green/8 pb-3.5 text-[13px] font-semibold text-brand-slate">
          <span>{p.beds} ch.</span>
          <span>{p.baths} sdb</span>
          <span>{p.surface} m²</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`font-serif text-brand-green ${cfg.price}`}>{priceFmt(p)}</span>
          <span className="text-xs font-semibold text-brand-muted">{p.unit}</span>
        </div>
      </div>
    </Link>
  );
}
