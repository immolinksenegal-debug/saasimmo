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
    const externalRef = String(
      payload.data?.sale_id ?? payload.data?.id ?? payload.sale_id ?? payload.id ?? '',
    );
    if (!externalRef) return {};

    const order = await tx.order.findFirst({ where: { providerChargeId: externalRef } });
    if (!order) return {};

    await tx.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });

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
        payload: {
          userId: order.userId,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
      });
    }
    if (order.customerEmail) {
      await enqueueOutbox(tx, {
        kind: 'email.payment_confirmation',
        payload: {
          to: order.customerEmail,
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
      });
    }

    return {};
  },

  async onFailed(payload, tx) {
    const externalRef = String(
      payload.data?.sale_id ?? payload.data?.id ?? payload.sale_id ?? payload.id ?? '',
    );
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
