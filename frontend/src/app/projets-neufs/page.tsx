// /projets-neufs — promoter programs (new-construction developments), the
// same PROGRAMS data already teased on the homepage's "Programmes
// immobiliers neufs" section. Distinct concept from "Nouvelles annonces"
// (recently published listings by any seller): these are curated
// promoter-led developments, not individual Property rows — there's no
// dedicated Program model yet, so each card links to a real /recherche
// search scoped to that program's city.
import Image from 'next/image';
import Link from 'next/link';
import { PROGRAMS } from '@/lib/mock/immolink';

export default function NewProgramsPage() {
  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Projets neufs
      </div>
      <div className="mb-8 max-w-2xl">
        <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
          Promoteurs
        </div>
        <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
          Programmes immobiliers neufs
        </h1>
        <p className="text-[15px] text-brand-muted2">
          Des développements sélectionnés par ImmoLink — villas, appartements et lots viabilisés en
          cours de commercialisation au Sénégal et en Afrique de l&apos;Ouest.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PROGRAMS.map((pr) => (
          <Link
            key={pr.name}
            href={`/recherche?q=${encodeURIComponent(pr.city)}`}
            className="overflow-hidden rounded-2xl border border-brand-green/8 bg-white transition-transform hover:-translate-y-1"
          >
            <div className="relative h-48">
              <Image src={pr.image} alt={pr.name} fill className="object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.75 py-1 text-xs font-bold text-white">
                {pr.status}
              </span>
            </div>
            <div className="p-4.5">
              <h3 className="mb-0.5 text-lg font-extrabold">{pr.name}</h3>
              <div className="mb-3 text-[13px] font-semibold text-brand-muted">
                {pr.city} · {pr.lots}
              </div>
              <div className="text-[13px] font-semibold text-brand-slate">
                À partir de <span className="font-extrabold text-brand-green">{pr.from}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
