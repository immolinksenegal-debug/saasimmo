// Coverage for POST /api/properties/[id]/visit-requests, added while
// auditing the whole ImmoLink surface.
//
// This route is deliberately public/no-CSRF (same rationale as
// /api/auth/signup — anonymous visitors browsing listings, no session to
// protect). That openness previously had NO rate limit at all: any client
// could flood a property owner's notifications and the VisitRequest table
// with unlimited POSTs. Fixed by reusing the email-limiter's IP-bucket
// fallback (see rate-limit-by-email.ts) keyed by x-forwarded-for. These
// tests pin the limit (VISIT_REQUEST_RATE_LIMIT_MAX, default 10/hour) and
// confirm normal traffic is unaffected.
import { prismaMock } from '@/test-utils/prisma-mock';
import { mockNextCookies } from '@/test-utils/mock-cookies';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

mockNextCookies();

vi.mock('@/lib/server/properties', () => ({
  getPropertyById: vi.fn(),
}));

vi.mock('@/lib/server/notifications', () => ({
  createNotification: vi.fn(async () => undefined),
}));

import { getPropertyById } from '@/lib/server/properties';
import { createNotification } from '@/lib/server/notifications';
import { POST } from './route';

const mockGetPropertyById = vi.mocked(getPropertyById);
const mockCreateNotification = vi.mocked(createNotification);

const property = { id: 'prop-1', ownerId: 'owner-1', title: 'Villa Lumière' } as never;

function makeReq(
  ip: string,
  body: unknown = { name: 'Fatou Diop', phone: '+221771234567' },
): NextRequest {
  return new NextRequest('http://test/api/properties/prop-1/visit-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ id: 'prop-1' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPropertyById.mockResolvedValue(property);
  prismaMock.visitRequest.create.mockResolvedValue({ id: 'vr-1' } as never);
});

describe('POST /api/properties/[id]/visit-requests', () => {
  it('happy path: creates the visit request and notifies the owner', async () => {
    const res = await POST(makeReq('203.0.113.10'), ctx());
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ id: 'vr-1' });
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('property not found returns 404 before touching the DB', async () => {
    mockGetPropertyById.mockResolvedValue(null);
    const res = await POST(makeReq('203.0.113.11'), ctx());
    expect(res.status).toBe(404);
    expect(prismaMock.visitRequest.create).not.toHaveBeenCalled();
  });

  it('invalid body returns 400 VALIDATION_FAILED', async () => {
    const res = await POST(makeReq('203.0.113.12', { name: 'x', phone: '1' }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('VALIDATION_FAILED');
  });

  it('trips TOO_MANY_VISIT_REQUESTS after the per-IP hourly cap', async () => {
    const ip = '203.0.113.99';
    const max = Number(process.env.VISIT_REQUEST_RATE_LIMIT_MAX ?? 10);

    for (let i = 0; i < max; i++) {
      const res = await POST(makeReq(ip), ctx());
      expect(res.status).toBe(201);
    }

    const blocked = await POST(makeReq(ip), ctx());
    expect(blocked.status).toBe(429);
    const json = await blocked.json();
    expect(json.error).toBe('TOO_MANY_VISIT_REQUESTS');
  });

  it('a different IP is not affected by another IP exhausting its bucket', async () => {
    const exhausted = '203.0.113.50';
    const max = Number(process.env.VISIT_REQUEST_RATE_LIMIT_MAX ?? 10);
    for (let i = 0; i < max + 1; i++) {
      await POST(makeReq(exhausted), ctx());
    }

    const res = await POST(makeReq('203.0.113.51'), ctx());
    expect(res.status).toBe(201);
  });
});
