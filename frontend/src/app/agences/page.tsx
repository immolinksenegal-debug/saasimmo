// /agences — real agency directory, derived from Property.agency (no
// dedicated Agency model yet — see listAgencies() in lib/server/properties.ts).
import Image from 'next/image';
import Link from 'next/link';
import { listAgencies } from '@/lib/server/properties';
import { agentInitials } from '@/lib/mock/immolink';

export const runtime = 'nodejs';
export const revalidate = 60;

export default async function AgenciesPage() {
  const agencies = await listAgencies();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Agences
      </div>
      <div className="mb-8 max-w-2xl">
        <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
          Professionnels
        </div>
        <h1 className="mb-2 font-serif text-4xl leading-none font-normal">Agences partenaires</h1>
        <p className="text-[15px] text-brand-muted2">
          {agencies.length} agence{agencies.length > 1 ? 's' : ''} publient actuellement des
          annonces sur ImmoLink.
        </p>
      </div>

      {agencies.length === 0 ? (
        <p className="text-sm text-brand-muted2">Aucune agence pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {agencies.map((a) => (
            <Link
              key={a.agency}
              href={`/recherche?agency=${encodeURIComponent(a.agency)}`}
              className="flex items-center gap-4 overflow-hidden rounded-2xl border border-brand-green/8 bg-white p-5 transition-transform hover:-translate-y-0.5"
            >
              {a.image ? (
                <div className="relative h-14 w-14 flex-none overflow-hidden rounded-xl">
                  <Image src={a.image} alt="" fill className="object-cover" />
                </div>
              ) : (
                <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-linear-to-br from-brand-green to-[#12764A] text-[15px] font-extrabold text-white">
                  {agentInitials(a.agency)}
                </div>
              )}
              <div>
                <div className="text-[15.5px] font-extrabold">{a.agency}</div>
                <div className="text-[13px] font-semibold text-brand-muted">
                  {a.listingCount} annonce{a.listingCount > 1 ? 's' : ''}
                  {a.city ? ` · ${a.city}` : ''}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
