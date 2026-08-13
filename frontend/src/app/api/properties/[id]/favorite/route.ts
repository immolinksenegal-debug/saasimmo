// POST /api/properties/[id]/favorite — toggle the current user's favorite
// on a listing. Auth required (favorites are per-account); anonymous
// visitors use the client-only localStorage store instead (see
// src/lib/useFavorites.ts) and never reach this route.
//
// `Property.favs` is a denormalized counter (existing field, shown on
// cards/detail pages) — kept in sync inside the same transaction as the
// Favorite row so it never drifts from the real per-user rows.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id: propertyId } = await params;
    const userId = auth.user.sub;

    const property = await prisma.property.findFirst({
      where: { id: propertyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const existing = await prisma.favorite.findUnique({
      where: { userId_propertyId: { userId, propertyId } },
    });

    // Two rapid toggles (double-click, retried request) can both read
    // `existing` before either writes. The loser hits a unique-constraint
    // (create) or record-not-found (delete) error inside the transaction —
    // treat that as "someone else already applied this toggle" and report
    // the resulting state instead of surfacing a raw 500.
    try {
      const [, updated] = existing
        ? await prisma.$transaction([
            prisma.favorite.delete({ where: { id: existing.id } }),
            prisma.property.update({
              where: { id: propertyId },
              data: { favs: { decrement: 1 } },
              select: { favs: true },
            }),
          ])
        : await prisma.$transaction([
            prisma.favorite.create({ data: { userId, propertyId } }),
            prisma.property.update({
              where: { id: propertyId },
              data: { favs: { increment: 1 } },
              select: { favs: true },
            }),
          ]);

      return NextResponse.json(
        { favorited: !existing, favs: updated.favs },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    } catch (err) {
      const raced =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2002' || err.code === 'P2025');
      if (!raced) throw err;

      const current = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { favs: true },
      });
      return NextResponse.json(
        { favorited: !existing, favs: current?.favs ?? 0 },
        { headers: { 'x-request-id': ctx.requestId } },
      );
    }
  });
}
