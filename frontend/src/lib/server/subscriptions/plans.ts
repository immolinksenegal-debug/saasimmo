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
export type SubscriptionPlan = 'STANDARD' | 'PREMIUM' | 'ANNUEL';

export interface PlanConfig {
  label: string;
  /** FCFA, smallest unit (XOF has no subunit — 1 = 1 FCFA). */
  amount: number;
  listingQuota: number;
  /** Subscription period this purchase grants, in ms (renewsAt = now + periodMs). */
  periodMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sentinel `listingQuota` meaning "no practical cap" (the ANNUEL pack).
 * Kept as a large finite number rather than Infinity so it still works with
 * the plain `activeCount >= quota` comparison in the properties-quota gate.
 * The dashboard UI checks for this exact value to show "Illimité" instead
 * of "X / 999999".
 */
export const UNLIMITED_LISTING_QUOTA = 999_999;

export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PlanConfig> = {
  STANDARD: { label: 'Standard', amount: 9_900, listingQuota: 10, periodMs: 30 * DAY_MS },
  PREMIUM: { label: 'Premium', amount: 24_900, listingQuota: 50, periodMs: 30 * DAY_MS },
  ANNUEL: {
    label: 'Annuel',
    amount: 250_000,
    listingQuota: UNLIMITED_LISTING_QUOTA,
    periodMs: 365 * DAY_MS,
  },
};

/** Effective quota for a seller with no active (or an expired) Subscription. */
export const FREE_LISTING_QUOTA = 1;

export function isSubscriptionPlan(value: string): value is SubscriptionPlan {
  return value === 'STANDARD' || value === 'PREMIUM' || value === 'ANNUEL';
}
