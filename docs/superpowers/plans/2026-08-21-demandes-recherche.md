# Demandes de recherche immobilière Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in individual publish a public "search request" (what property they're looking for) so agencies/owners can contact them directly — the inverse of the existing `Property` listing flow.

**Architecture:** A new `PropertyRequest` Prisma model, symmetric to `Property`. Public `GET`/owner-scoped `POST` route at `/api/property-requests`, owner-only `PATCH`/`DELETE` at `/api/property-requests/[id]`. A public `/demandes` list page (Server Component, direct Prisma read — same pattern as `/agences`), a `/demandes/nouvelle` publish form (client component, mirrors `/annonces/nouvelle`), and a "Mes demandes" section on the dashboard.

**Tech Stack:** Next.js 16 App Router, Prisma 5, Zod, Vitest + `vitest-mock-extended` (`prismaMock`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-21-demandes-recherche-design.md`

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'`.
- Every mutating route calls `verifyCsrf(req)` first, then the appropriate auth guard, before touching the body.
- `POST /api/property-requests` uses `requireAuth` (not `optionalAuth`) — publishing a demande always requires a session, no anonymous fallback, no listing-quota check.
- `PATCH`/`DELETE /api/property-requests/[id]` scope the lookup by `userId: auth.user.sub` and return **404** (not 403) on a non-owner/missing row — same convention as `PATCH`/`DELETE /api/properties/[id]`.
- Money (`budgetMax`) is an integer FCFA amount, no decimals — same convention as `Property.price`.
- `GET /api/property-requests` (the public JSON API) never returns the requester's phone — only the Server Component page (`listPropertyRequestsWithContact`) does. Same PII-safety split as `getPropertyById` vs `getPropertyWithOwnerById` in `lib/server/properties.ts`.
- TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — optional interface fields are written `field?: T | undefined`, matching the existing `PropertyFilter` interface.
- No admin moderation — matches `Property`'s current unmoderated state, not a gap introduced by this feature.
- Before the final commit: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` must all pass.

---

### Task 1: Prisma schema — `PropertyRequest` model + migration

**Files:**
- Modify: `frontend/prisma/schema.prisma`
- Creates (via CLI, not hand-written): `frontend/prisma/migrations/<timestamp>_property_requests/migration.sql`

**Interfaces:**
- Produces: Prisma model `PropertyRequest` with fields `id, userId, txn, type, city, quartier, budgetMax, bedsMin, message, status, createdAt, updatedAt`, accessible in code as `prisma.propertyRequest`. `status` values: `ACTIVE | FULFILLED | ARCHIVED`. `txn` values: `Vente | Location`. `type` values: `Villa | Appartement | Terrain | Bureau | Peu importe`.

- [ ] **Step 1: Add the model to `frontend/prisma/schema.prisma`**

Insert this new model after the `Withdrawal` model (end of file), and add the inverse relation on `User`.

```prisma
// ───────────────────────────────────────────────────────────────────────
// "Demande de recherche" — the inverse of Property: a particulier expresses
// what they're looking for instead of listing a bien they own. Public,
// free, unlimited (no Subscription quota check — see
// docs/superpowers/specs/2026-08-21-demandes-recherche-design.md).
// `budgetMax` is FCFA (XOF), no decimals, same convention as Property.price.
// ───────────────────────────────────────────────────────────────────────
model PropertyRequest {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  txn       String // Vente | Location
  type      String // Villa | Appartement | Terrain | Bureau | Peu importe
  city      String
  quartier  String   @default("") // optional — a search can be city-wide
  budgetMax Int // FCFA, upper bound of the searcher's budget
  bedsMin   Int      @default(0)
  message   String   @default("")
  status    String   @default("ACTIVE") // ACTIVE | FULFILLED | ARCHIVED
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([txn, status])
  @@index([city])
  @@index([userId])
}
```

On the `User` model, add to the relations block (next to `properties Property[]`):

```prisma
  propertyRequests  PropertyRequest[]
```

- [ ] **Step 2: Generate and apply the migration**

Run from the repo root (uses `--filter` + `exec` so the `--name` flag reaches Prisma unambiguously, rather than relying on `pnpm run` argument forwarding):

```bash
pnpm --filter frontend exec prisma migrate dev --name property_requests
```

Expected: Prisma prints `Your database is now in sync with your schema` and a new folder appears under `frontend/prisma/migrations/`. This also regenerates the Prisma client, so `prisma.propertyRequest` becomes available.

- [ ] **Step 3: Verify the client picked up the new model**

Run: `pnpm typecheck` (from the repo root)
Expected: PASS — no errors mentioning `propertyRequest` or `PropertyRequest` (the type now exists — later tasks will actually use it).

- [ ] **Step 4: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(db): add PropertyRequest model for search-request listings"
```

---

### Task 2: `lib/server/property-requests.ts`

**Files:**
- Create: `frontend/src/lib/server/property-requests.ts`

**Interfaces:**
- Consumes: `prisma.propertyRequest` (Task 1), `prisma` from `./prisma`.
- Produces (consumed by Tasks 3, 4, 5, 7):
  - `interface PropertyRequestFilter { txn?: 'Vente' | 'Location' | undefined; city?: string | undefined; type?: string | undefined }`
  - `interface PropertyRequestInput { txn: 'Vente' | 'Location'; type: string; city: string; quartier?: string | undefined; budgetMax: number; bedsMin: number; message?: string | undefined }`
  - `listPropertyRequests(filter?: PropertyRequestFilter): Promise<PropertyRequest[]>`
  - `listPropertyRequestsWithContact(filter?: PropertyRequestFilter): Promise<(PropertyRequest & { user: { phone: string | null } })[]>`
  - `listPropertyRequestsByOwner(userId: string): Promise<PropertyRequest[]>`
  - `createPropertyRequest(userId: string, data: PropertyRequestInput): Promise<{ id: string }>`
  - `serializePropertyRequest(r: PropertyRequest): Omit<PropertyRequest, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }`

This is a straightforward Prisma-wrapper module (mirrors `lib/server/properties.ts`) with no branching logic worth unit-testing in isolation — it's exercised through the route tests in Tasks 3–4 (which mock `prisma` directly, same convention as `properties/route.test.ts`).

- [ ] **Step 1: Write the file**

```typescript
// ImmoLink Sénégal — "demandes de recherche". Symmetric to
// src/lib/server/properties.ts but for the opposite side of the market: a
// particulier expresses what they're looking for instead of listing a bien
// they own. See docs/superpowers/specs/2026-08-21-demandes-recherche-design.md.
import 'server-only';
import type { PropertyRequest } from '@prisma/client';
import { prisma } from './prisma';

export interface PropertyRequestFilter {
  txn?: 'Vente' | 'Location' | undefined;
  city?: string | undefined;
  type?: string | undefined;
}

export interface PropertyRequestInput {
  txn: 'Vente' | 'Location';
  type: string;
  city: string;
  quartier?: string | undefined;
  budgetMax: number;
  bedsMin: number;
  message?: string | undefined;
}

function whereFor(filter: PropertyRequestFilter) {
  const { txn, city, type } = filter;
  return {
    status: 'ACTIVE' as const,
    ...(txn ? { txn } : {}),
    ...(city ? { city } : {}),
    ...(type ? { type } : {}),
  };
}

/** Public listing — no requester contact info. Used by GET /api/property-requests. */
export async function listPropertyRequests(
  filter: PropertyRequestFilter = {},
): Promise<PropertyRequest[]> {
  return prisma.propertyRequest.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Same rows as listPropertyRequests, plus the requester's contact phone —
 * shown publicly on /demandes so an agency/owner can reach them directly.
 * Kept separate so GET /api/property-requests (a scrapable public JSON API)
 * never leaks the phone — same split as getPropertyWithOwnerById vs
 * getPropertyById in properties.ts.
 */
export async function listPropertyRequestsWithContact(
  filter: PropertyRequestFilter = {},
): Promise<(PropertyRequest & { user: { phone: string | null } })[]> {
  return prisma.propertyRequest.findMany({
    where: whereFor(filter),
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { phone: true } } },
  });
}

export async function listPropertyRequestsByOwner(userId: string): Promise<PropertyRequest[]> {
  return prisma.propertyRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPropertyRequest(
  userId: string,
  data: PropertyRequestInput,
): Promise<{ id: string }> {
  return prisma.propertyRequest.create({
    data: {
      userId,
      txn: data.txn,
      type: data.type,
      city: data.city,
      quartier: data.quartier?.trim() || '',
      budgetMax: data.budgetMax,
      bedsMin: data.bedsMin,
      message: data.message?.trim() || '',
    },
    select: { id: true },
  });
}

export function serializePropertyRequest(
  r: PropertyRequest,
): Omit<PropertyRequest, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string } {
  return { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS, no errors in `property-requests.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/server/property-requests.ts
git commit -m "feat(property-requests): add server-side query/mutation helpers"
```

---

### Task 3: `GET`/`POST /api/property-requests`

**Files:**
- Create: `frontend/src/app/api/property-requests/route.ts`
- Test: `frontend/src/app/api/property-requests/route.test.ts`

**Interfaces:**
- Consumes: `verifyCsrf` (`@/lib/server/auth`), `requireAuth` (`@/lib/server/middleware`), `listPropertyRequests` / `createPropertyRequest` / `serializePropertyRequest` (Task 2), `makeRequestContext` / `withRequestContext` (`@/lib/server/observability/request-context`).
- Produces: `GET` returns `{ items: SerializedPropertyRequest[] }`. `POST` returns `{ id: string }` (201) or `{ error, message, issues? }` (400/401/403).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/property-requests/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/property-requests/route.test.ts`
Expected: FAIL — `./route` has no exported `GET`/`POST` (file doesn't exist yet).

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/property-requests/route.ts`:

```typescript
// GET /api/property-requests — public listing of active search requests.
// POST /api/property-requests — publish a new search request ("Publier une demande").
//
// GET: query params txn (Vente|Location), city, type. No auth required.
// Does NOT include the requester's phone — see listPropertyRequestsWithContact
// in lib/server/property-requests.ts for the page that does.
//
// POST: verifyCsrf → requireAuth (hard requirement, unlike optionalAuth on
// POST /api/properties — no anonymous fallback for demandes) → Zod validate
// → insert. No listing-quota check: publishing a demande is free and
// unlimited (see design doc).
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import {
  listPropertyRequests,
  createPropertyRequest,
  serializePropertyRequest,
} from '@/lib/server/property-requests';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const url = req.nextUrl;
    const txnParam = url.searchParams.get('txn');
    const txn = txnParam === 'Vente' || txnParam === 'Location' ? txnParam : undefined;
    const city = url.searchParams.get('city') ?? undefined;
    const typeParam = url.searchParams.get('type');
    const type = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'].includes(
      typeParam ?? '',
    )
      ? (typeParam ?? undefined)
      : undefined;

    const rows = await listPropertyRequests({ txn, city, type });

    return NextResponse.json(
      { items: rows.map(serializePropertyRequest) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({
  txn: z.enum(['Vente', 'Location']),
  type: z.enum(['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().max(60).optional(),
  budgetMax: z.number().int().positive(),
  bedsMin: z.number().int().min(0).max(20).default(0),
  message: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const result = await createPropertyRequest(auth.user.sub, parsed.data);

    return NextResponse.json(
      { id: result.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/property-requests/route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/property-requests/route.ts frontend/src/app/api/property-requests/route.test.ts
git commit -m "feat(api): add GET/POST /api/property-requests"
```

---

### Task 4: `PATCH`/`DELETE /api/property-requests/[id]`

**Files:**
- Create: `frontend/src/app/api/property-requests/[id]/route.ts`
- Test: `frontend/src/app/api/property-requests/[id]/route.test.ts`

**Interfaces:**
- Consumes: `verifyCsrf`, `requireAuth`, `prisma` (direct — same pattern as `properties/[id]/route.ts`, no lib wrapper needed for a two-line ownership check + update/delete).
- Produces: `PATCH` returns `{ id: string }` (200) given `{ status: 'FULFILLED' | 'ARCHIVED' }`. `DELETE` returns `{ ok: true }` (200). Both return 404 `NOT_FOUND` for a missing/non-owned row.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/property-requests/[id]/route.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/property-requests/[id]/route.test.ts`
Expected: FAIL — `./route` has no exported `PATCH`/`DELETE`.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/property-requests/[id]/route.ts`:

```typescript
// PATCH /api/property-requests/[id] — owner-only: mark FULFILLED or ARCHIVED.
// DELETE /api/property-requests/[id] — owner-only: delete.
// Both require verifyCsrf + requireAuth, then scope the lookup by
// `userId: auth.user.sub` and return 404 (not 403) on a mismatch — same
// convention as PATCH/DELETE /api/properties/[id].
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const StatusBody = z.object({ status: z.enum(['FULFILLED', 'ARCHIVED']) });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const existing = await prisma.propertyRequest.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property request not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const parsed = StatusBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'VALIDATION_FAILED',
          message: 'Invalid request body',
          issues: parsed.error.issues,
        },
        { status: 400, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    const updated = await prisma.propertyRequest.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true },
    });

    return NextResponse.json(
      { id: updated.id },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const csrfFail = verifyCsrf(req);
    if (csrfFail) return csrfFail;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const existing = await prisma.propertyRequest.findFirst({
      where: { id, userId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Property request not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.propertyRequest.delete({ where: { id } });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/property-requests/[id]/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/property-requests/[id]/route.ts" "frontend/src/app/api/property-requests/[id]/route.test.ts"
git commit -m "feat(api): add PATCH/DELETE /api/property-requests/[id]"
```

---

### Task 5: Public list page `/demandes`

**Files:**
- Create: `frontend/src/app/demandes/page.tsx`

**Interfaces:**
- Consumes: `listPropertyRequestsWithContact` (Task 2), `formatFcfa` / `txnTextClass` (`@/lib/mock/immolink`, already exist).
- Produces: page reachable at `/demandes`, linked from Task 8 (header nav) and Task 6 (breadcrumb).

- [ ] **Step 1: Write the page**

Create `frontend/src/app/demandes/page.tsx`:

```tsx
// /demandes — public list of "demandes de recherche" (particuliers looking
// for a property — the inverse of /recherche's Property listings). Contact
// phone comes from listPropertyRequestsWithContact — deliberately NOT
// exposed via GET /api/property-requests (see lib/server/property-requests.ts).
import type { Metadata } from 'next';
import Link from 'next/link';
import { listPropertyRequestsWithContact } from '@/lib/server/property-requests';
import { formatFcfa, txnTextClass } from '@/lib/mock/immolink';

export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Demandes de recherche immobilière au Sénégal',
  description:
    'Particuliers à la recherche d’un bien à Dakar et partout au Sénégal — consultez leurs demandes et contactez-les directement si vous avez le bien qu’ils cherchent.',
  alternates: { canonical: '/demandes' },
};

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'] as const;

export default async function DemandesPage({
  searchParams,
}: {
  searchParams: Promise<{ txn?: string; city?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const txn = sp.txn === 'Vente' || sp.txn === 'Location' ? sp.txn : undefined;
  const city = sp.city?.trim() || undefined;
  const type =
    sp.type && (TYPES as readonly string[]).includes(sp.type) ? sp.type : undefined;

  const requests = await listPropertyRequestsWithContact({ txn, city, type });

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Demandes de recherche
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Particuliers
          </div>
          <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
            Demandes de recherche
          </h1>
          <p className="text-[15px] text-brand-muted2">
            {requests.length} personne{requests.length > 1 ? 's' : ''} cherchent actuellement un
            bien sur ImmoLink.
          </p>
        </div>
        <Link
          href="/demandes/nouvelle"
          className="im-tap cursor-pointer self-start rounded-full bg-brand-green px-5.5 py-2.75 text-sm font-bold text-brand-cream"
        >
          + Publier une demande
        </Link>
      </div>

      <form className="mb-7 flex flex-wrap gap-3 rounded-2xl border border-brand-green/8 bg-white p-4">
        <select
          name="txn"
          defaultValue={txn ?? ''}
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        >
          <option value="">Achat ou location</option>
          <option value="Vente">Achat</option>
          <option value="Location">Location</option>
        </select>
        <select
          name="type"
          defaultValue={type ?? ''}
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        >
          <option value="">Tous types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          name="city"
          defaultValue={city ?? ''}
          placeholder="Ville"
          className="rounded-xl border border-brand-green/15 px-3.5 py-2.5 text-sm font-semibold text-brand-slate"
        />
        <button
          type="submit"
          className="im-tap cursor-pointer rounded-xl bg-brand-green-dark px-5 py-2.5 text-sm font-bold text-brand-cream"
        >
          Filtrer
        </button>
      </form>

      {requests.length === 0 ? (
        <p className="text-sm text-brand-muted2">Aucune demande pour le moment.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((r) => {
            const message = `Bonjour, j’ai peut-être un bien qui correspond à votre recherche « ${r.type} — ${r.city} » sur ImmoLink.`;
            const whatsappHref = r.user.phone
              ? `https://wa.me/${r.user.phone.replace('+', '')}?text=${encodeURIComponent(message)}`
              : null;
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-2xl border border-brand-green/8 bg-white p-5"
              >
                <span className={`text-[13px] font-bold ${txnTextClass(r.txn)}`}>
                  {r.txn === 'Vente' ? 'Recherche à acheter' : 'Recherche à louer'} · {r.type}
                </span>
                <div className="text-[15.5px] font-extrabold text-brand-ink">
                  📍 {r.quartier ? `${r.quartier}, ` : ''}
                  {r.city}
                </div>
                <div className="text-[14px] font-semibold text-brand-muted2">
                  Budget max : {formatFcfa(r.budgetMax)} FCFA
                  {r.txn === 'Location' ? '/mois' : ''}
                  {r.bedsMin > 0 ? ` · ${r.bedsMin}+ chambres` : ''}
                </div>
                {r.message && (
                  <p className="text-[13.5px] leading-relaxed text-brand-slate">{r.message}</p>
                )}
                <div className="mt-1 flex gap-2.5">
                  {r.user.phone ? (
                    <>
                      <a
                        href={`tel:${r.user.phone}`}
                        className="im-tap flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-green py-2.75 text-[13.5px] font-bold text-brand-cream"
                      >
                        📞 Appeler
                      </a>
                      {whatsappHref && (
                        <a
                          href={whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="im-tap flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-green/20 py-2.75 text-[13.5px] font-bold text-brand-green"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] font-medium text-brand-muted2">
                      Aucun contact disponible.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check with the dev server**

Run: `pnpm dev` (from repo root), then open `http://localhost:3000/demandes`.
Expected: page renders with the empty state ("Aucune demande pour le moment.") since no rows exist yet — confirms no runtime error. Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/demandes/page.tsx
git commit -m "feat(demandes): add public /demandes list page"
```

---

### Task 6: Publish form `/demandes/nouvelle`

**Files:**
- Create: `frontend/src/app/demandes/nouvelle/page.tsx`

**Interfaces:**
- Consumes: `useAuth` (`@/contexts/AuthContext`), `useToast` (`@/contexts/ToastContext`), `api`/`ApiError` (`@/lib/api`), `POST /api/property-requests` (Task 3).
- Produces: page reachable at `/demandes/nouvelle`, linked from Task 5's CTA and Task 7's dashboard section.

- [ ] **Step 1: Write the page**

Create `frontend/src/app/demandes/nouvelle/page.tsx`:

```tsx
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const TYPES = ['Villa', 'Appartement', 'Terrain', 'Bureau', 'Peu importe'] as const;

export default function NewPropertyRequestPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [txn, setTxn] = useState<'Vente' | 'Location'>('Location');
  const [type, setType] = useState<(typeof TYPES)[number]>('Appartement');
  const [city, setCity] = useState('Dakar');
  const [quartier, setQuartier] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [bedsMin, setBedsMin] = useState('0');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api('/api/property-requests', {
        method: 'POST',
        body: {
          txn,
          type,
          city,
          ...(quartier.trim() ? { quartier: quartier.trim() } : {}),
          budgetMax: Number(budgetMax),
          bedsMin: Number(bedsMin),
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast('Demande publiée avec succès.');
      router.push('/demandes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="mx-auto flex min-h-100 max-w-2xl items-center justify-center px-4">
        <p className="text-sm text-brand-muted2">Chargement…</p>
      </main>
    );
  }

  const budgetLabel = txn === 'Location' ? 'Budget mensuel max (FCFA)' : 'Budget max (FCFA)';

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/demandes" className="text-brand-muted hover:text-brand-red">
          Demandes de recherche
        </Link>{' '}
        / Nouvelle demande
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Publier une demande</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Décris ce que tu cherches — les agences et propriétaires pourront te contacter
        directement.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          {(['Vente', 'Location'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTxn(t)}
              className={`cursor-pointer rounded-xl border py-3 text-sm font-bold ${
                txn === t
                  ? 'border-brand-green bg-brand-green text-brand-cream'
                  : 'border-brand-green/15 bg-white text-brand-slate'
              }`}
            >
              {t === 'Vente' ? 'Je veux acheter' : 'Je veux louer'}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de bien recherché
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Ville
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Quartier (optionnel)
            <input
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              placeholder="Les Almadies"
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          {budgetLabel}
          <input
            required
            type="number"
            min={1}
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
            placeholder="150000"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Chambres minimum (optionnel)
          <input
            type="number"
            min={0}
            value={bedsMin}
            onChange={(e) => setBedsMin(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Message (optionnel)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="Précise tes critères : budget, délai, quartiers acceptables…"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm font-semibold text-brand-red">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="cursor-pointer rounded-xl bg-brand-green py-3.5 text-[15px] font-bold text-brand-cream disabled:opacity-50"
        >
          {submitting ? 'Publication…' : 'Publier la demande'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check with the dev server**

Run: `pnpm dev`, log in with a test account, open `http://localhost:3000/demandes/nouvelle`, submit the form.
Expected: redirected to `/demandes`, a toast confirms publication, and the new card appears in the list with a working `tel:`/WhatsApp link (assuming the test account has a phone set in `/settings`). Also verify visiting `/demandes/nouvelle` while logged out redirects to `/login`. Stop the dev server after checking.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/demandes/nouvelle/page.tsx
git commit -m "feat(demandes): add /demandes/nouvelle publish form"
```

---

### Task 7: Dashboard "Mes demandes" section

**Files:**
- Create: `frontend/src/components/immolink/PropertyRequestActions.tsx`
- Modify: `frontend/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listPropertyRequestsByOwner`, `formatFcfa` (Task 2 / existing), `api`/`ApiError` (`@/lib/api`), `PATCH`/`DELETE /api/property-requests/[id]` (Task 4).
- Produces: `PropertyRequestActions({ requestId: string; status: string })` — client component rendering "Marquer trouvé" (only when `status === 'ACTIVE'`) and "Supprimer" buttons, calling `router.refresh()` on success (same pattern as `DeleteListingButton`).

- [ ] **Step 1: Write `PropertyRequestActions.tsx`**

Create `frontend/src/components/immolink/PropertyRequestActions.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function PropertyRequestActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function markFulfilled() {
    setPending(true);
    try {
      await api(`/api/property-requests/${requestId}`, {
        method: 'PATCH',
        body: { status: 'FULFILLED' },
      });
      toast('Demande marquée comme trouvée.');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action impossible.', 'error');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm('Supprimer définitivement cette demande ?');
    if (!confirmed) return;
    setPending(true);
    try {
      await api(`/api/property-requests/${requestId}`, { method: 'DELETE' });
      toast('Demande supprimée.');
      router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Suppression impossible.', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      {status === 'ACTIVE' && (
        <button
          type="button"
          onClick={markFulfilled}
          disabled={pending}
          className="im-tap cursor-pointer text-[13px] font-bold text-brand-green underline disabled:opacity-50"
        >
          Marquer trouvé
        </button>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="im-tap cursor-pointer text-[13px] font-bold text-brand-red underline disabled:opacity-50"
      >
        Supprimer
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Wire it into the dashboard**

In `frontend/src/app/dashboard/page.tsx`:

Change the import line:
```typescript
import { priceFmt, notificationVisual, timeAgo } from '@/lib/mock/immolink';
```
to:
```typescript
import { priceFmt, formatFcfa, notificationVisual, timeAgo } from '@/lib/mock/immolink';
```

Add two new imports next to the existing ones:
```typescript
import { listPropertyRequestsByOwner } from '@/lib/server/property-requests';
import { PropertyRequestActions } from '@/components/immolink/PropertyRequestActions';
```

Right after the line `const rows = ownerId ? await listPropertiesByOwner(ownerId) : [];`, add:
```typescript
  const myRequests = ownerId ? await listPropertyRequestsByOwner(ownerId) : [];
```

Immediately after the closing `</div>` of the `grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_350px]` block (the block containing "LISTINGS TABLE" and "SIDE"), and before the final `</main>`, add:

```tsx
      {/* MES DEMANDES */}
      <div className="mt-6 overflow-hidden rounded-[20px] border border-brand-green/8 bg-white">
        <div className="flex items-center justify-between border-b border-brand-green/8 px-6 py-5">
          <h3 className="text-lg font-extrabold">Mes demandes</h3>
          <Link
            href="/demandes/nouvelle"
            className="im-tap text-[13px] font-bold text-brand-green underline"
          >
            + Nouvelle demande
          </Link>
        </div>
        {myRequests.length === 0 ? (
          <p className="px-6 py-5 text-[13px] font-medium text-brand-muted2">
            Aucune demande de recherche publiée.
          </p>
        ) : (
          myRequests.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-2 border-b border-brand-green/5 px-6 py-3.5 sm:grid sm:grid-cols-[2fr_1fr_1.3fr] sm:items-center sm:gap-0"
            >
              <div>
                <div className="text-[14.5px] font-bold">
                  {r.type} · {r.txn === 'Vente' ? 'Achat' : 'Location'}
                </div>
                <div className="text-xs font-semibold text-brand-muted">
                  {r.quartier ? `${r.quartier}, ` : ''}
                  {r.city} · budget max {formatFcfa(r.budgetMax)} FCFA
                </div>
              </div>
              <span className="rounded-full bg-brand-green/10 px-2.75 py-1 text-xs font-bold text-brand-green">
                {r.status === 'ACTIVE' ? 'Active' : r.status === 'FULFILLED' ? 'Trouvé' : 'Archivée'}
              </span>
              <PropertyRequestActions requestId={r.id} status={r.status} />
            </div>
          ))
        )}
      </div>
```

(`Link` is already imported at the top of `dashboard/page.tsx`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Manual check with the dev server**

Run: `pnpm dev`, log in with a test account that has published at least one demande (from Task 6's manual check), open `http://localhost:3000/dashboard`.
Expected: "Mes demandes" section lists it; clicking "Marquer trouvé" flips the badge to "Trouvé" and hides the button; clicking "Supprimer" (after confirming) removes the row. Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/immolink/PropertyRequestActions.tsx frontend/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): add Mes demandes section"
```

---

### Task 8: Header nav link

**Files:**
- Modify: `frontend/src/components/immolink/Header.tsx`

**Interfaces:**
- None — this only adds an entry to the existing `NAV_LINKS` array, which both the desktop nav and the mobile drawer already render via `.map()`.

- [ ] **Step 1: Add the nav entry**

In `frontend/src/components/immolink/Header.tsx`, change:

```typescript
const NAV_LINKS = [
  { label: 'Acheter', href: '/recherche?txn=vente' },
  { label: 'Louer', href: '/recherche?txn=location' },
  { label: 'Projets neufs', href: '/projets-neufs' },
  { label: 'Agences', href: '/agences' },
  { label: 'Investir', href: '/investir' },
];
```

to:

```typescript
const NAV_LINKS = [
  { label: 'Acheter', href: '/recherche?txn=vente' },
  { label: 'Louer', href: '/recherche?txn=location' },
  { label: 'Projets neufs', href: '/projets-neufs' },
  { label: 'Agences', href: '/agences' },
  { label: 'Demandes', href: '/demandes' },
  { label: 'Investir', href: '/investir' },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Manual check with the dev server**

Run: `pnpm dev`, open `http://localhost:3000/`, confirm "Demandes" appears in both the desktop nav bar and the mobile hamburger drawer (resize the viewport or use dev tools device mode), and that it links to `/demandes`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/immolink/Header.tsx
git commit -m "feat(nav): link to /demandes from the header"
```

---

### Task 9: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full pre-commit gate**

Run from the repo root:
```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm test
```
Expected: all four succeed. Pay particular attention to `runtime-enforcement.test.ts` (both new route files must export `runtime = 'nodejs'` — they do, from Tasks 3–4) and to the full Vitest suite (no regressions in `properties`/`favorites`/`dashboard`-adjacent tests from the `dashboard/page.tsx` edit in Task 7 — note `dashboard/page.tsx` itself has no existing test file, so nothing to break there, but a broken import would surface as a build/typecheck failure).

- [ ] **Step 2: Build**

Run: `pnpm build`
Expected: succeeds — this also statically renders `/demandes` (revalidate-free by default; add `export const revalidate = 60` later if traffic warrants it, matching `/agences` — not required for this plan) and catches any Server/Client Component boundary mistakes.

- [ ] **Step 3: Final commit (if the above steps touched anything, e.g. `pnpm format` reformatting)**

```bash
git add -A
git status
```
If `git status` shows changes (e.g. from `pnpm format`), commit them:
```bash
git commit -m "chore: format after property-requests feature"
```
If clean, no commit needed.
