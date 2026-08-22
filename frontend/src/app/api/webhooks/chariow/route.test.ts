import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
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
    const kinds = outboxCreate.mock.calls.map(
      (c) => (c[0] as { data: { kind: string } }).data.kind,
    );
    expect(
      kinds.some(
        (k) => k === 'notification.payment_received' || k === 'email.payment_confirmation',
      ),
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

  it('does NOT activate a Subscription when Order.metadata.kind is not pack_subscription', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o3',
      userId: 'u3',
      customerEmail: 'c@d.com',
      amount: 5000,
      currency: 'XOF',
      metadata: { kind: 'listing_boost' }, // not a pack purchase
    });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled' });
    await POST(req);
    // The Order still gets marked PAID — only the Subscription gate is skipped.
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('does NOT activate a Subscription when Order.metadata.plan is not a valid SubscriptionPlan', async () => {
    findUnique.mockResolvedValueOnce(null);
    orderFindFirst.mockResolvedValueOnce({
      id: 'o4',
      userId: 'u4',
      customerEmail: 'e@f.com',
      amount: 5000,
      currency: 'XOF',
      metadata: { kind: 'pack_subscription', plan: 'NOT_A_REAL_PLAN' },
    });
    const { POST } = await import('./route');
    const { req } = chariowFixtureRequest({ status: 'settled' });
    await POST(req);
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('an "unpaid" sale event dispatches neither onPaid nor onFailed — Order and Subscription untouched', async () => {
    findUnique.mockResolvedValueOnce(null);
    // Built directly (not via chariowFixture's typed ChariowFixtureOpts.status,
    // which only covers 'settled' | 'failed' | 'cancelled') because
    // mapChariowStatus classifies "unpaid" as PENDING -> ParsedIds.kind
    // 'other', which createWebhookHandler dispatches to neither onPaid nor
    // onFailed. This proves that at the route level, not just at the
    // extractIds-classification level (see lib/server/payments/chariow.test.ts).
    const secret = 'test-chariow-webhook-secret';
    const payload = { event: 'unpaid.sale', data: { sale_id: 'sale_test_001', status: 'unpaid' } };
    const req = new NextRequest(`http://localhost/api/webhooks/chariow?secret=${secret}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify(payload)) as unknown as BodyInit,
    });
    const { POST } = await import('./route');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deduped: false });
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(subscriptionUpsert).not.toHaveBeenCalled();
  });

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
