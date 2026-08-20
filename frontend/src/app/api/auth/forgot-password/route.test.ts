// AUTH-07 — POST /api/auth/forgot-password tests.
import { prismaMock } from '@/test-utils/prisma-mock';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// CR-01 — keep timing-floor short during tests so each call doesn't pad ~350ms.
process.env.AUTH_FORGOT_TARGET_LATENCY_MS = '0';

const mockEnqueue = vi.fn().mockResolvedValue('job-1');
const mockDrainOne = vi.fn().mockResolvedValue(true);
vi.mock('@/lib/server/queues/email-queue-singleton', () => ({
  getEmailQueue: vi.fn(() => ({ enqueue: mockEnqueue, drainOne: mockDrainOne })),
}));
vi.mock('@/lib/server/auth/dummy-bcrypt', () => ({
  dummyBcryptCompare: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from './route';
import { dummyBcryptCompare } from '@/lib/server/auth/dummy-bcrypt';

function makeReq(body: unknown): NextRequest {
  return body === undefined
    ? new NextRequest('http://test/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    : new NextRequest('http://test/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation((cb: unknown) => {
    if (typeof cb === 'function') {
      return (cb as (tx: typeof prismaMock) => unknown)(prismaMock) as Promise<unknown>;
    }
    return Promise.resolve(cb);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('issues a PASSWORD_RESET code + outbox event when the user exists (and runs dummy bcrypt for timing parity)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'u1' } as never);
    prismaMock.verificationCode.create.mockResolvedValue({} as never);

    const res = await POST(makeReq({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    // CR-01 — dummy bcrypt is run on BOTH branches for timing parity.
    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);

    expect(prismaMock.verificationCode.create).toHaveBeenCalledTimes(1);
    const codeArg = prismaMock.verificationCode.create.mock.calls[0]?.[0];
    expect(codeArg?.data?.type).toBe('PASSWORD_RESET');
    expect(codeArg?.data?.userId).toBe('u1');

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    const enqueueArg = mockEnqueue.mock.calls[0]?.[0];
    expect(enqueueArg?.to).toBe('a@b.com');
    expect(mockDrainOne).toHaveBeenCalledTimes(1);
  });

  it('returns identical 200 + dummy-bcrypts when the user does NOT exist (D-23)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const res = await POST(makeReq({ email: 'unknown@example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    expect(dummyBcryptCompare).toHaveBeenCalledTimes(1);
    expect(prismaMock.verificationCode.create).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('returns 429 TOO_MANY_FORGOT_ATTEMPTS after exceeding 3/h', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const calls = await Promise.all(
      Array.from({ length: 4 }, () => POST(makeReq({ email: 'rl-forgot@example.com' }))),
    );
    const limited = calls.find((r) => r.status === 429)!;
    expect(limited).toBeTruthy();
    const body = await limited.json();
    expect(body.error).toBe('TOO_MANY_FORGOT_ATTEMPTS');
  });

  it('returns VALIDATION_FAILED when email is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('VALIDATION_FAILED');
  });
});
