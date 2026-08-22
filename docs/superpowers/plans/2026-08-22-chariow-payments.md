# Intégration Chariow (paiement carte bancaire) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Chariow as a second `PaymentProvider` (carte bancaire) alongside the existing Bictorys provider (Mobile Money), selectable by the user at pack checkout, with zero behavior change for anyone who doesn't touch the new toggle.

**Architecture:** A new `chariow.ts` adapter implements the existing `PaymentProvider` interface (no interface changes needed — `ChargeCustomer.phone` already exists). A parallel lazy-init singleton + its own `CircuitBreaker` mirror `provider-singleton.ts`. A webhook wrapper + route mirror `webhook/bictorys.ts` + `api/webhooks/bictorys/route.ts` exactly, except Chariow's "Pulse" webhook authenticates via a `?secret=` query parameter instead of a body/header signature, so that check happens in the route file before delegating to the protected `createWebhookHandler` factory. The checkout route grows a `provider` field in its request body; the UI grows a two-option toggle.

**Tech Stack:** Next.js 16 App Router, Prisma 5, Zod, Vitest + vitest-mock-extended (`prismaMock`), Tailwind v4.

## Global Constraints

- Chariow's exact HTTP contract (request/response shapes, status regex, phone/country requirements) is documented in `Chariow (1).md` at the repo root, §3 and §3bis — that document is the source of truth for wire formats; this plan does not re-derive them, it implements them for this project's simpler (single-tenant, webhook-only) architecture.
- **No Prisma migration.** `Order.provider` and `Order.paymentMethod` are already plain `String` columns — `'chariow'` is just a new value, not a schema change.
- **No `libphonenumber` dependency.** ImmoLink is Senegal-only; every phone number reaching a payment adapter is already E.164 `+221XXXXXXXXX` (enforced app-wide by `frontend/src/lib/phone.ts` + the server `zPhone` validator). Do not add a phone-parsing library.
- **No cron/reconciliation/anti-fraude system for Chariow.** Bictorys is webhook-only in this codebase (no `reconcile.ts`, no polling). Chariow follows the same pattern — do not port the source doc's `reconcile.ts`/cron/anti-fraude-tolerance machinery.
- **Chariow has no `payout`/`refund` in this integration.** Seller withdrawals stay 100% Bictorys. Omit both methods from the returned provider object (`PaymentProvider.payout`/`.refund` are optional).
- Amounts stay integer smallest-currency-unit (XOF = no decimals) everywhere a value is stored — Chariow's charge response is not used to override `Order.amount` (that's set by the caller from `SUBSCRIPTION_PLANS`, same as Bictorys today).
- Every new/modified Route Handler keeps `export const runtime = 'nodejs'` (webhook route also needs `export const dynamic = 'force-dynamic'`, matching `api/webhooks/bictorys/route.ts`).
- `frontend/src/lib/server/webhook/handler.ts` is PROTECTED — never modified. `frontend/src/lib/server/payments/circuit-breaker.ts` (the class) is PROTECTED — never modified; instantiating a second `CircuitBreaker` object is fine and expected.
- Webhook side-effects go through `enqueueOutbox(tx, ...)` inside the same Serializable transaction the factory opens — never a fire-and-forget closure. Notifications go through `createNotification` — not applicable here (this route only touches `Order`/`Subscription`, same as the Bictorys route).
- CSRF: the checkout route already calls `verifyCsrf(req)` — unchanged. The webhook route is a public provider callback, no CSRF (matches Bictorys).

---

### Task 1: Chariow payment adapter (`charge`, status mapping, phone split, webhook provider)

**Files:**
- Create: `frontend/src/lib/server/payments/chariow.ts`
- Test: `frontend/src/lib/server/payments/chariow.test.ts`

**Interfaces:**
- Consumes: `PaymentProvider`, `ChargeInput`, `ChargeResult` from `./provider` (unchanged — no interface edits); `WebhookProvider`, `ParsedIds` from `../webhook/handler` (unchanged, PROTECTED).
- Produces (used by Tasks 2, 3, 5):
  - `export interface ChariowEnv { CHARIOW_API_URL: string; CHARIOW_API_KEY: string; CHARIOW_WEBHOOK_SECRET: string; CHARIOW_PRODUCT_ID_STANDARD: string; CHARIOW_PRODUCT_ID_PREMIUM: string; CHARIOW_PRODUCT_ID_ANNUEL: string; }`
  - `export interface ChariowWebhookPayload { event?: string; event_type?: string; data?: { id?: string; sale_id?: string; status?: string; custom_metadata?: Record<string, unknown>; }; [key: string]: unknown; }`
  - `export interface ChariowProviderHandle extends PaymentProvider { webhookProvider: WebhookProvider<ChariowWebhookPayload>; }`
  - `export function createChariowProvider(env: ChariowEnv): ChariowProviderHandle`
  - `export function splitSenegalPhoneForChariow(e164: string): { number: string; country_code: string }` (exported so Task 1's tests — and no one else — exercise it directly; not consumed elsewhere)

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/lib/server/payments/chariow.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createChariowProvider, splitSenegalPhoneForChariow } from './chariow';

const ENV = {
  CHARIOW_API_URL: 'https://api.chariow.test/v1',
  CHARIOW_API_KEY: 'test-chariow-key',
  CHARIOW_WEBHOOK_SECRET: 'test-chariow-webhook-secret',
  CHARIOW_PRODUCT_ID_STANDARD: 'prod_standard_1',
  CHARIOW_PRODUCT_ID_PREMIUM: 'prod_premium_1',
  CHARIOW_PRODUCT_ID_ANNUEL: 'prod_annuel_1',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('splitSenegalPhoneForChariow', () => {
  it('splits a Senegalese E.164 number into local + ISO2', () => {
    expect(splitSenegalPhoneForChariow('+221771234567')).toEqual({
      number: '771234567',
      country_code: 'SN',
    });
  });

  it('falls back gracefully for a non-+221 input (defensive — should not happen given app-wide E.164 SN enforcement)', () => {
    expect(splitSenegalPhoneForChariow('+33612345678')).toEqual({
      number: '33612345678',
      country_code: 'SN',
    });
  });
});

describe('createChariowProvider', () => {
  it('throws when required env is missing', () => {
    expect(() =>
      createChariowProvider({ ...ENV, CHARIOW_API_KEY: '' }),
    ).toThrow(/CHARIOW_API_KEY/);
  });

  it('charge() picks the product_id for the plan in metadata and returns providerChargeId + paymentUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          purchase: { id: 'sale_123', amount: { value: 9900, currency: 'XOF' } },
          payment: { checkout_url: 'https://checkout.chariow.test/sale_123' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createChariowProvider(ENV);
    const result = await provider.charge({
      amount: 9900,
      currency: 'XOF',
      customer: { email: 'a@b.com', phone: '+221771234567' },
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      externalRef: 'order_1',
      metadata: { plan: 'STANDARD' },
    });

    expect(result).toEqual({
      providerChargeId: 'sale_123',
      paymentUrl: 'https://checkout.chariow.test/sale_123',
      status: 'PENDING',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.chariow.test/v1/checkout');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.product_id).toBe('prod_standard_1');
    expect(body.phone).toEqual({ number: '771234567', country_code: 'SN' });
  });

  it('charge() throws when metadata.plan has no configured product', async () => {
    const provider = createChariowProvider(ENV);
    await expect(
      provider.charge({
        amount: 9900,
        currency: 'XOF',
        customer: { email: 'a@b.com', phone: '+221771234567' },
        successUrl: 'https://app.test/success',
        failureUrl: 'https://app.test/failure',
        externalRef: 'order_1',
        metadata: { plan: 'UNKNOWN' },
      }),
    ).rejects.toThrow(/no product configured/i);
  });

  it('charge() throws when customer.phone is missing', async () => {
    const provider = createChariowProvider(ENV);
    await expect(
      provider.charge({
        amount: 9900,
        currency: 'XOF',
        customer: { email: 'a@b.com' },
        successUrl: 'https://app.test/success',
        failureUrl: 'https://app.test/failure',
        externalRef: 'order_1',
        metadata: { plan: 'STANDARD' },
      }),
    ).rejects.toThrow(/phone is required/i);
  });

  it('webhookProvider.extractIds classifies "settled" as paid (kind=paid)', () => {
    const provider = createChariowProvider(ENV);
    const ids = provider.webhookProvider.extractIds({
      event: 'settled.sale',
      data: { sale_id: 'sale_123', status: 'settled' },
    });
    expect(ids).toEqual({ externalId: 'sale_123', eventType: 'settled.sale', kind: 'paid' });
  });

  it('webhookProvider.extractIds tests "unpaid" before "paid" (unpaid must NOT classify as paid)', () => {
    const provider = createChariowProvider(ENV);
    const ids = provider.webhookProvider.extractIds({
      event: 'pending.sale',
      data: { sale_id: 'sale_456', status: 'unpaid' },
    });
    expect(ids.kind).toBe('other');
  });

  it('webhookProvider.extractIds classifies "cancel"/"abandon"/"refund" as failed', () => {
    const provider = createChariowProvider(ENV);
    for (const status of ['cancelled', 'abandoned', 'refunded']) {
      const ids = provider.webhookProvider.extractIds({
        data: { sale_id: 's', status },
      });
      expect(ids.kind).toBe('failed');
    }
  });

  it('webhookProvider.verifySignature always returns valid (real check happens in the route)', () => {
    const provider = createChariowProvider(ENV);
    expect(provider.webhookProvider.verifySignature(Buffer.from('{}'), {})).toEqual({
      valid: true,
    });
  });

  it('webhookProvider.parsePayload parses JSON', () => {
    const provider = createChariowProvider(ENV);
    const payload = provider.webhookProvider.parsePayload(
      Buffer.from(JSON.stringify({ event: 'settled.sale' })),
    );
    expect(payload).toEqual({ event: 'settled.sale' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments/chariow.test.ts`
Expected: FAIL — `Cannot find module './chariow'`

- [ ] **Step 3: Implement `chariow.ts`**

```typescript
// frontend/src/lib/server/payments/chariow.ts
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
      const klass = mapChariowStatus(payload.data?.status ?? (payload.status as string | undefined));
      const kind: ParsedIds['kind'] =
        klass === 'PAID' ? 'paid' : klass === 'FAILED' ? 'failed' : 'other';
      return { externalId, eventType, kind };
    },
  };

  return { name: 'chariow', charge, webhookProvider };
}
```

Note: `logger` is imported but unused if you don't add logging — add a `logger.warn` in the network-error catch (mirroring `bictorys.ts`'s style) so the import isn't dead code:

```typescript
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[chariow] charge network error: ${msg}`);
      throw new Error(`Chariow network error: ${msg}`);
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments/chariow.test.ts`
Expected: PASS (all cases above)

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend run lint`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/payments/chariow.ts frontend/src/lib/server/payments/chariow.test.ts
git commit -m "feat(payments): add Chariow provider adapter (charge + status mapping + webhook)"
```

---

### Task 2: Chariow provider singleton

**Files:**
- Create: `frontend/src/lib/server/payments/chariow-singleton.ts`
- Test: `frontend/src/lib/server/payments/chariow-singleton.test.ts`

**Interfaces:**
- Consumes: `createChariowProvider`, `ChariowProviderHandle` from `./chariow` (Task 1).
- Produces (used by Task 5):
  - `export class ChariowProviderUnconfiguredError extends Error`
  - `export function getChariowProvider(): ChariowProviderHandle`
  - `export const chariowBreaker: CircuitBreaker`
  - `export function __resetChariowProviderSingleton(): void` (test-only)

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/server/payments/chariow-singleton.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getChariowProvider,
  ChariowProviderUnconfiguredError,
  __resetChariowProviderSingleton,
} from './chariow-singleton';

beforeEach(() => {
  __resetChariowProviderSingleton();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetChariowProviderSingleton();
});

describe('getChariowProvider', () => {
  it('throws ChariowProviderUnconfiguredError when env is missing', () => {
    expect(() => getChariowProvider()).toThrow(ChariowProviderUnconfiguredError);
  });

  it('returns a cached provider once env is present', () => {
    vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test/v1');
    vi.stubEnv('CHARIOW_API_KEY', 'k');
    vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 's');
    vi.stubEnv('CHARIOW_PRODUCT_ID_STANDARD', 'p1');
    vi.stubEnv('CHARIOW_PRODUCT_ID_PREMIUM', 'p2');
    vi.stubEnv('CHARIOW_PRODUCT_ID_ANNUEL', 'p3');

    const first = getChariowProvider();
    const second = getChariowProvider();
    expect(first).toBe(second); // same cached instance
    expect(first.name).toBe('chariow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments/chariow-singleton.test.ts`
Expected: FAIL — `Cannot find module './chariow-singleton'`

- [ ] **Step 3: Implement**

```typescript
// frontend/src/lib/server/payments/chariow-singleton.ts
// Lazy-init Chariow provider + its OWN module-level CircuitBreaker — kept
// separate from Bictorys' breaker (provider-singleton.ts) so a Chariow
// outage never trips Bictorys' circuit and vice versa. Mirrors
// provider-singleton.ts exactly; see that file's comments for the "why
// lazy" / "why a shared breaker" rationale.
import { createChariowProvider, type ChariowProviderHandle } from '@/lib/server/payments/chariow';
import { CircuitBreaker } from '@/lib/server/payments/circuit-breaker';

export class ChariowProviderUnconfiguredError extends Error {
  constructor() {
    super(
      'Chariow provider not configured (CHARIOW_API_URL/_API_KEY/_WEBHOOK_SECRET/_PRODUCT_ID_* missing or empty)',
    );
    this.name = 'ChariowProviderUnconfiguredError';
  }
}

let _provider: ChariowProviderHandle | null = null;

export function getChariowProvider(): ChariowProviderHandle {
  if (_provider) return _provider;

  const url = process.env.CHARIOW_API_URL ?? '';
  const key = process.env.CHARIOW_API_KEY ?? '';
  const webhookSecret = process.env.CHARIOW_WEBHOOK_SECRET ?? '';
  const standard = process.env.CHARIOW_PRODUCT_ID_STANDARD ?? '';
  const premium = process.env.CHARIOW_PRODUCT_ID_PREMIUM ?? '';
  const annuel = process.env.CHARIOW_PRODUCT_ID_ANNUEL ?? '';

  if (!url || !key || !webhookSecret || !standard || !premium || !annuel) {
    throw new ChariowProviderUnconfiguredError();
  }

  _provider = createChariowProvider({
    CHARIOW_API_URL: url,
    CHARIOW_API_KEY: key,
    CHARIOW_WEBHOOK_SECRET: webhookSecret,
    CHARIOW_PRODUCT_ID_STANDARD: standard,
    CHARIOW_PRODUCT_ID_PREMIUM: premium,
    CHARIOW_PRODUCT_ID_ANNUEL: annuel,
  });
  return _provider;
}

/** Separate breaker instance — same thresholds as Bictorys' for consistency. */
export const chariowBreaker = new CircuitBreaker({
  name: 'chariow.charge',
  failureThreshold: 5,
  windowMs: 30_000,
  cooldownMs: 60_000,
});

/** Test-only escape hatch — see provider-singleton.ts's identical helper. @internal */
export function __resetChariowProviderSingleton(): void {
  _provider = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/payments/chariow-singleton.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend run lint`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/server/payments/chariow-singleton.ts frontend/src/lib/server/payments/chariow-singleton.test.ts
git commit -m "feat(payments): add Chariow provider singleton with its own circuit breaker"
```

---

### Task 3: Chariow webhook provider wrapper + test fixture builder

**Files:**
- Create: `frontend/src/lib/server/webhook/chariow.ts`
- Create: `frontend/src/test-utils/chariow-mock.ts`
- Test: `frontend/src/lib/server/webhook/chariow.test.ts`

**Interfaces:**
- Consumes: `createChariowProvider`, `ChariowWebhookPayload` from `../payments/chariow` (Task 1); `WebhookProvider` from `./handler`.
- Produces (used by Tasks 4):
  - `export function getChariowWebhookProvider(): WebhookProvider<ChariowWebhookPayload>`
  - `export const chariowWebhookProvider: WebhookProvider<ChariowWebhookPayload>`
  - `export function __resetChariowWebhookProvider(): void` (test-only)
  - `frontend/src/test-utils/chariow-mock.ts`: `export function chariowFixture(opts?: ChariowFixtureOpts): { rawBody: Buffer; payload: ChariowWebhookPayload }` and `export function chariowFixtureRequest(opts?: ChariowFixtureOpts & { secret?: string }): { req: NextRequest }` — builds a `NextRequest` whose URL includes `?secret=...` (Task 4's route reads it from `req.nextUrl.searchParams`, not headers).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/lib/server/webhook/chariow.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  chariowWebhookProvider,
  getChariowWebhookProvider,
  __resetChariowWebhookProvider,
} from './chariow';

beforeEach(() => {
  vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test/v1');
  vi.stubEnv('CHARIOW_API_KEY', 'test-key');
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'test-webhook-secret');
  vi.stubEnv('CHARIOW_PRODUCT_ID_STANDARD', 'p1');
  vi.stubEnv('CHARIOW_PRODUCT_ID_PREMIUM', 'p2');
  vi.stubEnv('CHARIOW_PRODUCT_ID_ANNUEL', 'p3');
  __resetChariowWebhookProvider();
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetChariowWebhookProvider();
});

describe('chariowWebhookProvider', () => {
  it('throws when env unset (lazy init)', () => {
    vi.stubEnv('CHARIOW_API_KEY', '');
    __resetChariowWebhookProvider();
    expect(() => getChariowWebhookProvider()).toThrow(/not configured/i);
  });

  it('parsePayload + extractIds round-trip a settled sale', () => {
    const raw = Buffer.from(
      JSON.stringify({ event: 'settled.sale', data: { sale_id: 'sale_1', status: 'settled' } }),
    );
    const payload = chariowWebhookProvider.parsePayload(raw);
    const ids = chariowWebhookProvider.extractIds(payload);
    expect(ids).toEqual({ externalId: 'sale_1', eventType: 'settled.sale', kind: 'paid' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/lib/server/webhook/chariow.test.ts`
Expected: FAIL — `Cannot find module './chariow'`

- [ ] **Step 3: Implement `webhook/chariow.ts`**

```typescript
// frontend/src/lib/server/webhook/chariow.ts
// Mirrors webhook/bictorys.ts exactly: re-exports the WebhookProvider impl
// from the payments adapter with lazy-init env reads (so vi.stubEnv works
// in tests). No kind-upgrade needed here — createChariowProvider's
// extractIds already classifies cancel/abandon/refund as 'failed' and
// settle/complete/paid/success as 'paid' directly (see chariow.ts).
import type { WebhookProvider } from './handler';
import { createChariowProvider, type ChariowWebhookPayload } from '../payments/chariow';

export type { ChariowWebhookPayload };

let _provider: WebhookProvider<ChariowWebhookPayload> | null = null;

/** Lazy-init — env reads happen at first call so `vi.stubEnv` works in tests. */
export function getChariowWebhookProvider(): WebhookProvider<ChariowWebhookPayload> {
  if (_provider) return _provider;
  const env = {
    CHARIOW_API_URL: process.env.CHARIOW_API_URL ?? '',
    CHARIOW_API_KEY: process.env.CHARIOW_API_KEY ?? '',
    CHARIOW_WEBHOOK_SECRET: process.env.CHARIOW_WEBHOOK_SECRET ?? '',
    CHARIOW_PRODUCT_ID_STANDARD: process.env.CHARIOW_PRODUCT_ID_STANDARD ?? '',
    CHARIOW_PRODUCT_ID_PREMIUM: process.env.CHARIOW_PRODUCT_ID_PREMIUM ?? '',
    CHARIOW_PRODUCT_ID_ANNUEL: process.env.CHARIOW_PRODUCT_ID_ANNUEL ?? '',
  };
  if (
    !env.CHARIOW_API_URL ||
    !env.CHARIOW_API_KEY ||
    !env.CHARIOW_WEBHOOK_SECRET ||
    !env.CHARIOW_PRODUCT_ID_STANDARD ||
    !env.CHARIOW_PRODUCT_ID_PREMIUM ||
    !env.CHARIOW_PRODUCT_ID_ANNUEL
  ) {
    throw new Error('Chariow webhook provider not configured (env missing)');
  }
  _provider = createChariowProvider(env).webhookProvider;
  return _provider;
}

/** Convenience binding for the route file. */
export const chariowWebhookProvider: WebhookProvider<ChariowWebhookPayload> = {
  name: 'chariow',
  verifySignature: (raw, headers) => getChariowWebhookProvider().verifySignature(raw, headers),
  parsePayload: (raw) => getChariowWebhookProvider().parsePayload(raw),
  extractIds: (payload) => getChariowWebhookProvider().extractIds(payload),
};

/** Test-only — clear the cached provider for `vi.stubEnv` reuse. */
export function __resetChariowWebhookProvider(): void {
  _provider = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/lib/server/webhook/chariow.test.ts`
Expected: PASS

- [ ] **Step 5: Implement the test fixture builder (needed by Task 4, written now while the payload shape is fresh)**

```typescript
// frontend/src/test-utils/chariow-mock.ts
// Fixture builder for /api/webhooks/chariow route tests. Unlike Bictorys
// (HMAC in headers), Chariow's "Pulse" webhook authenticates via a
// `?secret=` query parameter — so the fixture request's URL carries the
// secret, not its headers. See app/api/webhooks/chariow/route.ts.
import { NextRequest } from 'next/server';
import type { ChariowWebhookPayload } from '@/lib/server/payments/chariow';

export interface ChariowFixtureOpts {
  status?: 'settled' | 'failed' | 'cancelled';
  saleId?: string;
  event?: string;
  secret?: string;
}

export function chariowFixture(opts: ChariowFixtureOpts = {}): {
  rawBody: Buffer;
  payload: ChariowWebhookPayload;
} {
  const status = opts.status ?? 'settled';
  const payload: ChariowWebhookPayload = {
    event: opts.event ?? `${status}.sale`,
    data: { sale_id: opts.saleId ?? 'sale_test_001', status },
  };
  return { rawBody: Buffer.from(JSON.stringify(payload)), payload };
}

/** Build a NextRequest with the fixture body + `?secret=` query param. */
export function chariowFixtureRequest(opts: ChariowFixtureOpts = {}): {
  req: NextRequest;
  payload: ChariowWebhookPayload;
} {
  const { rawBody, payload } = chariowFixture(opts);
  const secret = opts.secret ?? 'test-chariow-webhook-secret';
  const body = rawBody as unknown as BodyInit;
  return {
    req: new NextRequest(`http://localhost/api/webhooks/chariow?secret=${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
    payload,
  };
}
```

No dedicated test needed for the fixture builder itself — Task 4's route tests exercise it directly.

- [ ] **Step 6: Typecheck + lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend run lint`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/server/webhook/chariow.ts frontend/src/lib/server/webhook/chariow.test.ts frontend/src/test-utils/chariow-mock.ts
git commit -m "feat(payments): add Chariow webhook provider wrapper + test fixtures"
```

---

### Task 4: Chariow webhook route (`POST /api/webhooks/chariow`)

**Files:**
- Create: `frontend/src/app/api/webhooks/chariow/route.ts`
- Test: `frontend/src/app/api/webhooks/chariow/route.test.ts`

**Interfaces:**
- Consumes: `createWebhookHandler` from `@/lib/server/webhook/handler` (PROTECTED, unchanged); `chariowWebhookProvider` from `@/lib/server/webhook/chariow` (Task 3); `enqueueOutbox` from `@/lib/server/outbox`; `chariowFixtureRequest` from `@/test-utils/chariow-mock` (Task 3).
- Produces: `POST` route handler at `/api/webhooks/chariow`. Nothing downstream consumes this directly (it's a webhook endpoint), but its `onPaid` logic must stay behaviorally identical to `api/webhooks/bictorys/route.ts`'s `onPaid` (same `Subscription.upsert` + outbox events) since both write to the same `Order`/`Subscription` tables.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/webhooks/chariow/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chariowFixtureRequest } from '@/test-utils/chariow-mock';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const orderFindFirst = vi.fn();
const orderUpdate = vi.fn();
const subscriptionUpsert = vi.fn();
const outboxCreate = vi.fn();

const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>, _opts?: unknown) =>
  fn({
    webhookLog: { findUnique, create, update },
    order: { findFirst: orderFindFirst, update: orderUpdate },
    subscription: { upsert: subscriptionUpsert },
    outboxEvent: { create: outboxCreate },
  }),
);

vi.mock('@/lib/server/prisma', () => ({ prisma: { $transaction } }));

beforeEach(() => {
  vi.stubEnv('CHARIOW_API_URL', 'https://api.chariow.test/v1');
  vi.stubEnv('CHARIOW_API_KEY', 'test-key');
  vi.stubEnv('CHARIOW_WEBHOOK_SECRET', 'test-chariow-webhook-secret');
  vi.stubEnv('CHARIOW_PRODUCT_ID_STANDARD', 'p1');
  vi.stubEnv('CHARIOW_PRODUCT_ID_PREMIUM', 'p2');
  vi.stubEnv('CHARIOW_PRODUCT_ID_ANNUEL', 'p3');
  findUnique.mockReset();
  create.mockReset();
  update.mockReset();
  orderFindFirst.mockReset();
  orderUpdate.mockReset();
  subscriptionUpsert.mockReset();
  outboxCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/webhooks/chariow', () => {
  it('missing/wrong ?secret= returns 401 WITHOUT touching the transaction', async () => {
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled', secret: 'wrong-secret' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('valid secret + first delivery returns 200 deduped:false', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce(null); // unknown sale — onPaid drops
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(create).toHaveBeenCalled();
  });

  it('replay of same (externalId, eventType) returns deduped:true', async () => {
    findUnique.mockResolvedValueOnce({ id: 'wl1', processedAt: new Date() });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled' });
    const res = await POST(req);
    expect(await res.json()).toEqual({ ok: true, deduped: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('onPaid activates the Subscription for a pack_subscription Order and enqueues outbox events', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o1',
      userId: 'u1',
      customerEmail: 'a@b.com',
      amount: 9900,
      currency: 'XOF',
      metadata: { kind: 'pack_subscription', plan: 'STANDARD' },
    });
    subscriptionUpsert.mockResolvedValue({ id: 'sub1' });
    outboxCreate.mockResolvedValue({ id: 'ob1' });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled' });
    await POST(req);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(subscriptionUpsert).toHaveBeenCalled();
    const kinds = outboxCreate.mock.calls.map((c) => (c[0] as { data: { kind: string } }).data.kind);
    expect(
      kinds.some((k) => k === 'notification.payment_received' || k === 'email.payment_confirmation'),
    ).toBe(true);
  });

  it('onFailed (cancelled sale) sets Order to FAILED', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({ id: 'o2' });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'cancelled' });
    await POST(req);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'FAILED' } }),
    );
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/webhooks/chariow/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the route**

```typescript
// frontend/src/app/api/webhooks/chariow/route.ts
/**
 * POST /api/webhooks/chariow — Chariow "Pulse" webhook.
 *
 * Same battle-tested factory as api/webhooks/bictorys/route.ts
 * (lib/server/webhook/handler.ts — PROTECTED). The one structural
 * difference: Chariow authenticates via a `?secret=` QUERY PARAMETER,
 * not a body/header signature. WebhookProvider.verifySignature only sees
 * (rawBody, headers) — no URL — so that check happens HERE, before
 * delegating to the factory. It never touches the request body (query
 * string only, read synchronously), so the "raw body read + hashed
 * before any parse" invariant for the factory itself is untouched.
 *
 * onPaid/onFailed mirror api/webhooks/bictorys/route.ts's logic exactly
 * (same Order/Subscription/outbox shape) — no onRefunded in v1 (no pack
 * refund flow exists yet, same limitation as Bictorys today).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import 'server-only';
import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createWebhookHandler } from '@/lib/server/webhook/handler';
import { chariowWebhookProvider } from '@/lib/server/webhook/chariow';
import { enqueueOutbox } from '@/lib/server/outbox';
import { prisma } from '@/lib/server/prisma';
import { SUBSCRIPTION_PLANS, isSubscriptionPlan } from '@/lib/server/subscriptions/plans';

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const innerHandler = createWebhookHandler({
  prisma,
  provider: chariowWebhookProvider,

  async onPaid(payload, tx) {
    const externalRef = String(payload.data?.sale_id ?? payload.data?.id ?? payload.sale_id ?? payload.id ?? '');
    if (!externalRef) return {};

    const order = await tx.order.findFirst({ where: { providerChargeId: externalRef } });
    if (!order) return {};

    await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } });

    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    if (
      order.userId &&
      meta.kind === 'pack_subscription' &&
      typeof meta.plan === 'string' &&
      isSubscriptionPlan(meta.plan)
    ) {
      const catalog = SUBSCRIPTION_PLANS[meta.plan];
      const renewsAt = new Date(Date.now() + catalog.periodMs);
      await tx.subscription.upsert({
        where: { userId: order.userId },
        create: {
          userId: order.userId,
          plan: meta.plan,
          listingQuota: catalog.listingQuota,
          status: 'ACTIVE',
          renewsAt,
        },
        update: { plan: meta.plan, listingQuota: catalog.listingQuota, status: 'ACTIVE', renewsAt },
      });
    }

    if (order.userId) {
      await enqueueOutbox(tx, {
        kind: 'notification.payment_received',
        payload: { userId: order.userId, orderId: order.id, amount: order.amount, currency: order.currency },
      });
    }
    if (order.customerEmail) {
      await enqueueOutbox(tx, {
        kind: 'email.payment_confirmation',
        payload: { to: order.customerEmail, orderId: order.id, amount: order.amount, currency: order.currency },
      });
    }

    return {};
  },

  async onFailed(payload, tx) {
    const externalRef = String(payload.data?.sale_id ?? payload.data?.id ?? payload.sale_id ?? payload.id ?? '');
    if (!externalRef) return {};
    const order = await tx.order.findFirst({ where: { providerChargeId: externalRef } });
    if (!order) return {};
    await tx.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    return {};
  },
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.nextUrl.searchParams.get('secret') ?? '';
  const expected = process.env.CHARIOW_WEBHOOK_SECRET ?? '';
  if (!expected || !secret || !timingSafeStringEqual(secret, expected)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  return innerHandler(req);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/webhooks/chariow/route.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green — this is the first task that touches shared tables (`Order`, `Subscription`), so run the whole suite, not just the new file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/webhooks/chariow/route.ts frontend/src/app/api/webhooks/chariow/route.test.ts
git commit -m "feat(payments): add Chariow webhook route (secret-in-URL auth + onPaid/onFailed)"
```

---

### Task 5: Checkout route — accept `provider` in the request body

**Files:**
- Modify: `frontend/src/app/api/subscriptions/checkout/route.ts`
- Test: `frontend/src/app/api/subscriptions/checkout/route.test.ts` (new — this route currently has no test file)

**Interfaces:**
- Consumes: `getChariowProvider`, `chariowBreaker`, `ChariowProviderUnconfiguredError` from `@/lib/server/payments/chariow-singleton` (Task 2); existing `getProvider`, `breaker`, `PaymentProviderUnconfiguredError` from `@/lib/server/payments/provider-singleton` (unchanged).
- Produces: `POST /api/subscriptions/checkout` now accepts `{ plan: string; provider?: 'bictorys' | 'chariow' }` (default `'bictorys'` — no behavior change for existing callers that omit the field). New error code `PHONE_REQUIRED` (400) when `provider === 'chariow'` and the user has no phone on file.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/app/api/subscriptions/checkout/route.test.ts
// Mirrors app/api/orders/route.test.ts's bootstrap pattern (prisma-mock
// first, mockNextCookies, mock middleware + both provider singletons).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/middleware', () => ({ requireAuth: vi.fn() }));

vi.mock('@/lib/server/payments/provider-singleton', () => ({
  getProvider: vi.fn(),
  breaker: { execute: vi.fn() },
  PaymentProviderUnconfiguredError: class PaymentProviderUnconfiguredError extends Error {
    constructor() {
      super('not configured');
      this.name = 'PaymentProviderUnconfiguredError';
    }
  },
}));

vi.mock('@/lib/server/payments/chariow-singleton', () => ({
  getChariowProvider: vi.fn(),
  chariowBreaker: { execute: vi.fn() },
  ChariowProviderUnconfiguredError: class ChariowProviderUnconfiguredError extends Error {
    constructor() {
      super('not configured');
      this.name = 'ChariowProviderUnconfiguredError';
    }
  },
}));

import { requireAuth } from '@/lib/server/middleware';
import { getProvider, breaker } from '@/lib/server/payments/provider-singleton';
import { getChariowProvider, chariowBreaker } from '@/lib/server/payments/chariow-singleton';
import { POST } from './route';

const mockRequireAuth = vi.mocked(requireAuth);
const mockGetProvider = vi.mocked(getProvider);
const mockExecute = vi.mocked(breaker.execute);
const mockGetChariowProvider = vi.mocked(getChariowProvider);
const mockChariowExecute = vi.mocked(chariowBreaker.execute);

const authedCtx = { user: { sub: 'user-1', email: 'me@example.com' } };

// verifyCsrf(req) just compares the `x-csrf-token` header against the
// `app-csrf` cookie — both hand-set here, no signing involved. Mirrors
// app/api/orders/route.test.ts's `makePost` helper exactly.
function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/subscriptions/checkout', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-tok',
      cookie: 'app-csrf=csrf-tok',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PUBLIC_URL = 'http://localhost:3000';
  mockRequireAuth.mockResolvedValue(authedCtx as never);
  prismaMock.order.findUnique.mockResolvedValue(null);
  prismaMock.order.create.mockResolvedValue({ id: 'order-1' } as never);
  prismaMock.order.update.mockResolvedValue({} as never);
});

describe('POST /api/subscriptions/checkout — provider selection', () => {
  it('defaults to bictorys when provider is omitted (no behavior change)', async () => {
    mockGetProvider.mockReturnValue({ name: 'bictorys', charge: vi.fn() } as never);
    mockExecute.mockResolvedValue({ providerChargeId: 'c1', paymentUrl: 'https://pay/1' });
    const res = await POST(makeReq({ plan: 'STANDARD' }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'bictorys' }) }),
    );
    expect(mockGetChariowProvider).not.toHaveBeenCalled();
  });

  it('provider: "chariow" without a phone on file returns 400 PHONE_REQUIRED before any network call', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: null } as never);
    const res = await POST(makeReq({ plan: 'STANDARD', provider: 'chariow' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PHONE_REQUIRED');
    expect(mockGetChariowProvider).not.toHaveBeenCalled();
  });

  it('provider: "chariow" with a phone on file charges through Chariow and stores provider="chariow"', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+221771234567' } as never);
    mockGetChariowProvider.mockReturnValue({ name: 'chariow', charge: vi.fn() } as never);
    mockChariowExecute.mockResolvedValue({ providerChargeId: 'sale_1', paymentUrl: 'https://checkout.chariow/1' });
    const res = await POST(makeReq({ plan: 'STANDARD', provider: 'chariow' }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'chariow' }) }),
    );
  });
});
```

Implementer note (not a placeholder — an explicit instruction): the `makeReq` helper above is intentionally left as a sketch. `app/api/orders/route.test.ts` already has a working `makePost`-style helper that builds a real `NextRequest` with a matching CSRF cookie + header via `mockNextCookies()`. Copy that helper's exact implementation into this file (rename to `makeCheckoutReq`, point the URL at `/api/subscriptions/checkout`) — do not hand-roll CSRF plumbing from scratch.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter frontend exec vitest run src/app/api/subscriptions/checkout/route.test.ts`
Expected: FAIL — `provider` field not yet accepted / `PHONE_REQUIRED` not yet implemented / `chariow-singleton` not yet imported by the route.

- [ ] **Step 3: Modify the route**

Current file is `frontend/src/app/api/subscriptions/checkout/route.ts` (180 lines, read it in full before editing). Apply these changes:

1. Add imports:

```typescript
import {
  getChariowProvider,
  chariowBreaker,
  ChariowProviderUnconfiguredError,
} from '@/lib/server/payments/chariow-singleton';
```

2. Extend the body schema:

```typescript
const Body = z.object({
  plan: z.string().refine(isSubscriptionPlan, { message: 'Unknown plan' }),
  provider: z.enum(['bictorys', 'chariow']).default('bictorys'),
});
```

3. Right after `const plan = parsed.data.plan;` add:

```typescript
    const providerName = parsed.data.provider;
```

4. Right after the idempotency-key existing-order block (before `let provider;`), add the phone guard — only for Chariow, only a cheap DB read, before any network call:

```typescript
    let phoneForCharge: string | undefined;
    if (providerName === 'chariow') {
      const dbUser = await prisma.user.findUnique({
        where: { id: auth.user.sub },
        select: { phone: true },
      });
      if (!dbUser?.phone) {
        return NextResponse.json(
          {
            error: 'PHONE_REQUIRED',
            message: 'Add a phone number in your account settings before paying by card.',
          },
          { status: 400, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      phoneForCharge = dbUser.phone;
    }
```

5. Replace the `let provider;` block's `getProvider()` call with a branch on `providerName`:

```typescript
    let provider;
    let activeBreaker;
    try {
      if (providerName === 'chariow') {
        provider = getChariowProvider();
        activeBreaker = chariowBreaker;
      } else {
        provider = getProvider();
        activeBreaker = breaker;
      }
    } catch (err) {
      if (err instanceof PaymentProviderUnconfiguredError || err instanceof ChariowProviderUnconfiguredError) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }
```

6. Update `Order.create`'s `data.provider` from the hardcoded `'bictorys'` to `providerName`:

```typescript
    const order = await prisma.order.create({
      data: {
        userId: auth.user.sub,
        amount: catalog.amount,
        currency: 'XOF',
        provider: providerName,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + ORDER_EXPIRY_MS),
        idempotencyKey: idemKey,
        customerEmail: auth.user.email,
        metadata: { kind: 'pack_subscription', plan },
      },
    });
```

7. Update the two remaining `breaker.execute(...)` / catch-block usages to use `activeBreaker` instead of the module-level `breaker`, and pass `phone` + `metadata` into the charge call:

```typescript
    try {
      const result = await activeBreaker.execute(() =>
        provider.charge({
          amount: catalog.amount,
          currency: 'XOF',
          customer: { email: auth.user.email, phone: phoneForCharge },
          successUrl: `${publicUrl}/paiement/succes?o=${order.id}`,
          failureUrl: `${publicUrl}/paiement/echec?o=${order.id}`,
          externalRef: order.id,
          metadata: { plan },
        }),
      );
```

   (The `catch` block's `err instanceof CircuitOpenError` check is unchanged — `CircuitOpenError` is provider-agnostic, thrown by either breaker.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter frontend exec vitest run src/app/api/subscriptions/checkout/route.test.ts`
Expected: PASS

- [ ] **Step 5: Full suite + typecheck + lint**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green — confirm the Bictorys default path (existing PacksModal calls, unmodified) still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/subscriptions/checkout/route.ts frontend/src/app/api/subscriptions/checkout/route.test.ts
git commit -m "feat(payments): checkout route accepts provider: bictorys|chariow, guards phone for Chariow"
```

---

### Task 6: PacksModal UI — Mobile Money / Carte bancaire toggle

**Files:**
- Modify: `frontend/src/components/immolink/PacksModal.tsx`

**Interfaces:**
- Consumes: `POST /api/subscriptions/checkout` now accepting `provider` (Task 5); `useAuth()` for `user.phone` (already imported as `useAuth` — confirm the `User` type from `@/contexts/AuthContext` includes `phone: string | null`, it does per that file's `User` interface).
- Produces: nothing consumed elsewhere — this is the leaf UI.

No backend logic here — this task is UI-only, no unit tests (this component has none today; follow that precedent). Verify manually via `pnpm dev` per the project's UI-change convention (CLAUDE.md: "start the dev server and use the feature in a browser before reporting complete").

- [ ] **Step 1: Add provider state + phone check**

In `PacksModal.tsx`, add near the top of the component body (after `const [checkingOut, setCheckingOut] = useState<string | null>(null);`):

```typescript
  const [provider, setProvider] = useState<'bictorys' | 'chariow'>('bictorys');
  const missingPhoneForCard = provider === 'chariow' && !user?.phone;
```

- [ ] **Step 2: Pass `provider` in the checkout call**

Change:

```typescript
      const res = await api<{ paymentUrl: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: { plan: pk.planId },
      });
```

to:

```typescript
      const res = await api<{ paymentUrl: string }>('/api/subscriptions/checkout', {
        method: 'POST',
        body: { plan: pk.planId, provider },
      });
```

No extra guard needed inside `choosePack` itself — Step 3 below disables the button whenever `missingPhoneForCard` applies, and a disabled `<button>` never dispatches `onClick`, so `choosePack` simply can't be reached in that state.

- [ ] **Step 3: Add the toggle UI + disable pack buttons when the guard applies**

Insert right after the header `<div className="mb-6 flex items-start justify-between">...</div>` block and before the `<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">`:

```tsx
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setProvider('bictorys')}
            className={`im-tap flex-1 cursor-pointer rounded-xl border py-2.5 text-sm font-bold sm:flex-none sm:px-5 ${
              provider === 'bictorys'
                ? 'border-brand-green bg-brand-green text-white'
                : 'border-brand-green/15 bg-white text-brand-slate'
            }`}
          >
            📱 Mobile Money
          </button>
          <button
            type="button"
            onClick={() => setProvider('chariow')}
            className={`im-tap flex-1 cursor-pointer rounded-xl border py-2.5 text-sm font-bold sm:flex-none sm:px-5 ${
              provider === 'chariow'
                ? 'border-brand-green bg-brand-green text-white'
                : 'border-brand-green/15 bg-white text-brand-slate'
            }`}
          >
            💳 Carte bancaire
          </button>
        </div>
        {missingPhoneForCard && (
          <p className="mb-4 rounded-xl border border-brand-red/20 bg-brand-red/5 px-4 py-2.5 text-[13px] font-semibold text-brand-red">
            Ajoute ton numéro de téléphone dans les paramètres avant de payer par carte.
          </p>
        )}
```

Then update the pack `<button>`'s `disabled` + label so a "checkout"-action pack visibly reflects the guard:

```tsx
              <button
                type="button"
                onClick={() => choosePack(pk)}
                disabled={checkingOut === pk.name || (pk.action === 'checkout' && missingPhoneForCard)}
                className={`w-full cursor-pointer rounded-xl py-3 text-sm font-bold disabled:opacity-50 ${pk.button}`}
              >
                {checkingOut === pk.name
                  ? 'Redirection…'
                  : pk.action === 'checkout' && missingPhoneForCard
                    ? 'Téléphone requis'
                    : pk.cta}
              </button>
```

- [ ] **Step 4: Fix the footer text (Stripe never existed in this project)**

Change:

```tsx
        <div className="mt-5.5 text-center text-[13px] font-semibold text-brand-muted2">
          Paiement sécurisé · Wave · Orange Money · Free Money · Stripe · Visa · Mastercard
        </div>
```

to:

```tsx
        <div className="mt-5.5 text-center text-[13px] font-semibold text-brand-muted2">
          Paiement sécurisé · Wave · Orange Money · Free Money · Carte bancaire
        </div>
```

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm --filter frontend run typecheck && pnpm --filter frontend run lint`

- [ ] **Step 6: Manual verification (UI change — no automated test for this file)**

Run `pnpm dev`, open the Packs modal (any "Publier" flow, or the dashboard's "+ Nouvelle annonce"), confirm:
- Mobile Money is selected by default, pack buttons behave exactly as before.
- Clicking "Carte bancaire" with no phone on the test account disables Standard/Premium/Annuel with "Téléphone requis" and shows the warning text; "Gratuit" (action `'create'`, not `'checkout'`) stays unaffected.
- Setting a phone in `/parametres` (or whichever settings route this project uses) then reopening the modal enables the buttons again.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/immolink/PacksModal.tsx
git commit -m "feat(payments): add Mobile Money / Carte bancaire toggle to the Packs modal"
```

---

### Task 7: Environment documentation

**Files:**
- Modify: `.env.example` (repo root)
- Modify: `README.md` (repo root)

**Interfaces:** None — documentation only, no code consumes this task's output.

- [ ] **Step 1: Extend `.env.example`**

Find the existing Bictorys section (`# 8. OPTIONAL — Payments (Bictorys, Senegalese mobile money)`, ends around `COMMISSION_RATE_BP=""`). Immediately after it, add a new numbered section (renumber any subsequent sections by +1 if this file numbers sections sequentially — check the file for a `# 9.` section first and adjust):

```
# =============================================================================
# 8b. OPTIONAL — Payments (Chariow, carte bancaire)
# =============================================================================
# Complementary to Bictorys (Mobile Money) — Chariow is offered as the
# "Carte bancaire" option in the Packs modal. Without these, the toggle
# still renders but selecting it returns 503 PAYMENT_PROVIDER_UNCONFIGURED.
# Single platform account — NOT per-user/per-community.

# Bearer token from the Chariow dashboard (Settings → API).
CHARIOW_API_KEY=""

# Override base URL (sandbox/staging swaps).
CHARIOW_API_URL="https://api.chariow.com/v1"

# Webhook secret — Chariow's "Pulse" webhook passes this as a `?secret=`
# QUERY PARAMETER (not a header, unlike Bictorys). Configure the webhook
# URL in the Chariow dashboard as:
#   https://<your-domain>/api/webhooks/chariow?secret=<this value>
CHARIOW_WEBHOOK_SECRET=""

# product_id of a Chariow-side product mirroring each ImmoLink pack.
# ⚠️ MUST match SUBSCRIPTION_PLANS' price exactly (see
# frontend/src/lib/server/subscriptions/plans.ts) — Chariow charges the
# product's own price, never a custom amount; there is no automatic
# cross-check. Re-create/update these whenever a pack price changes.
CHARIOW_PRODUCT_ID_STANDARD=""
CHARIOW_PRODUCT_ID_PREMIUM=""
CHARIOW_PRODUCT_ID_ANNUEL=""

```

- [ ] **Step 2: Extend the README's optional-groups table**

In the table found near `| Paiements (Bictorys) | ... |`, add a new row directly below it:

```markdown
| Paiements carte (Chariow) | `CHARIOW_API_KEY`, `CHARIOW_WEBHOOK_SECRET`, `CHARIOW_PRODUCT_ID_STANDARD`, `CHARIOW_PRODUCT_ID_PREMIUM`, `CHARIOW_PRODUCT_ID_ANNUEL` | Le toggle "Carte bancaire" de la modale Packs renvoie 503 PAYMENT_PROVIDER_UNCONFIGURED ; Mobile Money (Bictorys) reste inchangé |
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document Chariow environment variables and setup"
```

---

## Post-plan manual setup (not code — do this before going live)

1. Create a Chariow merchant account, generate an API key.
2. Create 3 products in the Chariow dashboard, prices in XOF matching `SUBSCRIPTION_PLANS.STANDARD/PREMIUM/ANNUEL.amount` exactly. Note each `product_id`.
3. Configure the Chariow "Pulse" webhook to `https://<domain>/api/webhooks/chariow?secret=<CHARIOW_WEBHOOK_SECRET>` (pick a random secret yourself — nothing auto-generates it in this integration).
4. Set the 5 `CHARIOW_*` variables on Vercel (Production **and** Preview, matching how `BICTORYS_*` is already configured).
5. Do one real sandbox purchase end-to-end (if Chariow offers a sandbox/test mode) before enabling for real users, since `ChariowWebhookPayload`'s exact field names (`data.sale_id` vs `data.id`, etc.) are inferred defensively from the source doc rather than confirmed against a live payload — watch the `[webhook:chariow]` logs on the first real webhook delivery and adjust `extractIds` in `chariow.ts` if the real shape differs.
