// Coverage for POST /api/investment-projects/[id]/interests, modeled
// directly on properties/[id]/visit-requests/route.test.ts — same
// public/no-CSRF rationale, same IP-rate-limit mechanism.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/investment-projects', () => ({
  getInvestmentProjectById: vi.fn(),
}));

vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn(async () => undefined),
}));

import { getInvestmentProjectById } from '@/lib/server/investment-projects';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';

const mockGetById = vi.mocked(getInvestmentProjectById);
const mockCreateNotification = vi.mocked(createNotification);

const project = { id: 'proj-1', ownerId: 'owner-1', title: "Les Jardins d'Almadies" } as never;

function makeReq(
  ip: string,
  body: unknown = { name: 'Fatou Diop', phone: '+221771234567' },
): NextRequest {
  return new NextRequest('http://test/api/investment-projects/proj-1/interests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: 'proj-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetById.mockResolvedValue(project);
  prismaMock.investmentInterest.create.mockResolvedValue({ id: 'int-1' } as never);
});

describe('POST /api/investment-projects/[id]/interests', () => {
  it('happy path: creates the interest and notifies the owner', async () => {
    const res = await POST(makeReq('203.0.113.10'), ctx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ id: 'int-1' });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'owner-1',
        type: 'INVESTMENT_INTEREST_RECEIVED',
        dedupeKey: 'investment-interest-received:int-1',
        data: {
          projectId: 'proj-1',
          interestId: 'int-1',
          requesterName: 'Fatou Diop',
          requesterPhone: '+221771234567',
        },
      }),
    );
  });

  it('project not found returns 404 before touching the DB', async () => {
    mockGetById.mockResolvedValue(null);
    const res = await POST(makeReq('203.0.113.11'), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.investmentInterest.create).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const res = await POST(makeReq('203.0.113.12', { name: 'x', phone: '1' }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('trips TOO_MANY_INVESTMENT_INTERESTS after the per-IP hourly cap', async () => {
    const ip = '203.0.113.99';
    const max = Number(process.env.INVESTMENT_INTEREST_RATE_LIMIT_MAX ?? 10);

    for (let i = 0; i < max; i++) {
      const res = await POST(makeReq(ip), ctx());
      expect(res.status).toBe(201);
    }

    const blocked = await POST(makeReq(ip), ctx());
    expect(blocked.status).toBe(429);
    const json = await blocked.json();
    expect(json.error).toBe('TOO_MANY_INVESTMENT_INTERESTS');
  });

  it('a different IP is not affected by another IP exhausting its bucket', async () => {
    const exhausted = '203.0.113.50';
    const max = Number(process.env.INVESTMENT_INTEREST_RATE_LIMIT_MAX ?? 10);
    for (let i = 0; i < max + 1; i++) {
      await POST(makeReq(exhausted), ctx());
    }

    const res = await POST(makeReq('203.0.113.51'), ctx());
    expect(res.status).toBe(201);
  });
});
