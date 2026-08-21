// Coverage for GET/POST /api/property-requests.
//
// Unlike POST /api/properties, this route hard-requires auth (requireAuth,
// not optionalAuth) and has no listing-quota check — publishing a demande
// is free and unlimited (see design doc).
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
import { GET, POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/property-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  txn: 'Location',
  type: 'Appartement',
  city: 'Dakar',
  quartier: 'Sacré-Cœur',
  budgetMax: 150_000,
  bedsMin: 2,
  message: 'Je cherche un 3 pièces meublé.',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({
    user: { sub: 'user-1', email: 'me@example.com' },
  } as never);
});

describe('POST /api/property-requests', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(prismaMock.propertyRequest.create).not.toHaveBeenCalled();
  });

  it('unauthenticated request returns the requireAuth 401 response', async () => {
    const authResponse = NextResponse.json({ error: 'Missing token' }, { status: 401 });
    mockRequireAuth.mockResolvedValueOnce(authResponse as never);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.propertyRequest.create).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ txn: 'Vente' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('valid body creates a request scoped to the authenticated user', async () => {
    prismaMock.propertyRequest.create.mockResolvedValue({ id: 'pr-1' } as never);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('pr-1');
    expect(prismaMock.propertyRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', budgetMax: 150_000 }),
      }),
    );
  });
});

describe('GET /api/property-requests', () => {
  it('lists active requests, serializing dates to strings', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([
      {
        id: 'pr-1',
        txn: 'Location',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ] as never);

    const req = new NextRequest('http://test/api/property-requests?txn=Location&city=Dakar');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(typeof json.items[0].createdAt).toBe('string');
  });

  it('ignores an invalid type query param instead of erroring', async () => {
    prismaMock.propertyRequest.findMany.mockResolvedValue([]);
    const req = new NextRequest('http://test/api/property-requests?type=Chateau');
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(prismaMock.propertyRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ type: 'Chateau' }) }),
    );
  });
});
