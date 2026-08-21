// GET /api/admin/banners — list all promo banners (newest first).
// POST /api/admin/banners — create a new banner. The image itself is
// uploaded beforehand via POST /api/upload (existing pipeline); this route
// just records the resulting URL + optional click-through link.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAdmin } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { logAdminAction } from '@/lib/server/admin/audit';
import { enforceAdminRateLimit } from '@/lib/server/middleware/rate-limit-by-userid';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  imageUrl: z.string().url(),
  linkUrl: z.union([z.string().url(), z.literal('')]).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const banners = await prisma.promoBanner.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, imageUrl: true, linkUrl: true, active: true, createdAt: true },
    });

    return NextResponse.json({ banners }, { headers: { 'x-request-id': ctx.requestId } });
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const banner = await prisma.$transaction(async (tx) => {
      const created = await tx.promoBanner.create({
        data: {
          imageUrl: parsed.data.imageUrl,
          linkUrl: parsed.data.linkUrl?.trim() ? parsed.data.linkUrl : null,
          createdById: auth.admin.id,
        },
        select: { id: true, imageUrl: true, linkUrl: true, active: true, createdAt: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'banner.create',
        targetType: 'PromoBanner',
        targetId: created.id,
        metadata: { imageUrl: created.imageUrl, linkUrl: created.linkUrl },
      });

      return created;
    });

    return NextResponse.json(
      { banner },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
