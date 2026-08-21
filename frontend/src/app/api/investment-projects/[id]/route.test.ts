// Coverage for GET/PATCH/DELETE /api/investment-projects/[id], modeled on
// properties/[id]/route.test.ts equivalents (there is no dedicated test
// file for that route today, so this mirrors properties/route.test.ts's
// mocking style + PropertyRequest's documented 404-not-403 ownership
// convention from the demandes-recherche design).
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

vi.mock('@/lib/server/investment-projects', () => ({
  getInvestmentProjectById: vi.fn(),
  serializeInvestmentProject: (p: unknown) => p,
}));

import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { getInvestmentProjectById } from '@/lib/server/investment-projects';
import { GET, PATCH, DELETE } from './route';

const mockVerifyCsrf = vi.mocked(verifyCsrf);
const mockRequireAuth = vi.mocked(requireAuth);
const mockGetById = vi.mocked(getInvestmentProjectById);

function makeReq(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://test/api/investment-projects/proj-1', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: 'proj-1' }) };
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue({ user: { sub: 'user-1', email: 'me@example.com' } } as never);
});

describe('GET /api/investment-projects/[id]', () => {
  it('returns the project when found', async () => {
    mockGetById.mockResolvedValue({
      id: 'proj-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    } as never);

    const res = await GET(makeReq('GET'), ctx());
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockGetById.mockResolvedValue(null);
    const res = await GET(makeReq('GET'), ctx());
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/investment-projects/[id]', () => {
  it('missing CSRF token returns the verifyCsrf response', async () => {
    const csrfResponse = NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    mockVerifyCsrf.mockReturnValueOnce(csrfResponse);
    const res = await PATCH(makeReq('PATCH', validBody), ctx());
    expect(res.status).toBe(403);
  });

  it('non-owner (or non-existent) project returns 404, not 403', async () => {
    prismaMock.investmentProject.findFirst.mockResolvedValue(null);
    const res = await PATCH(makeReq('PATCH', validBody), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.investmentProject.update).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    prismaMock.investmentProject.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
    const res = await PATCH(makeReq('PATCH', { title: 'x' }), ctx());
    expect(res.status).toBe(400);
  });

  it('happy path: updates the project', async () => {
    prismaMock.investmentProject.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
    prismaMock.investmentProject.update.mockResolvedValue({ id: 'proj-1' } as never);

    const res = await PATCH(makeReq('PATCH', validBody), ctx());
    expect(res.status).toBe(200);
    expect(prismaMock.investmentProject.findFirst).toHaveBeenCalledWith({
      where: { id: 'proj-1', ownerId: 'user-1' },
      select: { id: true },
    });
  });
});

describe('DELETE /api/investment-projects/[id]', () => {
  it('non-owner (or non-existent) project returns 404', async () => {
    prismaMock.investmentProject.findFirst.mockResolvedValue(null);
    const res = await DELETE(makeReq('DELETE'), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.investmentProject.update).not.toHaveBeenCalled();
  });

  it('happy path: archives (soft-deletes) the project', async () => {
    prismaMock.investmentProject.findFirst.mockResolvedValue({ id: 'proj-1' } as never);
    prismaMock.investmentProject.update.mockResolvedValue({ id: 'proj-1' } as never);

    const res = await DELETE(makeReq('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(prismaMock.investmentProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { recordStatus: 'ARCHIVED' },
    });
  });
});
