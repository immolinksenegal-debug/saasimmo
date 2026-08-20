import 'server-only';
import { NextResponse } from 'next/server';
import type { Property } from '@prisma/client';
import { prisma } from './prisma';

// Owner used for listings created by anonymous visitors — there's no
// login page in the app yet, so POST /api/properties falls back to this
// seeded demo seller instead of hard-requiring auth. Swap for `requireAuth`
// once /login exists. Seeded by `pnpm seed:properties`.
export const DEMO_SELLER_EMAIL = 'aicha.demo@immolink.sn';

export type PropertySort = 'recent' | 'price_asc' | 'price_desc';

export interface PropertyFilter {
  txn?: 'Vente' | 'Location' | undefined;
  city?: string | undefined;
  q?: string | undefined;
  type?: string | undefined;
  agency?: string | undefined;
  priceMax?: number | undefined;
  bedsMin?: number | undefined;
  ownerId?: string | undefined;
  sort?: PropertySort | undefined;
  take?: number | undefined;
}

function orderByFor(sort: PropertySort | undefined) {
  if (sort === 'price_asc') return { price: 'asc' as const };
  if (sort === 'price_desc') return { price: 'desc' as const };
  return { createdAt: 'desc' as const };
}

export async function listProperties(filter: PropertyFilter = {}): Promise<Property[]> {
  const { txn, city, q, type, agency, priceMax, bedsMin, ownerId, sort, take } = filter;
  return prisma.property.findMany({
    where: {
      status: 'ACTIVE',
      ...(txn ? { txn } : {}),
      ...(city ? { city } : {}),
      ...(type ? { type } : {}),
      ...(agency ? { agency } : {}),
      ...(priceMax ? { price: { lte: priceMax } } : {}),
      ...(bedsMin ? { beds: { gte: bedsMin } } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(q?.trim()
        ? {
            OR: [
              { title: { contains: q.trim(), mode: 'insensitive' } },
              { city: { contains: q.trim(), mode: 'insensitive' } },
              { quartier: { contains: q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: orderByFor(sort),
    ...(take ? { take } : {}),
  });
}

export interface AgencySummary {
  agency: string;
  listingCount: number;
  city: string;
  image: string;
}

/**
 * Real agency directory — powers `/agences`. Derived straight from
 * `Property.agency` (there's no dedicated Agency model yet); grouped by
 * name with a listing count and a representative city/image pulled from
 * that agency's most recent active listing.
 */
export async function listAgencies(): Promise<AgencySummary[]> {
  const grouped = await prisma.property.groupBy({
    by: ['agency'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });

  const summaries = await Promise.all(
    grouped.map(async (g): Promise<AgencySummary> => {
      const sample = await prisma.property.findFirst({
        where: { status: 'ACTIVE', agency: g.agency },
        orderBy: { createdAt: 'desc' },
        select: { city: true, image: true },
      });
      return {
        agency: g.agency,
        listingCount: g._count._all,
        city: sample?.city ?? '',
        image: sample?.image ?? '',
      };
    }),
  );

  return summaries.sort((a, b) => b.listingCount - a.listingCount);
}

export async function getPropertyById(id: string): Promise<Property | null> {
  return prisma.property.findFirst({ where: { id, status: 'ACTIVE' } });
}

export interface OwnerContact {
  email: string;
  /** E.164, or null if the owner hasn't set one in Settings. */
  phone: string | null;
}

/**
 * Same lookup as `getPropertyById`, plus the owner's contact info — shown
 * publicly on `/biens/[id]` so visitors can reach the owner directly
 * (call/WhatsApp/email). Kept separate from `getPropertyById` (used by the
 * public JSON API) so `GET /api/properties/[id]` doesn't leak owner PII to
 * scrapers hitting the API directly.
 */
export async function getPropertyWithOwnerById(
  id: string,
): Promise<(Property & { owner: OwnerContact }) | null> {
  return prisma.property.findFirst({
    where: { id, status: 'ACTIVE' },
    include: { owner: { select: { email: true, phone: true } } },
  });
}

export interface InvestmentStats {
  rentalCount: number;
  opportunityCount: number;
  /** FCFA/m², averaged over active Vente listings with a known surface. */
  avgPricePerM2Vente: number | null;
  /** FCFA/month, averaged over active Location listings. */
  avgRentLocation: number | null;
}

/**
 * Real, computed stats for `/investir` — no fabricated "rendement locatif %"
 * (that would need a sale-price/rent pairing per property that doesn't
 * exist in this data model) — only numbers directly derivable from real
 * Property rows.
 */
export async function getInvestmentStats(): Promise<InvestmentStats> {
  const [venteRows, locationAgg, opportunityCount] = await Promise.all([
    prisma.property.findMany({
      where: { status: 'ACTIVE', txn: 'Vente', surface: { gt: 0 } },
      select: { price: true, surface: true },
    }),
    prisma.property.aggregate({
      where: { status: 'ACTIVE', txn: 'Location' },
      _avg: { price: true },
      _count: { _all: true },
    }),
    prisma.property.count({ where: { status: 'ACTIVE', badge: 'Opportunité' } }),
  ]);

  const avgPricePerM2Vente = venteRows.length
    ? Math.round(venteRows.reduce((sum, r) => sum + r.price / r.surface, 0) / venteRows.length)
    : null;

  return {
    rentalCount: locationAgg._count._all,
    opportunityCount,
    avgPricePerM2Vente,
    avgRentLocation: locationAgg._avg.price ? Math.round(locationAgg._avg.price) : null,
  };
}

/**
 * Curated picks for `/investir`: `Opportunité`-badged listings first (an
 * explicit seller/admin signal), topped up with the cheapest active rentals
 * so the page always has something real to show even with few/no
 * Opportunité rows.
 */
export async function listInvestmentOpportunities(take = 6): Promise<Property[]> {
  const opportunities = await prisma.property.findMany({
    where: { status: 'ACTIVE', badge: 'Opportunité' },
    orderBy: { createdAt: 'desc' },
    take,
  });
  if (opportunities.length >= take) return opportunities;

  const fillers = await prisma.property.findMany({
    where: {
      status: 'ACTIVE',
      txn: 'Location',
      id: { notIn: opportunities.map((p) => p.id) },
    },
    orderBy: { price: 'asc' },
    take: take - opportunities.length,
  });
  return [...opportunities, ...fillers];
}

/**
 * Records a detail-page view: bumps the fast denormalized `Property.views`
 * counter and logs a `PropertyView` row (powers the dashboard's real,
 * time-windowed "Vues (7j)" KPI — the counter alone can't answer "how many
 * this week"). Not deduped per visitor/session — every page load counts,
 * matching the simple semantics of the pre-existing `views` counter.
 */
export async function recordPropertyView(propertyId: string): Promise<void> {
  await prisma.$transaction([
    prisma.property.update({ where: { id: propertyId }, data: { views: { increment: 1 } } }),
    prisma.propertyView.create({ data: { propertyId } }),
  ]);
}

export async function listPropertiesByOwner(ownerId: string): Promise<Property[]> {
  return prisma.property.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });
}

export function serializeProperty(p: Property): Omit<Property, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
} {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() };
}

export async function resolveOwnerId(
  authUserId: string | undefined,
): Promise<string | NextResponse> {
  if (authUserId) return authUserId;
  const demo = await prisma.user.findUnique({
    where: { email: DEMO_SELLER_EMAIL },
    select: { id: true },
  });
  if (!demo) {
    return NextResponse.json(
      {
        error: 'NO_OWNER',
        message: 'Sign in, or run `pnpm seed:properties` to seed the demo seller account.',
      },
      { status: 503 },
    );
  }
  return demo.id;
}
