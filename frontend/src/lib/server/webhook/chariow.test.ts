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
