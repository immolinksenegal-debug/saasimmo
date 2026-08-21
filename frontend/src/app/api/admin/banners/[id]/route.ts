// PATCH /api/admin/banners/[id] — toggle active / update the link.
// DELETE /api/admin/banners/[id] — remove a banner permanently.
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
  active: z.boolean().optional(),
  linkUrl: z.union([z.string().url(), z.literal('')]).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', message: 'Invalid request body' },
        { status: 400 },
      );
    }

    const existing = await prisma.promoBanner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'BANNER_NOT_FOUND', message: 'Banner not found' },
        { status: 404 },
      );
    }

    const banner = await prisma.$transaction(async (tx) => {
      const updated = await tx.promoBanner.update({
        where: { id },
        data: {
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
          ...(parsed.data.linkUrl !== undefined
            ? { linkUrl: parsed.data.linkUrl.trim() ? parsed.data.linkUrl : null }
            : {}),
        },
        select: { id: true, imageUrl: true, linkUrl: true, active: true, createdAt: true },
      });

      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'banner.update',
        targetType: 'PromoBanner',
        targetId: id,
        metadata: { from: existing, to: updated },
      });

      return updated;
    });

    return NextResponse.json({ banner }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const reqCtx = makeRequestContext(req.headers);
  return withRequestContext(reqCtx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAdmin('ADMIN');
    if (auth instanceof NextResponse) return auth;

    const limited = await enforceAdminRateLimit(auth.admin.id);
    if (limited) return limited;

    const { id } = await ctx.params;
    const existing = await prisma.promoBanner.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'BANNER_NOT_FOUND', message: 'Banner not found' },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.promoBanner.delete({ where: { id } });
      await logAdminAction(tx, {
        actorId: auth.admin.id,
        action: 'banner.delete',
        targetType: 'PromoBanner',
        targetId: id,
        metadata: { imageUrl: existing.imageUrl },
      });
    });

    return NextResponse.json({ ok: true }, { headers: { 'x-request-id': reqCtx.requestId } });
  });
}
