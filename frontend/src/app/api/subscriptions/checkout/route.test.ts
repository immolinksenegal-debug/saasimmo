// Tests for POST /api/subscriptions/checkout — provider selection
// (bictorys default, chariow opt-in with a phone-required guard).
//
// Bootstrap mirrors app/api/orders/route.test.ts:
//   - prisma-mock first (auto-hoists vi.mock for '@/lib/server/prisma')
//   - mockNextCookies() for next/headers async cookies()
//   - vi.mock('@/lib/server/middleware') so requireAuth is per-test controllable
//   - vi.mock both payment-provider singletons so getProvider()/getChariowProvider()
//     return stub PaymentProviders instead of trying to read real env vars.
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

interface MakeCheckoutReqOpts {
  csrf?: 'match' | 'missing';
}

// verifyCsrf(req) just compares the `x-csrf-token` header against the
// `app-csrf` cookie — both hand-set here, no signing involved. Mirrors
// app/api/orders/route.test.ts's `makePost` helper exactly.
function makeCheckoutReq(body: unknown, opts: MakeCheckoutReqOpts = {}): NextRequest {
  const csrf = opts.csrf ?? 'match';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (csrf === 'match') {
    headers['x-csrf-token'] = 'csrf-tok';
    headers['cookie'] = 'app-csrf=csrf-tok';
  }
  return body === undefined
    ? new NextRequest('http://localhost/api/subscriptions/checkout', { method: 'POST', headers })
    : new NextRequest('http://localhost/api/subscriptions/checkout', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    const res = await POST(makeCheckoutReq({ plan: 'STANDARD' }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'bictorys' }) }),
    );
    expect(mockGetChariowProvider).not.toHaveBeenCalled();
  });

  it('provider: "chariow" without a phone on file returns 400 PHONE_REQUIRED before any network call', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: null } as never);
    const res = await POST(makeCheckoutReq({ plan: 'STANDARD', provider: 'chariow' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('PHONE_REQUIRED');
    expect(mockGetChariowProvider).not.toHaveBeenCalled();
  });

  it('provider: "chariow" with a phone on file charges through Chariow and stores provider="chariow"', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+221771234567' } as never);
    mockGetChariowProvider.mockReturnValue({ name: 'chariow', charge: vi.fn() } as never);
    mockChariowExecute.mockResolvedValue({
      providerChargeId: 'sale_1',
      paymentUrl: 'https://checkout.chariow/1',
    });
    const res = await POST(makeCheckoutReq({ plan: 'STANDARD', provider: 'chariow' }));
    expect(res.status).toBe(201);
    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ provider: 'chariow' }) }),
    );
  });

  it('idempotency key is scoped per-provider: a same-day PENDING bictorys order does NOT short-circuit a chariow request (Finding 3)', async () => {
    // First call: bictorys, no existing order -> creates one and its
    // idempotencyKey embeds "bictorys".
    mockGetProvider.mockReturnValue({ name: 'bictorys', charge: vi.fn() } as never);
    mockExecute.mockResolvedValue({ providerChargeId: 'c1', paymentUrl: 'https://pay/1' });
    prismaMock.order.findUnique.mockResolvedValueOnce(null);
    const res1 = await POST(makeCheckoutReq({ plan: 'STANDARD', provider: 'bictorys' }));
    expect(res1.status).toBe(201);

    // Second call, same user/plan/day but provider: "chariow" — must be
    // treated as a DIFFERENT idempotency key, not short-circuited by the
    // bictorys order's PENDING/FAILED state.
    prismaMock.user.findUnique.mockResolvedValue({ phone: '+221771234567' } as never);
    mockGetChariowProvider.mockReturnValue({ name: 'chariow', charge: vi.fn() } as never);
    mockChariowExecute.mockResolvedValue({
      providerChargeId: 'sale_1',
      paymentUrl: 'https://checkout.chariow/1',
    });
    prismaMock.order.findUnique.mockResolvedValueOnce(null); // different key -> no existing row
    const res2 = await POST(makeCheckoutReq({ plan: 'STANDARD', provider: 'chariow' }));
    expect(res2.status).toBe(201);

    expect(prismaMock.order.create).toHaveBeenCalledTimes(2);
    const keys = prismaMock.order.findUnique.mock.calls.map(
      (c) => (c[0] as { where: { idempotencyKey: string } }).where.idempotencyKey,
    );
    expect(keys[0]).toContain(':bictorys:');
    expect(keys[1]).toContain(':chariow:');
    expect(keys[0]).not.toBe(keys[1]);
  });
});
