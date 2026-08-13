// Real dashboard KPIs — replaces the static demo numbers that used to live
// in lib/mock/immolink.ts's KPIS export. All four are 7-day-windowed counts
// (matching the dashboard header's "performance cette semaine" framing),
// each with a trend vs. the preceding 7-day window.
//
// "Contacts" and "Visites" both read from VisitRequest (the only real
// inbound-contact event this app has — "Envoyer un message" is a mailto,
// not tracked): Contacts = every submission, Visites = the subset with a
// `preferredAt` (an actual requested date, not just a lead).
import 'server-only';
import type { PrismaClient } from '@prisma/client';

export interface DashboardKpi {
  l: string;
  v: string;
  trend: string;
  trendClass: string;
  /** 0-100 — rendered via inline style, NOT a Tailwind arbitrary-value class
   * (a dynamically-computed `w-[N%]` string can't be picked up by Tailwind's
   * static source scanner, so it would silently emit no CSS). */
  barWidthPercent: number;
  barClass: string;
}

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const POSITIVE = { trendClass: 'text-brand-green bg-brand-green/10', barClass: 'bg-brand-green' };
const NEGATIVE = { trendClass: 'text-[#a23b2a] bg-[#f6e2dd]', barClass: 'bg-brand-red' };

function trendPercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function toKpi(label: string, current: number, previous: number): DashboardKpi {
  const pct = trendPercent(current, previous);
  const negative = pct !== null && pct < 0;
  const visual = negative ? NEGATIVE : POSITIVE;
  const barWidth = Math.min(100, Math.max(8, 50 + (pct ?? 0)));
  return {
    l: label,
    v: current.toLocaleString('fr-FR'),
    trend: pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct}%`,
    trendClass: visual.trendClass,
    barWidthPercent: barWidth,
    barClass: visual.barClass,
  };
}

export async function getDashboardKpis(
  prisma: PrismaClient,
  ownerId: string,
): Promise<DashboardKpi[]> {
  const properties = await prisma.property.findMany({ where: { ownerId }, select: { id: true } });
  const propertyIds = properties.map((p) => p.id);
  if (propertyIds.length === 0) {
    return [
      toKpi('Vues (7j)', 0, 0),
      toKpi('Favoris', 0, 0),
      toKpi('Contacts', 0, 0),
      toKpi('Visites', 0, 0),
    ];
  }

  const now = new Date();
  const start = new Date(now.getTime() - WINDOW_MS);
  const prevStart = new Date(now.getTime() - 2 * WINDOW_MS);

  const [views, viewsPrev, favs, favsPrev, contacts, contactsPrev, visits, visitsPrev] =
    await Promise.all([
      prisma.propertyView.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: start } },
      }),
      prisma.propertyView.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: prevStart, lt: start } },
      }),
      prisma.favorite.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: start } },
      }),
      prisma.favorite.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: prevStart, lt: start } },
      }),
      prisma.visitRequest.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: start } },
      }),
      prisma.visitRequest.count({
        where: { propertyId: { in: propertyIds }, createdAt: { gte: prevStart, lt: start } },
      }),
      prisma.visitRequest.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: start },
          preferredAt: { not: null },
        },
      }),
      prisma.visitRequest.count({
        where: {
          propertyId: { in: propertyIds },
          createdAt: { gte: prevStart, lt: start },
          preferredAt: { not: null },
        },
      }),
    ]);

  return [
    toKpi('Vues (7j)', views, viewsPrev),
    toKpi('Favoris', favs, favsPrev),
    toKpi('Contacts', contacts, contactsPrev),
    toKpi('Visites', visits, visitsPrev),
  ];
}
