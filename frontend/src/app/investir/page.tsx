// /investir — real investment stats + curated opportunities. No fabricated
// "rendement locatif %" — see getInvestmentStats() for why (no sale/rent
// pairing exists in the data model to compute a real yield from).
import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyCard } from '@/components/immolink/PropertyCard';
import { InvestmentProjectCard } from '@/components/immolink/InvestmentProjectCard';
import { getInvestmentStats, listInvestmentOpportunities } from '@/lib/server/properties';
import { listInvestmentProjects } from '@/lib/server/investment-projects';
import { formatFcfa } from '@/lib/mock/immolink';

export const runtime = 'nodejs';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Investir dans l’immobilier au Sénégal',
  description:
    'Prix moyen au m², rendements locatifs et opportunités d’investissement immobilier au Sénégal — données réelles issues des annonces actives sur ImmoLink.',
  alternates: { canonical: '/investir' },
};

export default async function InvestPage() {
  const [stats, opportunities, projects] = await Promise.all([
    getInvestmentStats(),
    listInvestmentOpportunities(6),
    listInvestmentProjects({ take: 3 }),
  ]);

  const statCards = [
    { l: 'Biens à louer disponibles', v: stats.rentalCount.toLocaleString('fr-FR') },
    { l: 'Opportunités identifiées', v: stats.opportunityCount.toLocaleString('fr-FR') },
    {
      l: 'Prix moyen au m² (vente)',
      v: stats.avgPricePerM2Vente ? `${formatFcfa(stats.avgPricePerM2Vente)} FCFA` : '—',
    },
    {
      l: 'Loyer moyen (location)',
      v: stats.avgRentLocation ? `${formatFcfa(stats.avgRentLocation)} FCFA/mois` : '—',
    },
  ];

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Investir
      </div>
      <div className="mb-8 max-w-2xl">
        <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
          Investisseurs
        </div>
        <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
          Investir dans l&apos;immobilier sénégalais
        </h1>
        <p className="text-[15px] text-brand-muted2">
          Achetez pour louer, ou repérez les meilleures opportunités du marché — simulez votre
          financement directement sur chaque annonce.
        </p>
      </div>

      <div className="mb-9 grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.l} className="rounded-[18px] border border-brand-green/8 bg-white p-5.5">
            <div className="mb-2 text-[13px] font-bold text-brand-muted">{s.l}</div>
            <div className="font-serif text-[30px] leading-none text-brand-ink">{s.v}</div>
          </div>
        ))}
      </div>

      {projects.length > 0 && (
        <div className="mb-9">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-serif text-3xl leading-none font-normal">Projets à financer</h2>
            <Link
              href="/projets-neufs"
              className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
            >
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <InvestmentProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-serif text-3xl leading-none font-normal">Opportunités du moment</h2>
        <Link
          href="/recherche?txn=location"
          className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
        >
          Voir tout →
        </Link>
      </div>

      {opportunities.length === 0 ? (
        <p className="text-sm text-brand-muted2">
          Aucune opportunité disponible pour le moment — revenez bientôt.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {opportunities.map((p) => (
            <PropertyCard key={p.id} property={p} size="md" />
          ))}
        </div>
      )}
    </main>
  );
}
