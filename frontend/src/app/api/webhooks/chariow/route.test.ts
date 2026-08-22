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

  it('exports runtime=nodejs and dynamic=force-dynamic', async () => {
    const mod = (await import('./route')) as { runtime?: string; dynamic?: string };
    expect(mod.runtime).toBe('nodejs');
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
