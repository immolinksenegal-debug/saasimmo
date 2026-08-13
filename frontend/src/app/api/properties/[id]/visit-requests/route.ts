// POST /api/properties/[id]/visit-requests — "Demander une visite" lead form
// on the property detail page.
//
// No CSRF check: same rationale as /api/auth/signup — this is a public,
// pre-session action (most site visitors browsing listings are anonymous)
// with no ambient session authority to protect. The worst a forged
// cross-site submission can do is send the owner a spurious lead
// notification, not mutate session-tied state.
//
// IP rate-limited (no email/session to key on) so the same public-form
// exposure can't be used to flood an owner's notifications or the DB —
// reuses the email-limiter's IP fallback bucket (see rate-limit-by-email.ts).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getPropertyById } from '@/lib/server/properties';
import { createNotification } from '@/lib/server/notifications';
import { visitRequested } from '@/lib/server/notifications/templates';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  message: z.string().trim().max(500).optional(),
  preferredAt: z.string().datetime().optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'visit-requests',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.VISIT_REQUEST_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_VISIT_REQUESTS',
  message: 'Too many visit requests. Try again later.',
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

    const property = await getPropertyById(id);
    if (!property) {
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
    const visitRequest = await prisma.visitRequest.create({
      data: {
        propertyId: property.id,
        name: data.name,
        phone: data.phone,
        message: data.message ?? null,
        preferredAt: data.preferredAt ? new Date(data.preferredAt) : null,
      },
      select: { id: true },
    });

    await createNotification(
      prisma,
      visitRequested(
        property.ownerId,
        visitRequest.id,
        property.id,
        property.title,
        data.name,
        data.phone,
      ),
    );

    return NextResponse.json(
      { id: visitRequest.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
