// Coverage for GET/POST /api/properties, added while auditing the whole
// ImmoLink surface for concurrency bugs.
//
// POST previously checked the listing quota (count vs subscription-derived
// limit) OUTSIDE any transaction, then inserted separately — two concurrent
// submits near the quota edge could both read "under quota" and both
// insert, silently exceeding it. The fix wraps the count-check + insert in
// a single `prisma.$transaction` guarded by the same per-user advisory
// lock withdrawals use (`lockUserTx`), so the second submit serializes
// behind the first and sees its already-incremented count. These tests
// pin that behavior: lock-before-count-before-insert, and an accurate
// reject when the count (read inside the lock) is already at quota.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/auth', () => ({
  verifyCsrf: vi.fn(() => null),
}));

vi.mock('@/lib/server/middleware', () => ({
  optionalAuth: vi.fn(async () => ({ user: { sub: 'user-1', email: 'me@example.com' } })),
}));

const { lockSpy } = vi.hoisted(() => ({ lockSpy: vi.fn() }));
vi.mock('@/lib/server/withdrawals/lock', () => ({
  lockUserTx: lockSpy,
}));

import { verifyCsrf } from '@/lib/server/auth';
import { optionalAuth } from '@/lib/server/middleware';
import { GET, POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockOptionalAuth = vi.mocked(optionalAuth);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/properties', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: 'Belle villa avec piscine',
  type: 'Villa',
  txn: 'Vente',
  city: 'Dakar',
  quartier: 'Almadies',
  price: 50_000_000,
  beds: 3,
  baths: 2,
  surface: 300,
};

beforeEach(() => {
  vi.clearAllMocks();
  lockSpy.mockClear();
  mockVerifyCsrf.mockReturnValue(null);
  mockOptionalAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } } as never);
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/properties', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ title: 'x' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('under quota: locks the user, then counts, then creates — in that order', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null); // free tier, quota=1
    prismaMock.property.count.mockResolvedValue(0);
    prismaMock.property.create.mockResolvedValue({ id: 'prop-1' } as never);

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('prop-1');

    expect(lockSpy).toHaveBeenCalledWith(prismaMock, 'user-1');
    const lockOrder = lockSpy.mock.invocationCallOrder[0]!;
    const countOrder = prismaMock.property.count.mock.invocationCallOrder[0]!;
    const createOrder = prismaMock.property.create.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(countOrder);
    expect(countOrder).toBeLessThan(createOrder);
  });

  it('at quota: rejects 403 LISTING_QUOTA_EXCEEDED and never calls create (race-safe reject)', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null); // free tier, quota=1
    prismaMock.property.count.mockResolvedValue(1); // already at the free quota

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('LISTING_QUOTA_EXCEEDED');
    expect(prismaMock.property.create).not.toHaveBeenCalled();
  });

  it('active PREMIUM subscription raises the quota above the free tier', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({
      userId: 'user-1',
      status: 'ACTIVE',
      plan: 'PREMIUM',
      listingQuota: 50,
      renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    } as never);
    prismaMock.property.count.mockResolvedValue(8); // well under 50
    prismaMock.property.create.mockResolvedValue({ id: 'prop-2' } as never);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
  });
});

describe('GET /api/properties', () => {
  it('lists active properties, serializing dates to strings', async () => {
    prismaMock.property.findMany.mockResolvedValue([
      {
        id: 'p1',
        title: 'Villa',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as never);

    const req = new NextRequest('http://test/api/properties?txn=Vente&city=Dakar');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(typeof json.items[0].createdAt).toBe('string');
  });
});
