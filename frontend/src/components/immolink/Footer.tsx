'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePacksModal } from '@/contexts/PacksModalContext';
import {
  FOOTER_COLS,
  IMMOLINK_PHONE,
  IMMOLINK_PHONE_E164,
  IMMOLINK_EMAIL,
} from '@/lib/mock/immolink';

export function Footer() {
  const { openPacks } = usePacksModal();

  return (
    <footer className="mt-18 bg-brand-green text-brand-cream">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-8 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-10 w-11 flex-none items-center justify-center rounded-xl bg-brand-cream">
              <Image
                src="/immolink-emblem.png"
                width={40}
                height={30}
                className="block object-contain"
                alt="ImmoLink Sénégal"
              />
            </div>
            <span className="leading-none">
              <span className="block text-lg font-extrabold">
                Immo<span className="text-brand-gold">Link</span>
              </span>
              <span className="mt-0.5 block text-[9.5px] font-extrabold tracking-[.34em] text-brand-gold">
                SÉNÉGAL
              </span>
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-brand-cream/70">
            La plateforme immobilière tout-en-un de l&apos;Afrique de l&apos;Ouest. Achat, location,
            gestion et investissement.
          </p>
          <div className="mt-4 flex flex-col gap-2 text-sm font-bold text-brand-cream">
            <a
              href={`tel:${IMMOLINK_PHONE_E164}`}
              className="flex w-fit items-center gap-2 rounded-lg bg-brand-cream/10 px-3 py-2 hover:bg-brand-cream/18"
            >
              <span aria-hidden>📞</span>
              <span>{IMMOLINK_PHONE}</span>
            </a>
            <a
              href={`mailto:${IMMOLINK_EMAIL}`}
              className="flex w-fit items-center gap-2 rounded-lg bg-brand-cream/10 px-3 py-2 hover:bg-brand-cream/18"
            >
              <span aria-hidden>✉️</span>
              <span>{IMMOLINK_EMAIL}</span>
            </a>
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.h}>
            <div className="mb-3.5 text-[13px] font-extrabold tracking-wide">{col.h}</div>
            <div className="flex flex-col gap-2.5">
              {col.items.map((item) =>
                item.action === 'packs' ? (
                  <button
                    key={item.label}
                    type="button"
                    onClick={openPacks}
                    className="cursor-pointer text-left text-[13.5px] text-brand-cream/72 hover:text-brand-cream"
                  >
                    {item.label}
                  </button>
                ) : (
                  <Link
                    key={item.label}
                    href={item.href ?? '/'}
                    className="text-[13.5px] text-brand-cream/72 hover:text-brand-cream"
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-brand-cream/14">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-[12.5px] text-brand-cream/55 sm:flex-row sm:justify-between sm:px-8">
          <span>© 2026 ImmoLink. Tous droits réservés.</span>
          <span>Wave · Orange Money · Stripe · Visa · Mastercard</span>
        </div>
      </div>
    </footer>
  );
}
