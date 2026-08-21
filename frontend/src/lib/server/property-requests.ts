// ImmoLink Sénégal — "demandes de recherche". Symmetric to
// src/lib/server/properties.ts but for the opposite side of the market: a
// particulier expresses what they're looking for instead of listing a bien
// they own. See docs/superpowers/specs/2026-08-21-demandes-recherche-design.md.
import 'server-only';
import type { PropertyRequest } from '@prisma/client';
import { prisma } from './prisma';

export interface PropertyRequestFilter {
  txn?: 'Vente' | 'Location' | undefined;
  city?: string | undefined;
  type?: string | undefined;
}

export interface PropertyRequestInput {
  txn: 'Vente' | 'Location';
  type: string;
  city: string;
  quartier?: string | undefined;
  budgetMax: number;
  bedsMin: number;
  message?: string | undefined;
}

function whereFor(filter: PropertyRequestFilter) {
  const { txn, city, type } = filter;
  return {
    status: 'ACTIVE' as const,
    ...(txn ? { txn } : {}),
    ...(city ? { city: { contains: city.trim(), mode: 'insensitive' as const } } : {}),
    ...(type ? { type } : {}),
  };
}

/** Public listing — no requester contact info. Used by GET /api/property-requests. */
export async function listPropertyRequests(
  filter: PropertyRequestFilter = {},
): Promise<PropertyRequest[]> {
  return prisma.propertyRequest.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Same rows as listPropertyRequests, plus the requester's contact phone —
 * shown publicly on /demandes so an agency/owner can reach them directly.
 * Kept separate so GET /api/property-requests (a scrapable public JSON API)
 * never leaks the phone — same split as getPropertyWithOwnerById vs
 * getPropertyById in properties.ts.
 */
export async function listPropertyRequestsWithContact(
  filter: PropertyRequestFilter = {},
): Promise<(PropertyRequest & { user: { phone: string | null } })[]> {
  return prisma.propertyRequest.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { phone: true } } },
  });
}

export async function listPropertyRequestsByOwner(userId: string): Promise<PropertyRequest[]> {
  return prisma.propertyRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPropertyRequest(
  userId: string,
  data: PropertyRequestInput,
): Promise<{ id: string }> {
  return prisma.propertyRequest.create({
    data: {
      userId,
      txn: data.txn,
      type: data.type,
      city: data.city,
      quartier: data.quartier?.trim() || '',
      budgetMax: data.budgetMax,
      bedsMin: data.bedsMin,
      message: data.message?.trim() || '',
    },
    select: { id: true },
  });
}

export function serializePropertyRequest(
  r: PropertyRequest,
): Omit<PropertyRequest, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string } {
  // Built explicitly from named fields (not a spread of `r`) so an accidental
  // extra key — e.g. a caller passing a row shaped like
  // PropertyRequest & { user: {...} } from listPropertyRequestsWithContact —
  // is dropped by construction rather than by convention. TS excess-property
  // checking only fires on fresh object literals, not on spreads/variables,
  // so a spread here would silently pass through the requester's contact info.
  const { id, userId, txn, type, city, quartier, budgetMax, bedsMin, message, status } = r;
  return {
    id,
    userId,
    txn,
    type,
    city,
    quartier,
    budgetMax,
    bedsMin,
    message,
    status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
