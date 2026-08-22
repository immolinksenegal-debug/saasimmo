// POST /api/subscriptions/checkout — buy/renew a seller pack (Standard or
// Premium). Deliberately NOT a passthrough to the generic /api/orders: that
// endpoint trusts the client-supplied `amount`, which is correct for its
// original "you choose your contribution" use case but wrong here — a
// tampered request could otherwise claim Premium's quota at Standard's
// price (or free). This route prices from the server-side
// SUBSCRIPTION_PLANS catalog only.
//
// Reuses the SAME provider/circuit-breaker singleton as /api/orders (never
// re-implemented) so both checkout paths share one breaker's failure state
// and one lazy-init Bictorys client. The idempotency strategy is
// deliberately simpler than /api/orders' Stripe-grade Idempotency-Key
// header + body-fingerprint replay (CR-02) — this is a narrow, fixed-price
// catalog, not a general payment API, so a same-day deterministic key is
// enough to stop accidental double-submit double-charges.
//
// Activation happens in the Bictorys webhook (api/webhooks/bictorys/route.ts
// onPaid), not here — this route only starts the checkout and returns the
// hosted paymentUrl to redirect to.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';
import { prisma } from '@/lib/server/prisma';
import { CircuitOpenError } from '@/lib/server/payments/circuit-breaker';
import {
  breaker,
  getProvider,
  PaymentProviderUnconfiguredError,
} from '@/lib/server/payments/provider-singleton';
import {
  getChariowProvider,
  chariowBreaker,
  ChariowProviderUnconfiguredError,
} from '@/lib/server/payments/chariow-singleton';
import { SUBSCRIPTION_PLANS, isSubscriptionPlan } from '@/lib/server/subscriptions/plans';

const Body = z.object({
  plan: z.string().refine(isSubscriptionPlan, { message: 'Unknown plan' }),
  provider: z.enum(['bictorys', 'chariow']).default('bictorys'),
});

const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const plan = parsed.data.plan;
    const providerName = parsed.data.provider;
    const catalog = SUBSCRIPTION_PLANS[plan];

    // Deterministic same-day dedup key — a user double-clicking "Choisir
    // Premium" replays the same in-flight/completed order instead of
    // starting (and being charged for) a second one. Scoped by provider too:
    // without this, switching providers mid-flow (e.g. Mobile Money ->
    // Carte bancaire) would either return the OTHER provider's stale
    // paymentUrl, or get blocked by the other provider's earlier failure.
    const idemKey = `pack:${auth.user.sub}:${plan}:${providerName}:${new Date().toISOString().slice(0, 10)}`;
    const existing = await prisma.order.findUnique({ where: { idempotencyKey: idemKey } });
    if (existing) {
      if (existing.status === 'PENDING' || existing.status === 'PAID') {
        if (existing.status === 'PENDING' && !existing.paymentUrl) {
          return NextResponse.json(
            {
              error: 'PAYMENT_IN_FLIGHT',
              message: 'Prior attempt did not complete; retry shortly.',
            },
            { status: 503, headers: { 'x-request-id': ctx.requestId, 'Retry-After': '5' } },
          );
        }
        return NextResponse.json(
          { id: existing.id, paymentUrl: existing.paymentUrl, status: existing.status },
          { status: 200, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNAVAILABLE',
          message:
            "A previous attempt today didn't complete; try again tomorrow or contact support.",
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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
      if (
        err instanceof PaymentProviderUnconfiguredError ||
        err instanceof ChariowProviderUnconfiguredError
      ) {
        return NextResponse.json(
          { error: 'PAYMENT_PROVIDER_UNCONFIGURED', message: 'Payment provider not configured' },
          { status: 503, headers: { 'x-request-id': ctx.requestId } },
        );
      }
      throw err;
    }

    const envPublicUrl = process.env.PUBLIC_URL;
    if (!envPublicUrl && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        {
          error: 'PAYMENT_PROVIDER_UNCONFIGURED',
          message: 'PUBLIC_URL not set; cannot construct success/failure redirect URLs.',
        },
        { status: 503, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    const publicUrl = envPublicUrl ?? 'http://localhost:3000';

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

    try {
      const result = await activeBreaker.execute(() =>
        provider.charge({
          amount: catalog.amount,
          currency: 'XOF',
          customer: phoneForCharge
            ? { email: auth.user.email, phone: phoneForCharge }
            : { email: auth.user.email },
          successUrl: `${publicUrl}/paiement/succes?o=${order.id}`,
          failureUrl: `${publicUrl}/paiement/echec?o=${order.id}`,
          externalRef: order.id,
          metadata: { plan },
        }),
      );

      await prisma.order.update({
        where: { id: order.id },
        data: { providerChargeId: result.providerChargeId, paymentUrl: result.paymentUrl },
      });

      return NextResponse.json(
        { id: order.id, paymentUrl: result.paymentUrl, status: 'PENDING' },
        { status: 201, headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
        const retryAfterSec = Math.max(1, Math.ceil((err.retryAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          {
            error: 'PAYMENT_PROVIDER_UNAVAILABLE',
            message: 'Payment provider temporarily unavailable. Try again shortly.',
          },
          {
            status: 503,
            headers: { 'x-request-id': ctx.requestId, 'Retry-After': String(retryAfterSec) },
          },
        );
      }
      await prisma.order.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      const message = err instanceof Error ? err.message : 'Unknown payment error';
      return NextResponse.json(
        { error: 'PAYMENT_FAILED', message },
        { status: 502, headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
