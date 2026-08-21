// /projets-neufs — programmes immobiliers neufs publiés par leurs
// promoteurs (InvestmentProject). Remplace le mock PROGRAMS.
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvestmentProjectCard } from '@/components/immolink/InvestmentProjectCard';
import { listInvestmentProjects } from '@/lib/server/investment-projects';

export const runtime = 'nodejs';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Programmes immobiliers neufs au Sénégal',
  description:
    "Découvrez les programmes immobiliers neufs des promoteurs partenaires d'ImmoLink Sénégal — appartements et villas en construction à Dakar et ailleurs au Sénégal.",
  alternates: { canonical: '/projets-neufs' },
};

export default async function NewProgramsPage() {
  const projects = await listInvestmentProjects();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Projets neufs
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Promoteurs
          </div>
          <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
            Programmes immobiliers neufs
          </h1>
          <p className="text-[15px] text-brand-muted2">
            Des projets publiés directement par leurs promoteurs — villas, appartements et lots
            viabilisés en cours de commercialisation au Sénégal.
          </p>
        </div>
        <Link
          href="/projets-neufs/nouveau"
          className="im-tap self-start rounded-xl bg-brand-green px-5.5 py-3 text-sm font-bold whitespace-nowrap text-brand-cream"
        >
          + Publier mon projet
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-brand-muted2">
          Aucun projet publié pour le moment — revenez bientôt, ou{' '}
          <Link href="/projets-neufs/nouveau" className="font-semibold text-brand-green underline">
            publiez le vôtre
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <InvestmentProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </main>
  );
}
