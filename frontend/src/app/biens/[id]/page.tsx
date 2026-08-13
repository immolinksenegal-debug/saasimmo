import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MortgageCalculator } from '@/components/immolink/MortgageCalculator';
import { VisitRequestCard } from '@/components/immolink/VisitRequestCard';
import {
  priceFmt,
  txnTextClass,
  badgeClassFor,
  propertyStats,
  propertyDescription,
  propertyAmenities,
} from '@/lib/mock/immolink';
import { getPropertyById, recordPropertyView } from '@/lib/server/properties';

export const runtime = 'nodejs';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getPropertyById(id);
  if (!property) notFound();
  await recordPropertyView(property.id);

  const stats = propertyStats(property);
  const desc = propertyDescription(property);
  const amenities = propertyAmenities();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-5.5 pb-15 sm:px-8">
      <div className="mb-4 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        /{' '}
        <Link href="/recherche" className="text-brand-muted hover:text-brand-red">
          Recherche
        </Link>{' '}
        / {property.title}
      </div>

      {/* GALLERY */}
      <div className="mb-7.5 grid h-auto grid-cols-1 gap-3 sm:h-110 sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
        <div className="relative h-60 overflow-hidden rounded-[20px] sm:row-span-2 sm:h-auto">
          <Image src={property.image} alt={property.title} fill className="object-cover" />
          <span
            className={`absolute top-4 left-4 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white ${badgeClassFor(property.badge)}`}
          >
            {property.badge}
          </span>
          <span className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3.25 py-1.5 text-[12.5px] font-semibold text-white">
            Visite virtuelle 360° disponible
          </span>
        </div>
        <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
          <Image src={property.image2} alt="" fill className="object-cover" />
        </div>
        <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
          <Image src={property.image3} alt="" fill className="object-cover" />
          <div className="absolute inset-0 flex items-center justify-center rounded-[18px] bg-brand-green/55 text-[15px] font-bold text-white">
            + {property.photos} photos
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_380px]">
        {/* LEFT */}
        <div>
          <div className="flex flex-col gap-3 border-b border-brand-green/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className={`text-[13px] font-bold ${txnTextClass(property.txn)}`}>
                {property.txn} · {property.type}
              </span>
              <h1 className="my-1.5 font-serif text-3xl leading-tight sm:text-4xl">
                {property.title}
              </h1>
              <div className="text-[15px] font-medium text-brand-muted2">
                📍 {property.quartier}, {property.city}
              </div>
            </div>
            <div className="sm:text-right">
              <div className="flex items-baseline gap-1.5 sm:justify-end">
                <span className="font-serif text-[34px] text-brand-green">
                  {priceFmt(property)}
                </span>
                <span className="text-[13px] font-semibold text-brand-muted">{property.unit}</span>
              </div>
              <div className="mt-0.5 text-[12.5px] font-semibold text-brand-muted">
                Charges : {property.charges}
              </div>
            </div>
          </div>

          <div className="my-6 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {stats.map((st) => (
              <div key={st.l} className="rounded-[14px] border border-brand-green/8 bg-white p-4">
                <div className="mb-1 text-xs font-semibold text-brand-muted">{st.l}</div>
                <div className="text-[19px] font-extrabold text-brand-ink">{st.v}</div>
              </div>
            ))}
          </div>

          <h3 className="mt-6.5 mb-2.5 text-[19px] font-extrabold">Description</h3>
          <p className="text-[15px] leading-relaxed text-brand-slate text-pretty">{desc}</p>

          <h3 className="mt-7 mb-3 text-[19px] font-extrabold">Commodités</h3>
          <div className="flex flex-wrap gap-2.5">
            {amenities.map((a) => (
              <span
                key={a}
                className="rounded-xl bg-brand-green/10 px-3.75 py-2.25 text-[13.5px] font-semibold text-brand-ink"
              >
                {a}
              </span>
            ))}
          </div>

          <MortgageCalculator property={property} />
        </div>

        {/* RIGHT — contact */}
        <aside className="lg:sticky lg:top-24">
          <VisitRequestCard
            propertyId={property.id}
            propertyTitle={property.title}
            agent={property.agent}
            agency={property.agency}
            views={property.views + 1}
            favs={property.favs}
          />
          <div className="mt-3.5 rounded-2xl border border-brand-red/25 bg-[#FBF3D2] px-4.5 py-4 text-[13px] leading-relaxed font-semibold text-[#6E1010]">
            🛡️ Annonce vérifiée par ImmoLink. Ne versez jamais d&apos;argent avant la visite.
          </div>
        </aside>
      </div>
    </main>
  );
}
