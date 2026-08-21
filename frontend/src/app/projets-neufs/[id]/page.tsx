import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvestmentInterestCard } from '@/components/immolink/InvestmentInterestCard';
import { OwnerContactCard } from '@/components/immolink/OwnerContactCard';
import { formatFcfa } from '@/lib/mock/immolink';
import { getInvestmentProjectWithOwnerById } from '@/lib/server/investment-projects';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getInvestmentProjectWithOwnerById(id);
  if (!project) return {};

  const title = `${project.title} — projet d'investissement à ${project.quartier}, ${project.city}`;
  const description = project.description.slice(0, 200);
  const url = `${SITE_URL}/projets-neufs/${project.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      images: [{ url: project.image, alt: project.title }],
    },
  };
}

export default async function InvestmentProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getInvestmentProjectWithOwnerById(id);
  if (!project) notFound();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-5.5 pb-15 sm:px-8">
      <div className="mb-4 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        /{' '}
        <Link href="/projets-neufs" className="text-brand-muted hover:text-brand-red">
          Projets neufs
        </Link>{' '}
        / {project.title}
      </div>

      <div className="mb-7.5 grid h-auto grid-cols-1 gap-3 sm:h-110 sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
        <div className="relative h-60 overflow-hidden rounded-[20px] sm:row-span-2 sm:h-auto">
          <Image src={project.image} alt={project.title} fill className="object-cover" />
          <span className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3.25 py-1.5 text-[12.5px] font-semibold text-white">
            {project.status}
          </span>
        </div>
        {project.image2 && (
          <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
            <Image src={project.image2} alt="" fill className="object-cover" />
          </div>
        )}
        {project.image3 && (
          <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
            <Image src={project.image3} alt="" fill className="object-cover" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-col gap-3 border-b border-brand-green/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-[13px] font-bold text-brand-red">
                {project.type} · {project.lotsLabel}
              </span>
              <h1 className="my-1.5 font-serif text-3xl leading-tight sm:text-4xl">
                {project.title}
              </h1>
              <div className="text-[15px] font-medium text-brand-muted2">
                📍 {project.quartier}, {project.city}
              </div>
              {project.developerName && (
                <div className="mt-1 text-[13px] font-semibold text-brand-muted">
                  Par {project.developerName}
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <div className="text-[13px] font-semibold text-brand-muted">À partir de</div>
              <span className="font-serif text-[34px] text-brand-green">
                {formatFcfa(project.priceFrom)} FCFA
              </span>
            </div>
          </div>

          <h3 className="mt-6.5 mb-2.5 text-[19px] font-extrabold">Description</h3>
          <p className="text-[15px] leading-relaxed text-brand-slate text-pretty">
            {project.description}
          </p>
        </div>

        <aside className="lg:sticky lg:top-24">
          <InvestmentInterestCard projectId={project.id} projectTitle={project.title} />
          <OwnerContactCard
            ownerPhone={project.owner.phone}
            ownerEmail={project.owner.email}
            propertyTitle={project.title}
            contextLabel="projet"
          />
          <div className="mt-3.5 rounded-2xl border border-brand-red/25 bg-[#FBF3D2] px-4.5 py-4 text-[13px] leading-relaxed font-semibold text-[#6E1010]">
            🛡️ Projet publié via ImmoLink. Ne versez jamais d&apos;argent avant vérification directe
            auprès du porteur de projet.
          </div>
        </aside>
      </div>
    </main>
  );
}
