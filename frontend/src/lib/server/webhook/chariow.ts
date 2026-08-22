// frontend/src/lib/server/webhook/chariow.ts
// Mirrors webhook/bictorys.ts exactly: re-exports the WebhookProvider impl
// from the payments adapter with lazy-init env reads (so vi.stubEnv works
// in tests). No kind-upgrade needed here — createChariowProvider's
// extractIds already classifies cancel/abandon/refund as 'failed' and
// settle/complete/paid/success as 'paid' directly (see chariow.ts).
import 'server-only';
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
