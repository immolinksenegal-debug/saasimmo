// GET /api/favorites — list the current user's favorited property ids.
//
// Auth required: favorites are per-account (no anonymous server-side
// favorites — anonymous visitors keep the client-only localStorage store,
// see src/lib/useFavorites.ts). Returns ids only; the client already has
// (or can fetch) full property data via /api/properties.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const rows = await prisma.favorite.findMany({
      where: { userId: auth.user.sub },
      select: { propertyId: true },
    });

    return NextResponse.json(
      { propertyIds: rows.map((r) => r.propertyId) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
