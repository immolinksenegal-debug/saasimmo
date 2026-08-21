// POST /api/investment-projects — publish a new investment project
// ("Publier mon projet"). Auth is hard-required (unlike POST /api/properties'
// optionalAuth) — see the design spec's cadrage decision #2. No quota check
// (decision #3): publishing is free and unlimited in v1.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

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
  images: z.array(z.string().url()).min(1).max(3),
});

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

    const data = parsed.data;
    const image = data.images[0]!; // zod .min(1) guarantees at least one URL
    const image2 = data.images[1] ?? null;
    const image3 = data.images[2] ?? null;

    const project = await prisma.investmentProject.create({
      data: {
        ownerId: auth.user.sub,
        title: data.title,
        description: data.description,
        type: data.type,
        city: data.city,
        quartier: data.quartier,
        priceFrom: data.priceFrom,
        lotsLabel: data.lotsLabel,
        ...(data.status ? { status: data.status } : {}),
        developerName: data.developerName?.trim() || null,
        image,
        image2,
        image3,
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: project.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
