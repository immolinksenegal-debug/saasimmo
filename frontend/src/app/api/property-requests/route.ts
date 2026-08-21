// GET /api/property-requests — public listing of active search requests.
// POST /api/property-requests — publish a new search request ("Publier une demande").
//
// GET: query params txn (Vente|Location), city, type. No auth required.
// Does NOT include the requester's phone — see listPropertyRequestsWithContact
// in lib/server/property-requests.ts for the page that does.
//
// POST: verifyCsrf → requireAuth (hard requirement, unlike optionalAuth on
// POST /api/properties — no anonymous fallback for demandes) → Zod validate
// → insert. No listing-quota check: publishing a demande is free and
// unlimited (see design doc).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import {
  listPropertyRequests,
  createPropertyRequest,
  serializePropertyRequest,
} from '@/lib/server/property-requests';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const url = req.nextUrl;
    const txnParam = url.searchParams.get('txn');
    const txn = txnParam === 'Vente' || txnParam === 'Location' ? txnParam : undefined;
    const city = url.searchParams.get('city') ?? undefined;
    const typeParam = url.searchParams.get('type');
    const type = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'].includes(
      typeParam ?? '',
    )
      ? (typeParam ?? undefined)
      : undefined;

    const rows = await listPropertyRequests({ txn, city, type });

    return NextResponse.json(
      { items: rows.map(serializePropertyRequest) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({
  txn: z.enum(['Vente', 'Location']),
  type: z.enum(['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().max(60).optional(),
  budgetMax: z.number().int().positive(),
  bedsMin: z.number().int().min(0).max(20).default(0),
  message: z.string().trim().max(500).optional(),
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

    const result = await createPropertyRequest(auth.user.sub, parsed.data);

    return NextResponse.json(
      { id: result.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
