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
    expect(() => createChariowProvider({ ...ENV, CHARIOW_API_KEY: '' })).toThrow(/CHARIOW_API_KEY/);
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

  it('webhookProvider.extractIds falls back to the event name when data.status is absent entirely (Finding 2)', () => {
    const provider = createChariowProvider(ENV);
    // No `status` anywhere in the payload — only the event name signals
    // success. Without the fallback this resolves to kind:'other' and the
    // webhook silently never activates the order.
    const ids = provider.webhookProvider.extractIds({
      event: 'settled.sale',
      data: { sale_id: 'sale_789' },
    });
    expect(ids.kind).toBe('paid');
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
