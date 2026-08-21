// /demandes — public list of "demandes de recherche" (particuliers looking
// for a property — the inverse of /recherche's Property listings). Contact
// phone comes from listPropertyRequestsWithContact — deliberately NOT
// exposed via GET /api/property-requests (see lib/server/property-requests.ts).
import type { Metadata } from 'next';
import Link from 'next/link';
import { listPropertyRequestsWithContact } from '@/lib/server/property-requests';
import { formatFcfa, txnTextClass, waMeHref } from '@/lib/mock/immolink';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Demandes de recherche immobilière au Sénégal',
  description:
    "Particuliers à la recherche d'un bien à Dakar et partout au Sénégal — consultez leurs demandes et contactez-les directement si vous avez le bien qu'ils cherchent.",
  alternates: { canonical: '/demandes' },
};

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'] as const;

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ txn?: string; city?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const txn = sp.txn === 'Vente' || sp.txn === 'Location' ? sp.txn : undefined;
  const city = sp.city?.trim() || undefined;
  const type = sp.type && (TYPES as readonly string[]).includes(sp.type) ? sp.type : undefined;

  const requests = await listPropertyRequestsWithContact({ txn, city, type });

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Demandes de recherche
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Particuliers
          </div>
          <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
            Demandes de recherche
          </h1>
          <p className="text-[15px] text-brand-muted2">
            {requests.length} personne{requests.length > 1 ? 's' : ''}{' '}
            {requests.length > 1 ? 'cherchent' : 'cherche'} actuellement un bien sur ImmoLink.
          </p>
        </div>
        <Link
          href="/demandes/nouvelle"
          className="im-tap cursor-pointer self-start rounded-full bg-brand-green px-5.5 py-2.75 text-sm font-bold text-brand-cream"
        >
          + Publier une demande
        </Link>
      </div>

      <form className="mb-7 flex flex-wrap gap-3 rounded-2xl border border-brand-green/8 bg-white p-4">
        <select
          name="txn"
          defaultValue={txn ?? ''}
          aria-label="Filtrer par achat ou location"
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        >
          <option value="">Achat ou location</option>
          <option value="Vente">Achat</option>
          <option value="Location">Location</option>
        </select>
        <select
          name="type"
          defaultValue={type ?? ''}
          aria-label="Filtrer par type de bien"
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        >
          <option value="">Tous types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          name="city"
          defaultValue={city ?? ''}
          placeholder="Ville"
          aria-label="Filtrer par ville"
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        />
        <button
          type="submit"
          className="im-tap cursor-pointer rounded-xl bg-brand-green-dark px-5 py-2.5 text-sm font-bold text-brand-cream"
        >
          Filtrer
        </button>
      </form>

      {requests.length === 0 ? (
        <p className="text-sm text-brand-muted2">Aucune demande pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((r) => {
            const message = `Bonjour, j'ai peut-être un bien qui correspond à votre recherche « ${r.type} — ${r.city} » sur ImmoLink.`;
            const whatsappHref = r.user.phone ? waMeHref(r.user.phone, message) : null;
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-2xl border border-brand-green/8 bg-white p-5"
              >
                <span className={`text-[13px] font-bold ${txnTextClass(r.txn)}`}>
                  {r.txn === 'Vente' ? 'Recherche à acheter' : 'Recherche à louer'} · {r.type}
                </span>
                <div className="text-[15.5px] font-extrabold text-brand-ink">
                  📍 {r.quartier ? `${r.quartier}, ` : ''}
                  {r.city}
                </div>
                <div className="text-[14px] font-semibold text-brand-muted2">
                  Budget max : {formatFcfa(r.budgetMax)} FCFA
                  {r.txn === 'Location' ? '/mois' : ''}
                  {r.bedsMin > 0 ? ` · ${r.bedsMin}+ chambres` : ''}
                </div>
                {r.message && (
                  <p className="text-[13.5px] leading-relaxed text-brand-slate">{r.message}</p>
                )}
                <div className="mt-1 flex gap-2.5">
                  {r.user.phone ? (
                    <>
                      <a
                        href={`tel:${r.user.phone}`}
                        className="im-tap flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-green py-2.75 text-[13.5px] font-bold text-brand-cream"
                      >
                        📞 Appeler
                      </a>
                      {whatsappHref && (
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="im-tap flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-green/20 py-2.75 text-[13.5px] font-bold text-brand-green"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] font-medium text-brand-muted2">
                      Aucun contact disponible.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
