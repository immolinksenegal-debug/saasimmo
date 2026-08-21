// GET /api/investment-projects/[id] — public single project fetch (also
// used client-side by the edit page to pre-fill the form + check ownership).
// PATCH/DELETE — owner-only ("Mes projets"). Both require verifyCsrf +
// requireAuth, then scope the lookup by `ownerId: auth.user.sub` and return
// 404 (not 403) on a mismatch so a project's existence isn't leaked.
// DELETE soft-deletes (recordStatus: ARCHIVED) so existing InvestmentInterest
// leads aren't orphaned.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  getInvestmentProjectById,
  serializeInvestmentProject,
} from '@/lib/server/investment-projects';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { id } = await params;
    const project = await getInvestmentProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { project: serializeInvestmentProject(project) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(2000),
  type: z.enum(['Résidentiel', 'Terrain', 'Bureau', 'Mixte']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().min(2).max(60),
  priceFrom: z.number().int().positive(),
  lotsLabel: z.string().trim().min(2).max(60),
  status: z.string().trim().min(2).max(40).optional(),
  developerName: z.string().trim().max(100).optional(),
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
    const existing = await prisma.investmentProject.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
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

    const updated = await prisma.investmentProject.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        city: data.city,
        quartier: data.quartier,
        priceFrom: data.priceFrom,
        lotsLabel: data.lotsLabel,
        ...(data.status ? { status: data.status } : {}),
        developerName: data.developerName?.trim() || null,
        ...(images.length
          ? {
              image: images[0]!,
              image2: images[1] ?? null,
              image3: images[2] ?? null,
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
    const existing = await prisma.investmentProject.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.investmentProject.update({
      where: { id },
      data: { recordStatus: 'ARCHIVED' },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
