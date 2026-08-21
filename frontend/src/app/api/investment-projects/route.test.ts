// Coverage for POST /api/investment-projects, modeled on
// properties/route.test.ts. Unlike Property, there's no listing quota —
// publishing an investment project is free and unlimited (see the design
// spec) — so these tests only cover CSRF, auth, and validation, not a
// quota race.
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
import { POST } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);

function makePost(body: unknown): NextRequest {
  return new NextRequest('http://test/api/investment-projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: "Les Jardins d'Almadies",
  description: 'Un programme résidentiel haut de gamme aux Almadies avec 48 lots viabilisés.',
  type: 'Résidentiel',
  city: 'Dakar',
  quartier: 'Almadies',
  priceFrom: 32_000_000,
  lotsLabel: '48 lots',
  status: 'En cours',
  images: ['https://res.cloudinary.com/demo/image/upload/v1/project.jpg'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } } as never);
});

describe('POST /api/investment-projects', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(403);
    expect(prismaMock.investmentProject.create).not.toHaveBeenCalled();
  });

  it('unauthenticated request returns the requireAuth 401 response', async () => {
    const authResponse = NextResponse.json({ error: 'Missing token' }, { status: 401 });
    mockRequireAuth.mockResolvedValueOnce(authResponse as never);

    const res = await POST(makePost(validBody));
    expect(res.status).toBe(401);
    expect(prismaMock.investmentProject.create).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const res = await POST(makePost({ title: 'x' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('missing images returns 400 VALIDATION_FAILED (at least one required)', async () => {
    const res = await POST(makePost({ ...validBody, images: [] }));
    expect(res.status).toBe(400);
  });

  it('happy path: creates the project owned by the authenticated user', async () => {
    prismaMock.investmentProject.create.mockResolvedValue({ id: 'proj-1' } as never);

    const res = await POST(makePost(validBody));

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('proj-1');
    expect(prismaMock.investmentProject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerId: 'user-1', title: validBody.title }),
      }),
    );
  });
});
