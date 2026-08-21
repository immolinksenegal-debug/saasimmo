'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePacksModal } from '@/contexts/PacksModalContext';
import {
  FOOTER_COLS,
  IMMOLINK_PHONE,
  IMMOLINK_PHONE_E164,
  IMMOLINK_EMAIL,
  IMMOLINK_FACEBOOK_URL,
  IMMOLINK_INSTAGRAM_URL,
  IMMOLINK_WHATSAPP_URL,
} from '@/lib/mock/immolink';

const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    href: IMMOLINK_FACEBOOK_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
        <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.522 1.492-3.916 3.777-3.916 1.094 0 2.238.196 2.238.196v2.475h-1.26c-1.243 0-1.63.775-1.63 1.57v1.89h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94Z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: IMMOLINK_INSTAGRAM_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
        <path d="M12 2c-2.72 0-3.06.012-4.13.06-1.066.05-1.79.218-2.427.465a4.9 4.9 0 0 0-1.771 1.153A4.9 4.9 0 0 0 2.52 5.45c-.247.637-.416 1.36-.465 2.428C2.008 8.944 2 9.28 2 12s.012 3.056.06 4.123c.05 1.066.218 1.79.465 2.427a4.9 4.9 0 0 0 1.153 1.771 4.9 4.9 0 0 0 1.771 1.153c.637.247 1.36.416 2.428.465C8.944 21.992 9.28 22 12 22s3.056-.012 4.123-.06c1.066-.05 1.79-.218 2.427-.465a4.9 4.9 0 0 0 1.771-1.153 4.9 4.9 0 0 0 1.153-1.771c.247-.637.416-1.36.465-2.428.048-1.066.06-1.402.06-4.123s-.012-3.056-.06-4.123c-.05-1.066-.218-1.79-.465-2.427a4.9 4.9 0 0 0-1.153-1.771A4.9 4.9 0 0 0 18.55 2.52c-.637-.247-1.36-.416-2.428-.465C15.056 2.008 14.72 2 12 2Zm0 1.802c2.674 0 2.99.01 4.043.058.976.045 1.505.207 1.858.344.467.182.8.399 1.15.748.35.35.567.683.748 1.15.137.353.3.882.344 1.858.048 1.054.058 1.37.058 4.043s-.01 2.99-.058 4.043c-.045.976-.207 1.505-.344 1.858a3.1 3.1 0 0 1-.748 1.15 3.1 3.1 0 0 1-1.15.748c-.353.137-.882.3-1.858.344-1.054.048-1.37.058-4.043.058s-2.99-.01-4.043-.058c-.976-.045-1.505-.207-1.858-.344a3.1 3.1 0 0 1-1.15-.748 3.1 3.1 0 0 1-.748-1.15c-.137-.353-.3-.882-.344-1.858-.048-1.054-.058-1.37-.058-4.043s.01-2.99.058-4.043c.045-.976.207-1.505.344-1.858.182-.467.399-.8.748-1.15.35-.35.683-.566 1.15-.748.353-.137.882-.3 1.858-.344 1.054-.048 1.37-.058 4.043-.058Zm0 3.063a5.135 5.135 0 1 0 0 10.27 5.135 5.135 0 0 0 0-10.27Zm0 8.469a3.334 3.334 0 1 1 0-6.668 3.334 3.334 0 0 1 0 6.668Zm5.338-8.671a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z" />
      </svg>
    ),
  },
  {
    label: 'WhatsApp',
    href: IMMOLINK_WHATSAPP_URL,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4.5 w-4.5">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11-.42-.13-.96-.31-1.65-.6-2.9-1.26-4.8-4.18-4.94-4.38-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.82 2 .89 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.42.49-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.16-.19.68-.79.86-1.06.18-.28.36-.23.6-.14.24.09 1.53.72 1.79.85.26.13.44.2.5.31.06.12.06.68-.18 1.36Z" />
      </svg>
    ),
  },
];

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
          <div className="mt-4 flex items-center gap-2.5">
            {SOCIAL_LINKS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream/10 text-brand-cream hover:bg-brand-cream/18"
              >
                {s.icon}
              </a>
            ))}
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
