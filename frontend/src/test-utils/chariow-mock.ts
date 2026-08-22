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
