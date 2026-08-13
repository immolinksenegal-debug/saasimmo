// Subscription read helpers — shared by the listing-quota gate
// (api/properties POST) and the dashboard's Pack Premium panel.
//
// Expiry is checked lazily at read time (`renewsAt < now`) rather than via
// a cron flipping `status`, so an expired pack silently reverts callers to
// the free tier without needing a background job to stay correct.
import 'server-only';
import type { Prisma, PrismaClient, Subscription } from '@prisma/client';
import { FREE_LISTING_QUOTA } from './plans';

export function isSubscriptionActive(sub: Subscription | null, now: Date = new Date()): boolean {
  return sub !== null && sub.status === 'ACTIVE' && sub.renewsAt > now;
}

export async function getEffectiveListingQuota(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (sub && isSubscriptionActive(sub)) return sub.listingQuota;
  return FREE_LISTING_QUOTA;
}
