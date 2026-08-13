import Link from 'next/link';
import Image from 'next/image';
import { HomeSearchPanel } from '@/components/immolink/HomeSearchPanel';
import { PropertyCard } from '@/components/immolink/PropertyCard';
import { HERO_STATS, PROGRAMS, PACKS, TESTIMONIALS } from '@/lib/mock/immolink';
import { listProperties } from '@/lib/server/properties';

export const runtime = 'nodejs';
// New listings should show up without a full redeploy — revalidate this
// static page every minute instead of caching it forever at build time.
export const revalidate = 60;

export default async function Home() {
  const all = await listProperties({ take: 24 });
  const featured = all.filter((p) => ['Premium', 'Coup de cœur'].includes(p.badge)).slice(0, 3);
  const recent = all.slice(0, 6);

  return (
    <main className="animate-im-fade">
      {/* HERO */}
      <section className="relative overflow-hidden bg-brand-green text-brand-cream">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_500px_at_80%_-10%,rgba(200,30,30,.35),transparent_60%),radial-gradient(900px_600px_at_-10%_120%,rgba(242,194,0,.22),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 pt-19 pb-23 sm:px-8">
          <div className="max-w-xl">
            <div className="mb-5.5 inline-flex items-center gap-2 rounded-full border border-brand-cream/20 bg-brand-cream/12 px-3.5 py-1.5 text-[13px] font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-red" />
              Connecter · Investir · Réaliser — L&apos;immobilier du Sénégal réuni
            </div>
            <h1 className="mb-4.5 font-serif text-5xl leading-[1.02] font-normal tracking-tight sm:text-6xl">
              Trouvez le bien qui vous ressemble,{' '}
              <span className="text-brand-gold italic">où que vous soyez.</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-brand-cream/82">
              Acheter, louer, vendre ou investir — particuliers, agences et promoteurs réunis sur
              une seule plateforme premium.
            </p>
          </div>

          <HomeSearchPanel />

          <div className="mt-8.5 flex flex-wrap gap-11">
            {HERO_STATS.map((s) => (
              <div key={s.l}>
                <div className="font-serif text-[34px] leading-none">{s.v}</div>
                <div className="text-[13px] font-semibold text-brand-cream/70">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BIENS A LA UNE */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-2 sm:px-8">
        <div className="mb-6.5 flex items-end justify-between">
          <div>
            <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
              Sélection premium
            </div>
            <h2 className="font-serif text-4xl leading-none font-normal">Biens à la Une</h2>
          </div>
          <Link
            href="/recherche?txn=vente"
            className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
          >
            Voir tout →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <PropertyCard key={p.id} property={p} size="lg" />
          ))}
        </div>
      </section>

      {/* PROJETS NEUFS */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-green-dark p-6 text-brand-cream sm:p-11">
          <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0,rgba(242,194,0,.22),transparent_60%)]" />
          <div className="relative mb-6.5 flex items-end justify-between">
            <div>
              <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-gold uppercase">
                Promoteurs
              </div>
              <h2 className="font-serif text-3xl leading-none font-normal sm:text-[38px]">
                Programmes immobiliers neufs
              </h2>
            </div>
            <Link href="/projets-neufs" className="text-sm font-bold text-brand-gold">
              Explorer →
            </Link>
          </div>
          <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-3">
            {PROGRAMS.map((pr) => (
              <Link
                key={pr.name}
                href={`/recherche?q=${encodeURIComponent(pr.city)}`}
                className="overflow-hidden rounded-2xl border border-brand-cream/14 bg-brand-cream/6"
              >
                <div className="relative h-37.5">
                  <Image src={pr.image} alt={pr.name} fill className="object-cover" />
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.75 py-1 text-xs font-bold text-white">
                    {pr.status}
                  </span>
                </div>
                <div className="p-4.5">
                  <h3 className="mb-0.5 text-lg font-extrabold">{pr.name}</h3>
                  <div className="mb-3 text-[13px] text-brand-cream/66">
                    {pr.city} · {pr.lots}
                  </div>
                  <div className="text-[13px] font-semibold text-brand-cream/82">
                    À partir de <span className="font-extrabold text-brand-gold">{pr.from}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* NOUVELLES ANNONCES */}
      <section className="mx-auto max-w-6xl px-4 pt-15 pb-2 sm:px-8">
        <div className="mb-6.5 flex items-end justify-between">
          <div>
            <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
              Fraîchement publiés
            </div>
            <h2 className="font-serif text-4xl leading-none font-normal">Nouvelles annonces</h2>
          </div>
          <Link
            href="/recherche?txn=vente"
            className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
          >
            Voir tout →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((p) => (
            <PropertyCard key={p.id} property={p} size="md" />
          ))}
        </div>
      </section>

      {/* TEMOIGNAGES */}
      <section className="mx-auto max-w-6xl px-4 pt-16.5 pb-2 sm:px-8">
        <div className="mb-8.5 text-center">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Avis clients
          </div>
          <h2 className="mb-2 font-serif text-4xl leading-none font-normal sm:text-[42px]">
            Ils ont trouvé leur bien avec ImmoLink
          </h2>
          <p className="mx-auto max-w-lg text-base text-brand-muted2">
            Particuliers, acheteurs et agences partagent leur expérience.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.name}
              className="flex flex-col gap-4 rounded-[20px] border border-brand-green/8 bg-white p-6.5 px-6 shadow-[0_14px_30px_-24px_rgba(0,0,0,0.4)]"
            >
              <div className="flex gap-0.5 text-[15px] text-brand-gold">{t.stars}</div>
              <blockquote className="flex-1 text-[15.5px] leading-relaxed font-medium text-brand-slate text-pretty">
                “{t.quote}”
              </blockquote>
              <figcaption className="flex items-center gap-3 border-t border-brand-green/8 pt-1.5">
                <div
                  className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-[15px] font-extrabold text-white ${t.avatarClass}`}
                >
                  {t.init}
                </div>
                <div>
                  <div className="text-[14.5px] font-extrabold text-[#14213D]">{t.name}</div>
                  <div className="text-[12.5px] font-semibold text-brand-muted">{t.role}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* PACKS TEASER */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-2 sm:px-8">
        <div className="mb-8.5 text-center">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Monétisation
          </div>
          <h2 className="mb-2 font-serif text-4xl leading-none font-normal sm:text-[42px]">
            Des packs pour chaque ambition
          </h2>
          <p className="mx-auto max-w-lg text-base text-brand-muted2">
            Particuliers, agences ou promoteurs — publiez, mettez en avant et pilotez vos biens.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
          {PACKS.map((pk) => (
            <div key={pk.name} className={`relative rounded-2xl px-5.5 py-6.5 ${pk.card}`}>
              {pk.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-red px-3 py-1.5 text-[11px] font-extrabold tracking-wide text-white">
                  POPULAIRE
                </span>
              )}
              <div className="mb-2.5 text-[13px] font-bold tracking-wide opacity-70 uppercase">
                {pk.name}
              </div>
              <div className="mb-0.5 font-serif text-[34px]">{pk.price}</div>
              <div className="mb-4.5 text-[12.5px] opacity-65">{pk.per}</div>
              <div className="mb-5.5 flex flex-col gap-2.5">
                {pk.features.map((f) => (
                  <div key={f} className="flex items-start gap-2 text-[13.5px] font-medium">
                    <span className={pk.check}>✓</span>
                    {f}
                  </div>
                ))}
              </div>
              <Link
                href={pk.action === 'create' ? '/annonces/nouvelle' : '/dashboard'}
                className={`block w-full rounded-xl py-3 text-center text-sm font-bold ${pk.button}`}
              >
                {pk.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
