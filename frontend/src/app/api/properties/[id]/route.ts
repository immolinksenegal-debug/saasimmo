// GET /api/properties/[id] — public single listing fetch.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
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
