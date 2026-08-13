// Coverage for POST /api/properties/[id]/favorite, added while auditing the
// whole ImmoLink surface for concurrency bugs.
//
// Two rapid toggles (double-click, retried request) can both read
// `existing = null` before either writes, then both attempt
// `favorite.create` — the loser hits Prisma P2002 (unique constraint) or,
// symmetrically on the delete branch, P2025 (record not found). Previously
// that error propagated unhandled out of the route, producing a raw
// non-JSON 500. These tests pin the fix: both codes are caught and
// answered with the resulting toggle state instead of crashing.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/server/middleware', () => ({
  requireAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 'me@example.com' } })),
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);

function makeReq(): NextRequest {
  return new NextRequest('http://test/api/properties/prop-1/favorite', { method: 'POST' });
}

function ctx() {
  return { params: Promise.resolve({ id: 'prop-1' }) };
}

function knownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } } as never);
  prismaMock.property.findFirst.mockResolvedValue({ id: 'prop-1' } as never);
});

describe('POST /api/properties/[id]/favorite', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(403);
  });

  it('property not found returns 404', async () => {
    prismaMock.property.findFirst.mockResolvedValue(null);
    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(404);
  });

  it('not yet favorited: creates + increments favs', async () => {
    prismaMock.favorite.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockResolvedValue([{}, { favs: 5 }]);

    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ favorited: true, favs: 5 });
  });

  it('already favorited: deletes + decrements favs', async () => {
    prismaMock.favorite.findUnique.mockResolvedValue({ id: 'fav-1' } as never);
    prismaMock.$transaction.mockResolvedValue([{}, { favs: 3 }]);

    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ favorited: false, favs: 3 });
  });

  it('race on create (P2002): reports favorited=true instead of a raw 500', async () => {
    prismaMock.favorite.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(knownError('P2002'));
    prismaMock.property.findUnique.mockResolvedValue({ favs: 7 } as never);

    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ favorited: true, favs: 7 });
  });

  it('race on delete (P2025): reports favorited=false instead of a raw 500', async () => {
    prismaMock.favorite.findUnique.mockResolvedValue({ id: 'fav-1' } as never);
    prismaMock.$transaction.mockRejectedValue(knownError('P2025'));
    prismaMock.property.findUnique.mockResolvedValue({ favs: 4 } as never);

    const res = await POST(makeReq(), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ favorited: false, favs: 4 });
  });

  it('unrelated transaction error still propagates (not swallowed)', async () => {
    prismaMock.favorite.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValue(new Error('db is down'));

    await expect(POST(makeReq(), ctx())).rejects.toThrow('db is down');
  });
});
