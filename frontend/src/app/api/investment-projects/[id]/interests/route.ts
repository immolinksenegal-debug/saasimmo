// POST /api/investment-projects/[id]/interests — "Manifester mon intérêt"
// lead form on the investment project detail page.
//
// No CSRF check: same rationale as visit-requests — a public, pre-session
// action with no ambient session authority to protect.
//
// IP rate-limited (no email/session to key on) — reuses the email-limiter's
// IP fallback bucket, same as visit-requests.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getInvestmentProjectById } from '@/lib/server/investment-projects';
import { createNotification } from '@/lib/server/notifications';
import { investmentInterestReceived } from '@/lib/server/notifications/templates';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  message: z.string().trim().max(500).optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'investment-interests',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.INVESTMENT_INTEREST_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_INVESTMENT_INTERESTS',
  message: 'Too many requests. Try again later.',
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const limited = await limiter.check(req, null);
    if (limited) return limited;

    const { id } = await params;

    const project = await getInvestmentProjectById(id);
    if (!project) {
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
    const interest = await prisma.investmentInterest.create({
      data: {
        projectId: project.id,
        name: data.name,
        phone: data.phone,
        message: data.message ?? null,
      },
      select: { id: true },
    });

    await createNotification(
      prisma,
      investmentInterestReceived(
        project.ownerId,
        interest.id,
        project.id,
        project.title,
        data.name,
        data.phone,
      ),
    );

    return NextResponse.json(
      { id: interest.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
