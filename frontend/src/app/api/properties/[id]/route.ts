// GET /api/properties/[id] — public single listing fetch.
// PATCH/DELETE /api/properties/[id] — owner-only edit/delete ("Mes annonces").
// Both require verifyCsrf + requireAuth, then scope the lookup by
// `ownerId: auth.user.sub` and return 404 (not 403) on a mismatch so a
// listing's existence isn't leaked to non-owners.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { getPropertyById, serializeProperty } from '@/lib/server/properties';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { id } = await params;
    const property = await getPropertyById(id);
    if (!property) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { property: serializeProperty(property) },
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const existing = await prisma.property.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    const data = parsed.data;
    const images = data.images?.filter(Boolean) ?? [];

    const updated = await prisma.property.update({
      where: { id },
      data: {
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
        charges: data.charges?.trim() || 'Non applicable',
        ...(images.length
          ? {
              image: images[0],
              image2: images[1] ?? images[0],
              image3: images[2] ?? images[0],
              photos: images.length,
            }
          : {}),
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: updated.id },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const existing = await prisma.property.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.property.delete({ where: { id } });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
