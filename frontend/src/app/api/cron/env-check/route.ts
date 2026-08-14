// TEMPORARY diagnostic route — reports which env vars are visible at runtime
// without exposing their values. Remove once the Vercel env-var propagation
// issue is resolved.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/server/cron/auth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const fail = verifyCronSecret(req);
  if (fail) return fail;

  const keys = [
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'DATABASE_URL',
    'JWT_SECRET',
    'CRON_SECRET',
  ];

  const presence: Record<string, boolean> = {};
  for (const key of keys) {
    const v = process.env[key];
    presence[key] = !!v && v.length > 0;
  }

  return NextResponse.json({
    presence,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}

export const POST = GET;
