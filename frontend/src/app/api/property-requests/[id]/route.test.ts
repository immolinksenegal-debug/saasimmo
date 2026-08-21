// Coverage for PATCH/DELETE /api/property-requests/[id] — owner-only
// mutations, 404 (not 403) on a non-owner/missing row so existence isn't
// leaked (same convention as PATCH/DELETE /api/properties/[id]).
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 'me@example.com' } })),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { PATCH, DELETE } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);

function ctx() {
  return { params: Promise.resolve({ id: 'pr-1' }) };
}

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://test/api/property-requests/pr-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDelete(): NextRequest {
  return new NextRequest('http://test/api/property-requests/pr-1', { method: 'DELETE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({
    user: { sub: 'user-1', email: 'me@example.com' },
  } as never);
});

describe('PATCH /api/property-requests/[id]', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);
    const res = await PATCH(makePatch({ status: 'FULFILLED' }), ctx());
    expect(res.status).toBe(403);
  });

  it('non-owner or missing request returns 404', async () => {
    prismaMock.propertyRequest.findFirst.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: 'FULFILLED' }), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.propertyRequest.update).not.toHaveBeenCalled();
  });

  it('invalid status returns 400 VALIDATION_FAILED', async () => {
    prismaMock.propertyRequest.findFirst.mockResolvedValue({ id: 'pr-1' } as never);
    const res = await PATCH(makePatch({ status: 'DONE' }), ctx());
    expect(res.status).toBe(400);
  });

  it('owner marking as FULFILLED updates the status', async () => {
    prismaMock.propertyRequest.findFirst.mockResolvedValue({ id: 'pr-1' } as never);
    prismaMock.propertyRequest.update.mockResolvedValue({ id: 'pr-1' } as never);

    const res = await PATCH(makePatch({ status: 'FULFILLED' }), ctx());
    expect(res.status).toBe(200);
    expect(prismaMock.propertyRequest.update).toHaveBeenCalledWith({
      where: { id: 'pr-1' },
      data: { status: 'FULFILLED' },
      select: { id: true },
    });
  });
});

describe('DELETE /api/property-requests/[id]', () => {
  it('non-owner or missing request returns 404', async () => {
    prismaMock.propertyRequest.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.propertyRequest.delete).not.toHaveBeenCalled();
  });

  it('owner deletes their own request', async () => {
    prismaMock.propertyRequest.findFirst.mockResolvedValue({ id: 'pr-1' } as never);
    prismaMock.propertyRequest.delete.mockResolvedValue({ id: 'pr-1' } as never);

    const res = await DELETE(makeDelete(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
