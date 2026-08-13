// GET /api/properties — public listing search (ImmoLink real estate domain).
// POST /api/properties — publish a new listing ("Publier une annonce").
//
// GET: query params txn (Vente|Location), city, q (search title/city/quartier).
// No auth required — listings are public.
//
// POST: verifyCsrf → optionalAuth (soft — no /login page exists yet, so an
// anonymous submit is attributed to the seeded demo seller via
// `resolveOwnerId`, see src/lib/server/properties.ts) → Zod validate →
// insert. Photos are optional; missing ones fall back to a stock image for
// the property type so cards/detail pages never render broken images.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { optionalAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { listProperties, serializeProperty, resolveOwnerId } from '@/lib/server/properties';
import { getEffectiveListingQuota } from '@/lib/server/subscriptions';
import { lockUserTx } from '@/lib/server/withdrawals/lock';
import { placeholderImageFor } from '@/lib/mock/immolink';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const url = req.nextUrl;
    const txnParam = url.searchParams.get('txn');
    const txn = txnParam === 'Vente' || txnParam === 'Location' ? txnParam : undefined;
    const city = url.searchParams.get('city') ?? undefined;
    const q = url.searchParams.get('q') ?? undefined;
    const typeParam = url.searchParams.get('type');
    const type = ['Villa', 'Appartement', 'Terrain', 'Bureau'].includes(typeParam ?? '')
      ? (typeParam ?? undefined)
      : undefined;
    const priceMaxParam = Number.parseInt(url.searchParams.get('priceMax') ?? '', 10);
    const priceMax =
      Number.isFinite(priceMaxParam) && priceMaxParam > 0 ? priceMaxParam : undefined;
    const bedsMinParam = Number.parseInt(url.searchParams.get('bedsMin') ?? '', 10);
    const bedsMin = Number.isFinite(bedsMinParam) && bedsMinParam > 0 ? bedsMinParam : undefined;
    const agency = url.searchParams.get('agency') ?? undefined;

    const rows = await listProperties({ txn, city, q, type, agency, priceMax, bedsMin });

    return NextResponse.json(
      { items: rows.map(serializeProperty) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({
  title: z.string().trim().min(5).max(120),
  type: z.enum(['Villa', 'Appartement', 'Terrain', 'Bureau']),
  txn: z.enum(['Vente', 'Location']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().min(2).max(60),
  price: z.number().int().positive(),
  beds: z.number().int().min(0).max(20).default(0),
  baths: z.number().int().min(0).max(20).default(0),
  surface: z.number().int().positive(),
  charges: z.string().trim().max(120).optional(),
  images: z.array(z.string().url()).max(3).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await optionalAuth();
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

    const ownerId = await resolveOwnerId(auth?.user.sub);
    if (ownerId instanceof NextResponse) return ownerId;

    const data = parsed.data;
    const placeholder = placeholderImageFor(data.type);
    const images = data.images?.filter(Boolean) ?? [];
    const image = images[0] ?? placeholder;
    const image2 = images[1] ?? image;
    const image3 = images[2] ?? image;

    // Advisory-locked (same helper as withdrawals/lock.ts) so two concurrent
    // submits near the quota edge can't both pass the count check before
    // either insert lands — the second one serializes behind the first and
    // sees its now-incremented activeCount.
    const result = await prisma.$transaction(async (tx) => {
      await lockUserTx(tx, ownerId);

      const [quota, activeCount] = await Promise.all([
        getEffectiveListingQuota(tx, ownerId),
        tx.property.count({ where: { ownerId, status: 'ACTIVE' } }),
      ]);
      if (activeCount >= quota) {
        return { quotaExceeded: true as const, activeCount, quota };
      }

      const property = await tx.property.create({
        data: {
          ownerId,
          title: data.title,
          type: data.type,
          txn: data.txn,
          city: data.city,
          quartier: data.quartier,
          price: data.price,
          unit: data.txn === 'Location' ? '/mois' : '',
          beds: data.beds,
          baths: data.baths,
          surface: data.surface,
          badge: 'Nouveau',
          image,
          image2,
          image3,
          photos: Math.max(images.length, 1),
          agent: auth?.user.email ?? 'Aïcha Ndiaye',
          agency: auth ? 'Particulier' : 'Prestige Immo',
          charges: data.charges?.trim() || 'Non applicable',
        },
        select: { id: true },
      });

      return { quotaExceeded: false as const, id: property.id };
    });

    if (result.quotaExceeded) {
      return NextResponse.json(
        {
          error: 'LISTING_QUOTA_EXCEEDED',
          message: `Quota d'annonces actives atteint (${result.activeCount}/${result.quota}). Passez à un pack supérieur pour publier davantage.`,
        },
        { status: 403, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    return NextResponse.json(
      { id: result.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
