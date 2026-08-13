// Canonical seller-pack catalog — the SINGLE source of truth for plan
// pricing/quota. Server-side only and deliberately not derived from the
// client-facing `PACKS` marketing copy in lib/mock/immolink.ts: the
// checkout route prices a purchase from this catalog, never from a
// client-supplied amount, so a tampered request can't buy Premium at
// Standard's price (or free).
//
// 'GRATUIT' has no row here — it's not purchased (no Order/charge), it's
// just the implicit default when a seller has no active Subscription (see
// FREE_LISTING_QUOTA below).
export type SubscriptionPlan = 'STANDARD' | 'PREMIUM';

export interface PlanConfig {
  label: string;
  /** FCFA, smallest unit (XOF has no subunit — 1 = 1 FCFA). */
  amount: number;
  listingQuota: number;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanConfig> = {
  STANDARD: { label: 'Standard', amount: 9_900, listingQuota: 10 },
  PREMIUM: { label: 'Premium', amount: 24_900, listingQuota: 50 },
};

/** Effective quota for a seller with no active (or an expired) Subscription. */
export const FREE_LISTING_QUOTA = 1;

/** Subscription period length — renewed on each successful pack payment. */
export const SUBSCRIPTION_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return value === 'STANDARD' || value === 'PREMIUM';
}
