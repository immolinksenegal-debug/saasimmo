/**
 * Chariow provider — carte bancaire checkout, complementary to Bictorys
 * (Mobile Money). See `Chariow (1).md` at the repo root (§3, §3bis) for
 * the full wire-format reference this adapter implements.
 *
 * Unlike Bictorys, Chariow does NOT take an arbitrary amount — it charges
 * the price of a pre-configured product in the merchant's Chariow
 * dashboard. `charge()` therefore requires `input.metadata.plan` (one of
 * SubscriptionPlan) to pick the right `product_id` from env. Keeping the
 * Chariow product prices in sync with `SUBSCRIPTION_PLANS` is a manual
 * operational responsibility (documented in README.md / .env.example) —
 * there is no runtime cross-check in v1, matching Bictorys' own lack of
 * one today.
 *
 * No `payout`/`refund` — this integration only covers pack charges;
 * seller withdrawals stay 100% Bictorys.
 */
import { createLogger } from '../logger';
import type { WebhookProvider, ParsedIds } from '../webhook/handler';
import type { PaymentProvider, ChargeInput, ChargeResult } from './provider';

const logger = createLogger();

export interface ChariowEnv {
  CHARIOW_API_URL: string;
  CHARIOW_API_KEY: string;
  CHARIOW_WEBHOOK_SECRET: string;
  CHARIOW_PRODUCT_ID_STANDARD: string;
  CHARIOW_PRODUCT_ID_PREMIUM: string;
  CHARIOW_PRODUCT_ID_ANNUEL: string;
}

export interface ChariowWebhookPayload {
  event?: string;
  event_type?: string;
  data?: {
    id?: string;
    sale_id?: string;
    status?: string;
    custom_metadata?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

const HTTP_TIMEOUT_MS = 30_000;

/**
 * ImmoLink is Senegal-only — every phone reaching this adapter is already
 * E.164 `+221XXXXXXXXX` (enforced app-wide by lib/phone.ts + zPhone). No
 * libphonenumber dependency needed for a single-country app.
 */
export function splitSenegalPhoneForChariow(e164: string): {
  number: string;
  country_code: string;
} {
  const trimmed = e164.trim();
  if (trimmed.startsWith('+221')) {
    return { number: trimmed.slice(4), country_code: 'SN' };
  }
  // Defensive fallback — should not happen given app-wide invariants, but
  // a payment adapter never trusts an upstream invariant blindly.
  return { number: trimmed.replace(/^\+/, ''), country_code: 'SN' };
}

/**
 * §3.3 of the source doc: order matters. "unpaid" contains "paid" as a
 * substring — testing success patterns first would wrongly classify an
 * unpaid sale as PAID. Test unpaid → failures/cancellations → success,
 * in that order.
 */
function mapChariowStatus(raw: string | undefined): 'PENDING' | 'PAID' | 'FAILED' {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('unpaid')) return 'PENDING';
  if (s.includes('failed') || s.includes('error')) return 'FAILED';
  if (s.includes('cancel') || s.includes('abandon') || s.includes('refund')) return 'FAILED';
  if (s.includes('settle') || s.includes('complete') || s.includes('paid') || s.includes('success'))
    return 'PAID';
  return 'PENDING';
}

export interface ChariowProviderHandle extends PaymentProvider {
  webhookProvider: WebhookProvider<ChariowWebhookPayload>;
}

export function createChariowProvider(env: ChariowEnv): ChariowProviderHandle {
  const required: Array<keyof ChariowEnv> = [
    'CHARIOW_API_URL',
    'CHARIOW_API_KEY',
    'CHARIOW_WEBHOOK_SECRET',
    'CHARIOW_PRODUCT_ID_STANDARD',
    'CHARIOW_PRODUCT_ID_PREMIUM',
    'CHARIOW_PRODUCT_ID_ANNUEL',
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`createChariowProvider: ${key} is required`);
  }

  const baseUrl = env.CHARIOW_API_URL.replace(/\/+$/, '');
  const productIdForPlan: Record<string, string> = {
    STANDARD: env.CHARIOW_PRODUCT_ID_STANDARD,
    PREMIUM: env.CHARIOW_PRODUCT_ID_PREMIUM,
    ANNUEL: env.CHARIOW_PRODUCT_ID_ANNUEL,
  };

  async function charge(input: ChargeInput): Promise<ChargeResult> {
    const plan = typeof input.metadata?.plan === 'string' ? input.metadata.plan : '';
    const productId = productIdForPlan[plan];
    if (!productId) {
      throw new Error(`Chariow charge: no product configured for plan "${plan}"`);
    }
    if (!input.customer.phone) {
      throw new Error('Chariow charge: customer.phone is required');
    }
    const phone = splitSenegalPhoneForChariow(input.customer.phone);

    const body = {
      product_id: productId,
      email: input.customer.email ?? '',
      first_name: 'Client',
      last_name: 'ImmoLink',
      phone,
      redirect_url: input.successUrl,
      custom_metadata: { orderId: input.externalRef },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CHARIOW_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[chariow] charge network error: ${msg}`);
      throw new Error(`Chariow network error: ${msg}`);
    }
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Chariow charge failed: HTTP ${res.status} — ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      data?: { purchase?: { id?: string }; payment?: { checkout_url?: string } };
    };
    const providerChargeId = data.data?.purchase?.id ?? '';
    const paymentUrl = data.data?.payment?.checkout_url ?? '';
    if (!providerChargeId || !paymentUrl) {
      throw new Error('Chariow returned an incomplete checkout response');
    }

    return { providerChargeId, paymentUrl, status: 'PENDING' };
  }

  const webhookProvider: WebhookProvider<ChariowWebhookPayload> = {
    name: 'chariow',

    verifySignature() {
      // Chariow's "Pulse" webhook authenticates via a `?secret=` query
      // parameter, not a body/header signature. WebhookProvider only
      // exposes (rawBody, headers) — no URL — so the real check happens
      // in app/api/webhooks/chariow/route.ts BEFORE this handler runs.
      // Always valid here; the route already rejected anything else.
      return { valid: true };
    },

    parsePayload(rawBody) {
      return JSON.parse(rawBody.toString('utf8')) as ChariowWebhookPayload;
    },

    extractIds(payload): ParsedIds {
      const externalId = String(
        payload.data?.sale_id ?? payload.data?.id ?? payload.sale_id ?? payload.id ?? '',
      );
      const eventType = String(
        payload.event ?? payload.event_type ?? payload.data?.status ?? 'unknown',
      );
      // Fall back to the event name(s) when `status` is absent from the
      // payload entirely — a real webhook may carry `event: "settled.sale"`
      // with no `data.status` field. mapChariowStatus's substring matching
      // (settle/complete/success/…) still works against an event name, so
      // this avoids silently classifying a real success/failure as 'other'
      // (which the shared factory dispatches to neither onPaid nor onFailed).
      const klass = mapChariowStatus(
        payload.data?.status ??
          (payload.status as string | undefined) ??
          payload.event ??
          payload.event_type,
      );
      const kind: ParsedIds['kind'] =
        klass === 'PAID' ? 'paid' : klass === 'FAILED' ? 'failed' : 'other';
      return { externalId, eventType, kind };
    },
  };

  return { name: 'chariow', charge, webhookProvider };
}
