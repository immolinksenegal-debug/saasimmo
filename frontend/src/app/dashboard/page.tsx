import Link from 'next/link';
import { OpenPacksButton } from '@/components/immolink/OpenPacksButton';
import { DeleteListingButton } from '@/components/immolink/DeleteListingButton';
import { priceFmt, notificationVisual, timeAgo } from '@/lib/mock/immolink';
import { listPropertiesByOwner, DEMO_SELLER_EMAIL } from '@/lib/server/properties';
import { getDashboardKpis } from '@/lib/server/dashboard';
import { isSubscriptionActive } from '@/lib/server/subscriptions';
import { FREE_LISTING_QUOTA } from '@/lib/server/subscriptions/plans';
import { optionalAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

export default async function DashboardPage() {
  const auth = await optionalAuth();
  let ownerId = auth?.user.sub;
  if (!ownerId) {
    const demoSeller = await prisma.user.findUnique({
      where: { email: DEMO_SELLER_EMAIL },
      select: { id: true },
    });
    ownerId = demoSeller?.id;
  }
  const rows = ownerId ? await listPropertiesByOwner(ownerId) : [];
  const [notifications, kpis, subscription, ownerUser] = ownerId
    ? await Promise.all([
        prisma.notification.findMany({
          where: { userId: ownerId },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        getDashboardKpis(prisma, ownerId),
        prisma.subscription.findUnique({ where: { userId: ownerId } }),
        prisma.user.findUnique({ where: { id: ownerId }, select: { name: true, email: true } }),
      ])
    : [[], [], null, null];

  const displayName = ownerUser?.name?.trim() || ownerUser?.email?.split('@')[0] || 'vendeur';

  const top4 = rows.slice(0, 4);
  const top4Ids = top4.map((p) => p.id);
  const [contactsByProperty, visitsByProperty] = await Promise.all([
    prisma.visitRequest.groupBy({
      by: ['propertyId'],
      where: { propertyId: { in: top4Ids } },
      _count: true,
    }),
    prisma.visitRequest.groupBy({
      by: ['propertyId'],
      where: { propertyId: { in: top4Ids }, preferredAt: { not: null } },
      _count: true,
    }),
  ]);
  const contactsMap = new Map(contactsByProperty.map((r) => [r.propertyId, r._count]));
  const visitsMap = new Map(visitsByProperty.map((r) => [r.propertyId, r._count]));
  const myListings = top4.map((p) => ({
    id: p.id,
    title: p.title,
    price: `${priceFmt(p)}${p.unit}`,
    status: p.status === 'ACTIVE' ? 'En ligne' : p.status,
    views: p.views,
    contacts: contactsMap.get(p.id) ?? 0,
    visits: visitsMap.get(p.id) ?? 0,
  }));

  const activeListingCount = rows.filter((p) => p.status === 'ACTIVE').length;
  const subscriptionActive = isSubscriptionActive(subscription);
  const planLabel = subscriptionActive && subscription ? subscription.plan : 'Gratuit';
  const listingQuota =
    subscriptionActive && subscription ? subscription.listingQuota : FREE_LISTING_QUOTA;
  const quotaPercent = Math.min(100, Math.round((activeListingCount / listingQuota) * 100));

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-7.5 pb-15 sm:px-8">
      <div className="mb-6.5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Espace vendeur
          </div>
          <h1 className="font-serif text-3xl leading-none sm:text-[38px]">
            Bonjour, {displayName} 👋
          </h1>
          <p className="mt-1.5 text-[15px] text-brand-muted2">
            Voici la performance de vos annonces cette semaine.
          </p>
        </div>
        <OpenPacksButton className="cursor-pointer self-start rounded-xl bg-brand-green px-5.5 py-3 text-sm font-bold text-brand-cream">
          + Nouvelle annonce
        </OpenPacksButton>
      </div>

      {/* KPI */}
      <div className="mb-6 grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-[18px] border border-brand-green/8 bg-white p-5.5">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="text-[13px] font-bold text-brand-muted">{k.l}</span>
              <span
                className={`rounded-full px-2.25 py-0.75 text-xs font-extrabold ${k.trendClass}`}
              >
                {k.trend}
              </span>
            </div>
            <div className="font-serif text-[38px] leading-none text-brand-ink">{k.v}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-brand-green/10">
              <div
                className={`h-full rounded-full ${k.barClass}`}
                style={{ width: `${k.barWidthPercent}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_350px]">
        {/* LISTINGS TABLE */}
        <div className="overflow-hidden rounded-[20px] border border-brand-green/8 bg-white">
          <div className="flex items-center justify-between border-b border-brand-green/8 px-6 py-5">
            <h3 className="text-lg font-extrabold">Mes annonces</h3>
            <span className="text-[13px] font-semibold text-brand-muted">
              {myListings.length} actives
            </span>
          </div>
          <div className="hidden grid-cols-[2fr_0.8fr_0.7fr_0.8fr_0.7fr_1.3fr] border-b border-brand-green/6 px-6 py-3 text-[11.5px] font-extrabold tracking-wide text-brand-muted uppercase sm:grid">
            <span>Bien</span>
            <span>Statut</span>
            <span>Vues</span>
            <span>Contacts</span>
            <span>Visites</span>
            <span>Actions</span>
          </div>
          {myListings.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-2 border-b border-brand-green/5 px-6 py-3.5 sm:grid sm:grid-cols-[2fr_0.8fr_0.7fr_0.8fr_0.7fr_1.3fr] sm:items-center sm:gap-0"
            >
              <Link href={`/biens/${l.id}`} className="flex items-center gap-3">
                <div className="h-12 w-12 flex-none rounded-[10px] bg-brand-green/15" />
                <div>
                  <div className="text-[14.5px] font-bold">{l.title}</div>
                  <div className="text-xs font-semibold text-brand-muted">{l.price}</div>
                </div>
              </Link>
              <span>
                <span className="rounded-full bg-brand-green/10 px-2.75 py-1 text-xs font-bold text-brand-green">
                  {l.status}
                </span>
              </span>
              <span className="text-sm font-bold">{l.views}</span>
              <span className="text-sm font-bold">{l.contacts}</span>
              <span className="text-sm font-bold">{l.visits}</span>
              <span className="flex items-center gap-3">
                <Link
                  href={`/annonces/${l.id}/modifier`}
                  className="im-tap text-[13px] font-bold text-brand-green underline"
                >
                  Modifier
                </Link>
                <DeleteListingButton
                  propertyId={l.id}
                  title={l.title}
                  className="im-tap cursor-pointer text-[13px] font-bold text-brand-red underline disabled:opacity-50"
                />
              </span>
            </div>
          ))}
        </div>

        {/* SIDE */}
        <div className="flex flex-col gap-4.5">
          <div className="relative overflow-hidden rounded-[20px] bg-brand-green-dark p-5.5 text-brand-cream">
            <div className="absolute inset-0 bg-[radial-gradient(400px_160px_at_100%_0,rgba(242,194,0,.22),transparent)]" />
            <div className="relative">
              <div className="mb-1 text-[13px] font-bold text-brand-gold">Pack {planLabel}</div>
              <div className="mb-3.5 text-[13.5px] text-brand-cream/80">
                {activeListingCount} / {listingQuota} annonces utilisées
              </div>
              <div className="mb-3.5 h-2 overflow-hidden rounded-full bg-brand-cream/15">
                <div
                  className="h-full rounded-full bg-brand-red"
                  style={{ width: `${quotaPercent}%` }}
                />
              </div>
              <div className="mb-4 text-[12.5px] text-brand-cream/70">
                {subscriptionActive && subscription
                  ? `Renouvellement le ${subscription.renewsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Pack gratuit — 1 annonce active incluse'}
              </div>
              <OpenPacksButton className="w-full cursor-pointer rounded-[11px] bg-brand-gold py-2.75 text-[13.5px] font-extrabold text-brand-green-dark">
                Améliorer mon pack
              </OpenPacksButton>
            </div>
          </div>
          <div className="rounded-[20px] border border-brand-green/8 bg-white p-5.5">
            <h3 className="mb-3.5 text-base font-extrabold">Notifications</h3>
            {notifications.length === 0 ? (
              <p className="text-[13px] font-medium text-brand-muted2">
                Aucune notification pour le moment.
              </p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {notifications.map((n) => {
                  const visual = notificationVisual(n.type);
                  return (
                    <div key={n.id} className="flex items-start gap-2.75">
                      <span
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-[9px] text-[15px] ${visual.bg}`}
                      >
                        {visual.icon}
                      </span>
                      <div>
                        <div className="text-[13.5px] leading-snug font-semibold">{n.body}</div>
                        <div className="mt-0.5 text-[11.5px] font-semibold text-brand-muted">
                          {timeAgo(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
