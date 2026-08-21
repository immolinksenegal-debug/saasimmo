# Publier un projet d'investissement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any connected user publish a real-estate investment project (a promoter's development program), replacing the hardcoded `PROGRAMS` mock on `/projets-neufs` and the homepage with real, user-published data, and let investors express interest in a project via a lead form that notifies the owner.

**Architecture:** Two new Prisma models (`InvestmentProject`, `InvestmentInterest`) mirroring the existing `Property`/`VisitRequest` pattern exactly — same server-helper/API-route/page shape, same auth middleware, same notification pipeline. No new subsystem, no quota, no moderation: publish-and-discover, consistent with how `Property` already works.

**Tech Stack:** Next.js 16 App Router (Route Handlers + Server Components), Prisma 5 + Neon (Postgres), Zod validation, Vitest + `vitest-mock-extended` for route tests, Tailwind v4 (existing `brand-*` design tokens).

## Global Constraints

- Every Route Handler MUST `export const runtime = 'nodejs'` (enforced by `runtime-enforcement.test.ts`).
- Every mutating route MUST call `verifyCsrf(req)` first, except the public lead-form POST (`interests`), which follows the same "public, pre-session, no ambient session authority" exception already established for `visit-requests`.
- Auth uses the existing HOFs from `@/lib/server/middleware` — `if (auth instanceof NextResponse) return auth;`.
- Ownership checks return **404, not 403**, on mismatch (existence isn't leaked) — matches `Property`/`PropertyRequest` convention.
- Money is an integer in FCFA (XOF), no decimals — `priceFrom` follows `Property.price`'s convention exactly.
- Notifications MUST go through `createNotification(prisma, input)` with a deterministic `dedupeKey` — never `prisma.notification.create` directly.
- No quota check, no moderation/`DRAFT` status, no financial tracking (amount raised, ticket minimum) — per the approved spec at `docs/superpowers/specs/2026-08-21-projets-investissement-design.md`.
- Follow the codebase's existing test boundary: **API routes with real logic get Vitest coverage** (auth, ownership, validation, rate-limiting, notification dispatch); pure server-helper query functions, template builders, and UI components/pages do **not** have dedicated test files in this codebase (confirmed: no `properties.test.ts`, no `templates.test.ts`, zero `*.test.tsx` anywhere) — don't invent a new convention here.

---

### Task 1: Prisma schema — `InvestmentProject` + `InvestmentInterest`

**Files:**
- Modify: `frontend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma models `InvestmentProject` (fields: `id`, `ownerId`, `title`, `description`, `type`, `city`, `quartier`, `priceFrom`, `lotsLabel`, `status`, `developerName`, `image`, `image2`, `image3`, `recordStatus`, `createdAt`, `updatedAt`) and `InvestmentInterest` (fields: `id`, `projectId`, `name`, `phone`, `message`, `status`, `createdAt`). Every later task's Prisma calls (`prisma.investmentProject.*`, `prisma.investmentInterest.*`) depend on these existing in the generated client.

- [ ] **Step 1: Add the `User` back-relation**

In `frontend/prisma/schema.prisma`, find this block inside `model User`:

```prisma
  properties        Property[]
  favorites         Favorite[]
  subscription      Subscription?
```

Replace it with:

```prisma
  properties        Property[]
  favorites         Favorite[]
  subscription      Subscription?
  investmentProjects InvestmentProject[]
```

- [ ] **Step 2: Append the two new models**

Find the end of `model Withdrawal` (the last model in the file):

```prisma
  @@index([userId, requestedAt])
  @@index([status, requestedAt])
  @@index([provider, providerPayoutId])
}
```

Replace it with (same content, plus the two new models appended after):

```prisma
  @@index([userId, requestedAt])
  @@index([status, requestedAt])
  @@index([provider, providerPayoutId])
}

// ───────────────────────────────────────────────────────────────────────
// Projets d'investissement — publiés directement par les porteurs de
// projet (promoteurs, propriétaires de programmes neufs). Remplace le
// mock PROGRAMS de lib/mock/immolink.ts. Pas de quota, pas de modération
// admin, pas de suivi financier (montant levé, ticket minimum) — un
// marketplace publish-and-discover, comme Property.
// ───────────────────────────────────────────────────────────────────────
model InvestmentProject {
  id            String   @id @default(cuid())
  ownerId       String
  owner         User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  title         String
  description   String
  type          String // Résidentiel | Terrain | Bureau | Mixte
  city          String
  quartier      String
  priceFrom     Int // FCFA, "à partir de"
  lotsLabel     String // texte libre : "48 lots", "120 appartements"
  status        String   @default("En cours") // texte libre : "En cours" | "Sur plan" | "Livré"
  developerName String? // nom public du projet/promoteur, distinct du nom du compte
  image         String
  image2        String?
  image3        String?
  recordStatus  String   @default("ACTIVE") // ACTIVE | ARCHIVED
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  interests InvestmentInterest[]

  @@index([city])
  @@index([ownerId])
  @@index([recordStatus, createdAt])
}

model InvestmentInterest {
  id        String            @id @default(cuid())
  projectId String
  project   InvestmentProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  phone     String
  message   String?
  status    String            @default("PENDING") // PENDING | CONTACTED | DONE
  createdAt DateTime          @default(now())

  @@index([projectId, createdAt])
}
```

- [ ] **Step 3: Format, migrate, and regenerate the client**

Run, from the repo root:

```bash
pnpm --filter frontend exec prisma format
pnpm db:migrate:dev --name add_investment_projects
```

This creates a new folder under `frontend/prisma/migrations/`, applies it to the dev database, and regenerates `@prisma/client` (so `prisma.investmentProject` / `prisma.investmentInterest` exist on the client used by every later task).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (no errors — this step only added types, nothing consumes them yet).

- [ ] **Step 5: Commit**

```bash
git add frontend/prisma/schema.prisma frontend/prisma/migrations
git commit -m "feat(db): add InvestmentProject and InvestmentInterest models"
```

---

### Task 2: Server helpers — `frontend/src/lib/server/investment-projects.ts`

**Files:**
- Create: `frontend/src/lib/server/investment-projects.ts`

**Interfaces:**
- Consumes: `prisma` from `./prisma`; `InvestmentProject` type from `@prisma/client` (Task 1).
- Produces: `listInvestmentProjects(filter?: { city?: string; take?: number }): Promise<InvestmentProject[]>`, `getInvestmentProjectById(id: string): Promise<InvestmentProject | null>`, `getInvestmentProjectWithOwnerById(id: string): Promise<(InvestmentProject & { owner: { email: string; phone: string | null } }) | null>`, `listInvestmentProjectsByOwner(ownerId: string): Promise<InvestmentProject[]>`, `serializeInvestmentProject(p: InvestmentProject): <same shape with createdAt/updatedAt as strings>`. Tasks 4–13 all import from this file.

- [ ] **Step 1: Create the file**

```typescript
import 'server-only';
import type { InvestmentProject } from '@prisma/client';
import { prisma } from './prisma';

export interface InvestmentProjectFilter {
  city?: string | undefined;
  take?: number | undefined;
}

export async function listInvestmentProjects(
  filter: InvestmentProjectFilter = {},
): Promise<InvestmentProject[]> {
  const { city, take } = filter;
  return prisma.investmentProject.findMany({
    where: {
      recordStatus: 'ACTIVE',
      ...(city ? { city } : {}),
    },
    orderBy: { createdAt: 'desc' },
    ...(take ? { take } : {}),
  });
}

export async function getInvestmentProjectById(id: string): Promise<InvestmentProject | null> {
  return prisma.investmentProject.findFirst({ where: { id, recordStatus: 'ACTIVE' } });
}

export interface ProjectOwnerContact {
  email: string;
  /** E.164, or null if the owner hasn't set one in Settings. */
  phone: string | null;
}

/**
 * Same lookup as `getInvestmentProjectById`, plus the owner's contact info —
 * shown publicly on `/projets-neufs/[id]` so visitors can reach the owner
 * directly (call/WhatsApp/email). Kept separate so a public JSON API
 * wouldn't leak owner PII to scrapers (mirrors `getPropertyWithOwnerById`).
 */
export async function getInvestmentProjectWithOwnerById(
  id: string,
): Promise<(InvestmentProject & { owner: ProjectOwnerContact }) | null> {
  return prisma.investmentProject.findFirst({
    where: { id, recordStatus: 'ACTIVE' },
    include: { owner: { select: { email: true, phone: true } } },
  });
}

export async function listInvestmentProjectsByOwner(ownerId: string): Promise<InvestmentProject[]> {
  return prisma.investmentProject.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });
}

export function serializeInvestmentProject(
  p: InvestmentProject,
): Omit<InvestmentProject, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
} {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/server/investment-projects.ts
git commit -m "feat(investment-projects): add server helpers"
```

---

### Task 3: Notification template + dashboard icon

**Files:**
- Modify: `frontend/src/lib/server/notifications/templates.ts`
- Modify: `frontend/src/lib/mock/immolink.ts`

**Interfaces:**
- Consumes: `CreateNotificationInput` type from `./index` (existing).
- Produces: `investmentInterestReceived(ownerId: string, interestId: string, projectId: string, projectTitle: string, requesterName: string, requesterPhone: string): CreateNotificationInput`. Task 6's `interests` route calls this.

- [ ] **Step 1: Add the template function**

In `frontend/src/lib/server/notifications/templates.ts`, append after `visitRequested`:

```typescript

/**
 * Fired when a visitor submits "Manifester mon intérêt" on an investment
 * project detail page. dedupeKey is keyed on the InvestmentInterest row id
 * (already unique), not a timestamp — each submission is a distinct real
 * event, not a retry.
 */
export function investmentInterestReceived(
  ownerId: string,
  interestId: string,
  projectId: string,
  projectTitle: string,
  requesterName: string,
  requesterPhone: string,
): CreateNotificationInput {
  return {
    userId: ownerId,
    type: 'INVESTMENT_INTEREST_RECEIVED',
    title: 'Nouveau contact investisseur',
    body: `${requesterName} (${requesterPhone}) s'intéresse à votre projet « ${projectTitle} ».`,
    data: { projectId, interestId, requesterName, requesterPhone },
    dedupeKey: `investment-interest-received:${interestId}`,
  };
}
```

- [ ] **Step 2: Add the dashboard notification icon**

In `frontend/src/lib/mock/immolink.ts`, find:

```typescript
const NOTIFICATION_VISUALS: Record<string, { icon: string; bg: string }> = {
  VISIT_REQUESTED: { icon: '📅', bg: 'bg-brand-green/10' },
  WELCOME: { icon: '👋', bg: 'bg-[#FBF3D2]' },
  PAYMENT_RECEIVED: { icon: '💳', bg: 'bg-[#FBF3D2]' },
};
```

Replace it with:

```typescript
const NOTIFICATION_VISUALS: Record<string, { icon: string; bg: string }> = {
  VISIT_REQUESTED: { icon: '📅', bg: 'bg-brand-green/10' },
  WELCOME: { icon: '👋', bg: 'bg-[#FBF3D2]' },
  PAYMENT_RECEIVED: { icon: '💳', bg: 'bg-[#FBF3D2]' },
  INVESTMENT_INTEREST_RECEIVED: { icon: '💰', bg: 'bg-[#FBF3D2]' },
};
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/server/notifications/templates.ts frontend/src/lib/mock/immolink.ts
git commit -m "feat(notifications): add investmentInterestReceived template"
```

---

### Task 4: `POST /api/investment-projects`

**Files:**
- Create: `frontend/src/app/api/investment-projects/route.ts`
- Test: `frontend/src/app/api/investment-projects/route.test.ts`

**Interfaces:**
- Consumes: `verifyCsrf` from `@/lib/server/auth`; `requireAuth` from `@/lib/server/middleware`; `prisma` from `@/lib/server/prisma`; `makeRequestContext`/`withRequestContext` from `@/lib/server/observability/request-context`.
- Produces: `POST` handler returning `{ id: string }` (201) on success. Task 9's publish page calls `POST /api/investment-projects`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/investment-projects/route.test.ts`:

```typescript
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
  title: 'Les Jardins d’Almadies',
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run src/app/api/investment-projects/route.test.ts`
Expected: FAIL — `./route` has no exported `POST` (the route file doesn't exist yet).

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/investment-projects/route.ts`:

```typescript
// POST /api/investment-projects — publish a new investment project
// ("Publier mon projet"). Auth is hard-required (unlike POST /api/properties'
// optionalAuth) — see the design spec's cadrage decision #2. No quota check
// (decision #3): publishing is free and unlimited in v1.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(2000),
  type: z.enum(['Résidentiel', 'Terrain', 'Bureau', 'Mixte']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().min(2).max(60),
  priceFrom: z.number().int().positive(),
  lotsLabel: z.string().trim().min(2).max(60),
  status: z.string().trim().min(2).max(40).optional(),
  developerName: z.string().trim().max(100).optional(),
  images: z.array(z.string().url()).min(1).max(3),
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

    const data = parsed.data;
    const image = data.images[0]!; // zod .min(1) guarantees at least one URL
    const image2 = data.images[1] ?? null;
    const image3 = data.images[2] ?? null;

    const project = await prisma.investmentProject.create({
      data: {
        ownerId: auth.user.sub,
        title: data.title,
        description: data.description,
        type: data.type,
        city: data.city,
        quartier: data.quartier,
        priceFrom: data.priceFrom,
        lotsLabel: data.lotsLabel,
        ...(data.status ? { status: data.status } : {}),
        developerName: data.developerName?.trim() || null,
        image,
        image2,
        image3,
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: project.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run src/app/api/investment-projects/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/api/investment-projects/route.ts frontend/src/app/api/investment-projects/route.test.ts
git commit -m "feat(investment-projects): add POST /api/investment-projects"
```

---

### Task 5: `GET`/`PATCH`/`DELETE /api/investment-projects/[id]`

**Files:**
- Create: `frontend/src/app/api/investment-projects/[id]/route.ts`
- Test: `frontend/src/app/api/investment-projects/[id]/route.test.ts`

**Interfaces:**
- Consumes: `getInvestmentProjectById`, `serializeInvestmentProject` from `@/lib/server/investment-projects` (Task 2); `verifyCsrf`, `requireAuth`, `prisma`.
- Produces: `GET` → `{ project: <serialized> }` or 404; `PATCH` → `{ id }` (200) or 404/400; `DELETE` → `{ ok: true }` (200, soft-archives via `recordStatus: 'ARCHIVED'`) or 404. Task 10's publish-form and Task 11's edit-form/`DeleteProjectButton` consume these.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/investment-projects/[id]/route.test.ts`:

```typescript
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
  title: 'Les Jardins d’Almadies',
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/investment-projects/[id]/route.test.ts"`
Expected: FAIL — `./route` has no exported `GET`/`PATCH`/`DELETE`.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/investment-projects/[id]/route.ts`:

```typescript
// GET /api/investment-projects/[id] — public single project fetch (also
// used client-side by the edit page to pre-fill the form + check ownership).
// PATCH/DELETE — owner-only ("Mes projets"). Both require verifyCsrf +
// requireAuth, then scope the lookup by `ownerId: auth.user.sub` and return
// 404 (not 403) on a mismatch so a project's existence isn't leaked.
// DELETE soft-deletes (recordStatus: ARCHIVED) so existing InvestmentInterest
// leads aren't orphaned.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyCsrf } from '@/lib/server/auth';
import { requireAuth } from '@/lib/server/middleware';
import { prisma } from '@/lib/server/prisma';
import {
  getInvestmentProjectById,
  serializeInvestmentProject,
} from '@/lib/server/investment-projects';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const { id } = await params;
    const project = await getInvestmentProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }
    return NextResponse.json(
      { project: serializeInvestmentProject(project) },
      { headers: { 'x-request-id': ctx.requestId } },
    );
  });
}

const Body = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(2000),
  type: z.enum(['Résidentiel', 'Terrain', 'Bureau', 'Mixte']),
  city: z.string().trim().min(2).max(60),
  quartier: z.string().trim().min(2).max(60),
  priceFrom: z.number().int().positive(),
  lotsLabel: z.string().trim().min(2).max(60),
  status: z.string().trim().min(2).max(40).optional(),
  developerName: z.string().trim().max(100).optional(),
  images: z.array(z.string().url()).max(3).optional(),
});

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
    const existing = await prisma.investmentProject.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    const data = parsed.data;
    const images = data.images?.filter(Boolean) ?? [];

    const updated = await prisma.investmentProject.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        city: data.city,
        quartier: data.quartier,
        priceFrom: data.priceFrom,
        lotsLabel: data.lotsLabel,
        ...(data.status ? { status: data.status } : {}),
        developerName: data.developerName?.trim() || null,
        ...(images.length
          ? {
              image: images[0]!,
              image2: images[1] ?? null,
              image3: images[2] ?? null,
            }
          : {}),
      },
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
    const existing = await prisma.investmentProject.findFirst({
      where: { id, ownerId: auth.user.sub },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

    await prisma.investmentProject.update({
      where: { id },
      data: { recordStatus: 'ARCHIVED' },
    });

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/investment-projects/[id]/route.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/investment-projects/[id]/route.ts" "frontend/src/app/api/investment-projects/[id]/route.test.ts"
git commit -m "feat(investment-projects): add GET/PATCH/DELETE /api/investment-projects/[id]"
```

---

### Task 6: `POST /api/investment-projects/[id]/interests`

**Files:**
- Create: `frontend/src/app/api/investment-projects/[id]/interests/route.ts`
- Test: `frontend/src/app/api/investment-projects/[id]/interests/route.test.ts`

**Interfaces:**
- Consumes: `getInvestmentProjectById` (Task 2); `createNotification` from `@/lib/server/notifications`; `investmentInterestReceived` from `@/lib/server/notifications/templates` (Task 3); `createEmailLimiter` from `@/lib/server/middleware/rate-limit-by-email`; `redis` from `@/lib/server/redis`.
- Produces: `POST` handler returning `{ id: string }` (201). Task 9's `InvestmentInterestCard` calls this.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/api/investment-projects/[id]/interests/route.test.ts`:

```typescript
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

const project = { id: 'proj-1', ownerId: 'owner-1', title: 'Les Jardins d’Almadies' } as never;

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter frontend exec vitest run "src/app/api/investment-projects/[id]/interests/route.test.ts"`
Expected: FAIL — `./route` has no exported `POST`.

- [ ] **Step 3: Write the route**

Create `frontend/src/app/api/investment-projects/[id]/interests/route.ts`:

```typescript
// POST /api/investment-projects/[id]/interests — "Manifester mon intérêt"
// lead form on the investment project detail page.
//
// No CSRF check: same rationale as visit-requests — a public, pre-session
// action with no ambient session authority to protect.
//
// IP rate-limited (no email/session to key on) — reuses the email-limiter's
// IP fallback bucket, same as visit-requests.
export const runtime = 'nodejs';

import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getInvestmentProjectById } from '@/lib/server/investment-projects';
import { createNotification } from '@/lib/server/notifications';
import { investmentInterestReceived } from '@/lib/server/notifications/templates';
import { prisma } from '@/lib/server/prisma';
import { redis } from '@/lib/server/redis';
import { createEmailLimiter } from '@/lib/server/middleware/rate-limit-by-email';
import { makeRequestContext, withRequestContext } from '@/lib/server/observability/request-context';

const Body = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(20),
  message: z.string().trim().max(500).optional(),
});

const limiter = createEmailLimiter(redis ? { redis } : {}, {
  bucket: 'investment-interests',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.INVESTMENT_INTEREST_RATE_LIMIT_MAX ?? 10),
  code: 'TOO_MANY_INVESTMENT_INTERESTS',
  message: 'Too many requests. Try again later.',
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = makeRequestContext(req.headers);
  return withRequestContext(ctx, async () => {
    const limited = await limiter.check(req, null);
    if (limited) return limited;

    const { id } = await params;

    const project = await getInvestmentProjectById(id);
    if (!project) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Investment project not found' },
        { status: 404, headers: { 'x-request-id': ctx.requestId } },
      );
    }

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

    const data = parsed.data;
    const interest = await prisma.investmentInterest.create({
      data: {
        projectId: project.id,
        name: data.name,
        phone: data.phone,
        message: data.message ?? null,
      },
      select: { id: true },
    });

    await createNotification(
      prisma,
      investmentInterestReceived(
        project.ownerId,
        interest.id,
        project.id,
        project.title,
        data.name,
        data.phone,
      ),
    );

    return NextResponse.json(
      { id: interest.id },
      { status: 201, headers: { 'x-request-id': ctx.requestId } },
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter frontend exec vitest run "src/app/api/investment-projects/[id]/interests/route.test.ts"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/api/investment-projects/[id]/interests"
git commit -m "feat(investment-projects): add POST /api/investment-projects/[id]/interests"
```

---

### Task 7: Components — `InvestmentProjectCard`, `InvestmentInterestCard`, `DeleteProjectButton`, `OwnerContactCard` generalization

**Files:**
- Create: `frontend/src/components/immolink/InvestmentProjectCard.tsx`
- Create: `frontend/src/components/immolink/InvestmentInterestCard.tsx`
- Create: `frontend/src/components/immolink/DeleteProjectButton.tsx`
- Modify: `frontend/src/components/immolink/OwnerContactCard.tsx`

**Interfaces:**
- Consumes: `formatFcfa` from `@/lib/mock/immolink` (existing); `api`/`ApiError` from `@/lib/api` (existing, protected — read-only import); `useToast` from `@/contexts/ToastContext` (existing).
- Produces: `<InvestmentProjectCard project={InvestmentProject} />`, `<InvestmentInterestCard projectId={string} projectTitle={string} />`, `<DeleteProjectButton projectId={string} title={string} className?={string} redirectTo?={string} />`, and `<OwnerContactCard ... contextLabel?={string} />` (new optional prop, defaults to `'annonce'` so the existing `/biens/[id]` call site is unaffected). Tasks 8–12 consume these.

- [ ] **Step 1: Create `InvestmentProjectCard.tsx`**

```tsx
import Image from 'next/image';
import Link from 'next/link';
import type { InvestmentProject } from '@prisma/client';
import { formatFcfa } from '@/lib/mock/immolink';

export function InvestmentProjectCard({ project }: { project: InvestmentProject }) {
  return (
    <Link
      href={`/projets-neufs/${project.id}`}
      className="overflow-hidden rounded-2xl border border-brand-green/8 bg-white transition-transform hover:-translate-y-1"
    >
      <div className="relative h-48">
        <Image src={project.image} alt={project.title} fill className="object-cover" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.75 py-1 text-xs font-bold text-white">
          {project.status}
        </span>
      </div>
      <div className="p-4.5">
        <h3 className="mb-0.5 text-lg font-extrabold">{project.title}</h3>
        <div className="mb-3 text-[13px] font-semibold text-brand-muted">
          {project.city} · {project.lotsLabel}
        </div>
        <div className="text-[13px] font-semibold text-brand-slate">
          À partir de{' '}
          <span className="font-extrabold text-brand-green">
            {formatFcfa(project.priceFrom)} FCFA
          </span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create `InvestmentInterestCard.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function InvestmentInterestCard({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api(`/api/investment-projects/${projectId}/interests`, {
        method: 'POST',
        body: {
          name,
          phone,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      toast('Votre intérêt a été transmis au porteur du projet.');
      setOpen(false);
      setName('');
      setPhone('');
      setMessage('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="rounded-3xl border border-brand-green/10 bg-white p-6 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.5)]">
        <h3 className="mb-3.5 text-[15.5px] font-extrabold">Intéressé(e) par ce projet ?</h3>
        <p className="mb-4.5 text-[13.5px] text-brand-muted2">
          Manifestez votre intérêt, le porteur du projet « {projectTitle} » vous recontactera
          directement.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full cursor-pointer rounded-xl bg-brand-green py-3.25 text-[15px] font-bold text-brand-cream"
        >
          Manifester mon intérêt
        </button>
      </div>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="animate-im-fade fixed inset-0 z-60 flex items-center justify-center bg-brand-green-dark/55 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-im-up w-full max-w-md rounded-3xl bg-brand-cream p-6 sm:p-7"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <div className="mb-1 text-[13px] font-bold tracking-wide text-brand-red uppercase">
                  Investissement
                </div>
                <h2 className="font-serif text-2xl font-normal">Manifester mon intérêt</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white text-lg font-bold"
              >
                ✕
              </button>
            </div>
            <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Nom complet
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Téléphone
                <input
                  required
                  type="tel"
                  minLength={6}
                  maxLength={20}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+221 77 000 00 00"
                  className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
                Message (optionnel)
                <textarea
                  maxLength={500}
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="resize-none rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
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
                className="mt-1 cursor-pointer rounded-xl bg-brand-green py-3.25 text-[15px] font-bold text-brand-cream disabled:opacity-50"
              >
                {submitting ? 'Envoi…' : 'Envoyer'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `DeleteProjectButton.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export function DeleteProjectButton({
  projectId,
  title,
  className,
  redirectTo,
}: {
  projectId: string;
  title: string;
  className?: string;
  /** Where to navigate after a successful archive. Omit to just refresh the current page. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `Archiver définitivement « ${title} » ? Cette action est irréversible.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await api(`/api/investment-projects/${projectId}`, { method: 'DELETE' });
      toast('Projet archivé.');
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Archivage impossible.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={deleting} className={className}>
      {deleting ? 'Archivage…' : 'Archiver'}
    </button>
  );
}
```

- [ ] **Step 4: Generalize `OwnerContactCard.tsx`'s message copy**

In `frontend/src/components/immolink/OwnerContactCard.tsx`, replace:

```tsx
export function OwnerContactCard({
  ownerPhone,
  ownerEmail,
  propertyTitle,
}: {
  ownerPhone: string | null;
  ownerEmail: string;
  propertyTitle: string;
}) {
  const message = `Bonjour, je suis intéressé(e) par votre annonce « ${propertyTitle} » sur ImmoLink.`;
```

with:

```tsx
export function OwnerContactCard({
  ownerPhone,
  ownerEmail,
  propertyTitle,
  contextLabel = 'annonce',
}: {
  ownerPhone: string | null;
  ownerEmail: string;
  propertyTitle: string;
  /** Noun used in the generated contact message — "annonce" (default, /biens) or "projet" (/projets-neufs). */
  contextLabel?: string;
}) {
  const message = `Bonjour, je suis intéressé(e) par votre ${contextLabel} « ${propertyTitle} » sur ImmoLink.`;
```

This is additive (default value preserves the existing `/biens/[id]` behavior exactly) — no other call site needs changes.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/immolink/InvestmentProjectCard.tsx frontend/src/components/immolink/InvestmentInterestCard.tsx frontend/src/components/immolink/DeleteProjectButton.tsx frontend/src/components/immolink/OwnerContactCard.tsx
git commit -m "feat(investment-projects): add project card, interest card, delete button; generalize OwnerContactCard copy"
```

---

### Task 8: `/projets-neufs` — real data instead of the `PROGRAMS` mock

**Files:**
- Modify: `frontend/src/app/projets-neufs/page.tsx`

**Interfaces:**
- Consumes: `listInvestmentProjects` (Task 2), `InvestmentProjectCard` (Task 7).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `frontend/src/app/projets-neufs/page.tsx` with:

```tsx
// /projets-neufs — programmes immobiliers neufs publiés par leurs
// promoteurs (InvestmentProject). Remplace le mock PROGRAMS.
import type { Metadata } from 'next';
import Link from 'next/link';
import { InvestmentProjectCard } from '@/components/immolink/InvestmentProjectCard';
import { listInvestmentProjects } from '@/lib/server/investment-projects';

export const runtime = 'nodejs';
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Programmes immobiliers neufs au Sénégal',
  description:
    'Découvrez les programmes immobiliers neufs des promoteurs partenaires d’ImmoLink Sénégal — appartements et villas en construction à Dakar et ailleurs au Sénégal.',
  alternates: { canonical: '/projets-neufs' },
};

export default async function NewProgramsPage() {
  const projects = await listInvestmentProjects();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-6.5 pb-15 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        / Projets neufs
      </div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-red uppercase">
            Promoteurs
          </div>
          <h1 className="mb-2 font-serif text-4xl leading-none font-normal">
            Programmes immobiliers neufs
          </h1>
          <p className="text-[15px] text-brand-muted2">
            Des projets publiés directement par leurs promoteurs — villas, appartements et lots
            viabilisés en cours de commercialisation au Sénégal.
          </p>
        </div>
        <Link
          href="/projets-neufs/nouveau"
          className="im-tap self-start rounded-xl bg-brand-green px-5.5 py-3 text-sm font-bold whitespace-nowrap text-brand-cream"
        >
          + Publier mon projet
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-brand-muted2">
          Aucun projet publié pour le moment — revenez bientôt, ou{' '}
          <Link href="/projets-neufs/nouveau" className="font-semibold text-brand-green underline">
            publiez le vôtre
          </Link>
          .
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <InvestmentProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/projets-neufs/page.tsx
git commit -m "feat(projets-neufs): list real published projects instead of the PROGRAMS mock"
```

---

### Task 9: `/projets-neufs/[id]` — project detail page

**Files:**
- Create: `frontend/src/app/projets-neufs/[id]/page.tsx`

**Interfaces:**
- Consumes: `getInvestmentProjectWithOwnerById` (Task 2), `InvestmentInterestCard`, `OwnerContactCard` (Task 7), `formatFcfa` from `@/lib/mock/immolink`, `SITE_URL` from `@/lib/seo` (existing).

- [ ] **Step 1: Create the file**

```tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvestmentInterestCard } from '@/components/immolink/InvestmentInterestCard';
import { OwnerContactCard } from '@/components/immolink/OwnerContactCard';
import { formatFcfa } from '@/lib/mock/immolink';
import { getInvestmentProjectWithOwnerById } from '@/lib/server/investment-projects';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getInvestmentProjectWithOwnerById(id);
  if (!project) return {};

  const title = `${project.title} — projet d'investissement à ${project.quartier}, ${project.city}`;
  const description = project.description.slice(0, 200);
  const url = `${SITE_URL}/projets-neufs/${project.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      images: [{ url: project.image, alt: project.title }],
    },
  };
}

export default async function InvestmentProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getInvestmentProjectWithOwnerById(id);
  if (!project) notFound();

  return (
    <main className="animate-im-fade mx-auto max-w-6xl px-4 pt-5.5 pb-15 sm:px-8">
      <div className="mb-4 text-[13px] font-semibold text-brand-muted">
        <Link href="/" className="text-brand-muted hover:text-brand-red">
          Accueil
        </Link>{' '}
        /{' '}
        <Link href="/projets-neufs" className="text-brand-muted hover:text-brand-red">
          Projets neufs
        </Link>{' '}
        / {project.title}
      </div>

      <div className="mb-7.5 grid h-auto grid-cols-1 gap-3 sm:h-110 sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
        <div className="relative h-60 overflow-hidden rounded-[20px] sm:row-span-2 sm:h-auto">
          <Image src={project.image} alt={project.title} fill className="object-cover" />
          <span className="absolute bottom-4 left-4 rounded-full bg-black/50 px-3.25 py-1.5 text-[12.5px] font-semibold text-white">
            {project.status}
          </span>
        </div>
        {project.image2 && (
          <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
            <Image src={project.image2} alt="" fill className="object-cover" />
          </div>
        )}
        {project.image3 && (
          <div className="relative hidden h-full overflow-hidden rounded-[18px] sm:block">
            <Image src={project.image3} alt="" fill className="object-cover" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <div className="flex flex-col gap-3 border-b border-brand-green/10 pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-[13px] font-bold text-brand-red">
                {project.type} · {project.lotsLabel}
              </span>
              <h1 className="my-1.5 font-serif text-3xl leading-tight sm:text-4xl">
                {project.title}
              </h1>
              <div className="text-[15px] font-medium text-brand-muted2">
                📍 {project.quartier}, {project.city}
              </div>
              {project.developerName && (
                <div className="mt-1 text-[13px] font-semibold text-brand-muted">
                  Par {project.developerName}
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <div className="text-[13px] font-semibold text-brand-muted">À partir de</div>
              <span className="font-serif text-[34px] text-brand-green">
                {formatFcfa(project.priceFrom)} FCFA
              </span>
            </div>
          </div>

          <h3 className="mt-6.5 mb-2.5 text-[19px] font-extrabold">Description</h3>
          <p className="text-[15px] leading-relaxed text-brand-slate text-pretty">
            {project.description}
          </p>
        </div>

        <aside className="lg:sticky lg:top-24">
          <InvestmentInterestCard projectId={project.id} projectTitle={project.title} />
          <OwnerContactCard
            ownerPhone={project.owner.phone}
            ownerEmail={project.owner.email}
            propertyTitle={project.title}
            contextLabel="projet"
          />
          <div className="mt-3.5 rounded-2xl border border-brand-red/25 bg-[#FBF3D2] px-4.5 py-4 text-[13px] leading-relaxed font-semibold text-[#6E1010]">
            🛡️ Projet publié via ImmoLink. Ne versez jamais d&apos;argent avant vérification
            directe auprès du porteur de projet.
          </div>
        </aside>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/projets-neufs/[id]/page.tsx"
git commit -m "feat(projets-neufs): add project detail page"
```

---

### Task 10: `/projets-neufs/nouveau` — publish form

**Files:**
- Create: `frontend/src/app/projets-neufs/nouveau/page.tsx`

**Interfaces:**
- Consumes: `api`/`ApiError` (`@/lib/api`), `uploadFile` (`@/lib/uploadFile`), `useUser` (`@/contexts/AuthContext`), `useToast` (`@/contexts/ToastContext`), `normalizeSenegalPhone` (`@/lib/phone`) — all existing, unmodified.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { normalizeSenegalPhone } from '@/lib/phone';

const TYPES = ['Résidentiel', 'Terrain', 'Bureau', 'Mixte'] as const;
const STATUSES = ['En cours', 'Sur plan', 'Livré'] as const;
const MAX_PHOTOS = 3;

export default function NewInvestmentProjectPage() {
  const router = useRouter();
  const user = useUser();
  const { toast } = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('Résidentiel');
  const [city, setCity] = useState('Dakar');
  const [quartier, setQuartier] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [lotsLabel, setLotsLabel] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('En cours');
  const [developerName, setDeveloperName] = useState('');
  const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setPhone(user.phone ?? '');
  }, [user]);

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotos(files);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (photos.length === 0) {
      setError('Ajoutez au moins une photo du projet.');
      return;
    }

    setSubmitting(true);
    try {
      const normalizedPhone = normalizeSenegalPhone(phone);
      if (user && normalizedPhone !== (user.phone ?? '')) {
        await api('/api/auth/me', { method: 'PATCH', body: { phone: normalizedPhone } });
      }

      const uploaded = await Promise.all(photos.map((f) => uploadFile(f)));
      const images = uploaded.map((u) => u.url);

      const res = await api<{ id: string }>('/api/investment-projects', {
        method: 'POST',
        body: {
          title,
          description,
          type,
          city,
          quartier,
          priceFrom: Number(priceFrom),
          lotsLabel,
          status,
          ...(developerName.trim() ? { developerName: developerName.trim() } : {}),
          images,
        },
      });
      toast('Projet publié avec succès.');
      router.push(`/projets-neufs/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/projets-neufs" className="text-brand-muted hover:text-brand-red">
          Projets neufs
        </Link>{' '}
        / Publier mon projet
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">
        Publier un projet d&apos;investissement
      </h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Présentez votre programme immobilier neuf aux investisseurs d&apos;ImmoLink.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Titre du projet
          <input
            required
            minLength={5}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Les Jardins d’Almadies"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Description
          <textarea
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="resize-none rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de projet
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
            Quartier
            <input
              required
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Prix de départ (FCFA)
          <input
            required
            type="number"
            min={1}
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Lots (ex: 48 lots, 120 apparts)
            <input
              required
              minLength={2}
              maxLength={60}
              value={lotsLabel}
              onChange={(e) => setLotsLabel(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Nom du promoteur / projet (optionnel)
          <input
            maxLength={100}
            value={developerName}
            onChange={(e) => setDeveloperName(e.target.value)}
            placeholder="Prestige Immo Développement"
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Téléphone de contact
          <input
            type="tel"
            placeholder="+221771234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
          <span className="text-xs font-medium text-brand-muted">
            Affiché aux investisseurs intéressés par ce projet.
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-brand-slate">
            Photos du projet ({MAX_PHOTOS} max, au moins 1 requise)
          </span>
          <input
            required
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickPhotos}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-sm text-brand-slate"
          />
          {photos.length > 0 && (
            <p className="text-xs font-semibold text-brand-muted">
              {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
              {photos.length > 1 ? 's' : ''}.
            </p>
          )}
        </div>

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
          {submitting ? 'Publication…' : 'Publier le projet'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/projets-neufs/nouveau/page.tsx
git commit -m "feat(projets-neufs): add publish form"
```

---

### Task 11: `/projets-neufs/[id]/modifier` — edit form

**Files:**
- Create: `frontend/src/app/projets-neufs/[id]/modifier/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/investment-projects/[id]` (Task 5), `DeleteProjectButton` (Task 7), `useUser`, `useToast`, `normalizeSenegalPhone`, `uploadFile` — same as Task 10.

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { uploadFile } from '@/lib/uploadFile';
import { useUser } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { DeleteProjectButton } from '@/components/immolink/DeleteProjectButton';
import { normalizeSenegalPhone } from '@/lib/phone';

const TYPES = ['Résidentiel', 'Terrain', 'Bureau', 'Mixte'] as const;
const STATUSES = ['En cours', 'Sur plan', 'Livré'] as const;
const MAX_PHOTOS = 3;

interface InvestmentProjectDto {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  type: string;
  city: string;
  quartier: string;
  priceFrom: number;
  lotsLabel: string;
  status: string;
  developerName: string | null;
}

export default function EditInvestmentProjectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const user = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('Résidentiel');
  const [city, setCity] = useState('');
  const [quartier, setQuartier] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [lotsLabel, setLotsLabel] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('En cours');
  const [developerName, setDeveloperName] = useState('');
  const [phone, setPhone] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setPhone(user.phone ?? '');
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api<{ project: InvestmentProjectDto }>(
          `/api/investment-projects/${params.id}`,
        );
        if (cancelled) return;
        if (res.project.ownerId !== user.id) {
          setForbidden(true);
          return;
        }
        const p = res.project;
        setTitle(p.title);
        setDescription(p.description);
        setType(
          TYPES.includes(p.type as (typeof TYPES)[number])
            ? (p.type as (typeof TYPES)[number])
            : 'Résidentiel',
        );
        setCity(p.city);
        setQuartier(p.quartier);
        setPriceFrom(String(p.priceFrom));
        setLotsLabel(p.lotsLabel);
        setStatus(
          STATUSES.includes(p.status as (typeof STATUSES)[number])
            ? (p.status as (typeof STATUSES)[number])
            : 'En cours',
        );
        setDeveloperName(p.developerName ?? '');
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger le projet.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id, user]);

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    setPhotos(files);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const normalizedPhone = normalizeSenegalPhone(phone);
      if (user && normalizedPhone !== (user.phone ?? '')) {
        await api('/api/auth/me', { method: 'PATCH', body: { phone: normalizedPhone } });
      }

      let images: string[] = [];
      if (photos.length > 0) {
        const uploaded = await Promise.all(photos.map((f) => uploadFile(f)));
        images = uploaded.map((u) => u.url);
      }

      await api(`/api/investment-projects/${params.id}`, {
        method: 'PATCH',
        body: {
          title,
          description,
          type,
          city,
          quartier,
          priceFrom: Number(priceFrom),
          lotsLabel,
          status,
          ...(developerName.trim() ? { developerName: developerName.trim() } : {}),
          ...(images.length ? { images } : {}),
        },
      });
      toast('Projet mis à jour.');
      router.push(`/projets-neufs/${params.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) return null;

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl items-center justify-center px-4">
        <p className="text-sm font-semibold text-brand-muted2">Chargement…</p>
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="font-serif text-2xl">Accès refusé</h1>
        <p className="text-sm text-brand-muted2">Ce projet n&apos;appartient pas à votre compte.</p>
        <Link href="/dashboard" className="font-semibold text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-semibold text-brand-red">{loadError}</p>
        <Link href="/dashboard" className="font-semibold text-brand-green underline">
          Retour au tableau de bord
        </Link>
      </main>
    );
  }

  return (
    <main className="animate-im-fade mx-auto max-w-2xl px-4 pt-8 pb-16 sm:px-8">
      <div className="mb-1.5 text-[13px] font-semibold text-brand-muted">
        <Link href="/dashboard" className="text-brand-muted hover:text-brand-red">
          Tableau de bord
        </Link>{' '}
        / Modifier le projet
      </div>
      <h1 className="mb-1.5 font-serif text-3xl sm:text-4xl">Modifier le projet</h1>
      <p className="mb-8 text-[15px] text-brand-muted2">
        Mets à jour les informations de ton projet d&apos;investissement.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Titre du projet
          <input
            required
            minLength={5}
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Description
          <textarea
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="resize-none rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Type de projet
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
            Quartier
            <input
              required
              value={quartier}
              onChange={(e) => setQuartier(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Prix de départ (FCFA)
          <input
            required
            type="number"
            min={1}
            value={priceFrom}
            onChange={(e) => setPriceFrom(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Lots (ex: 48 lots, 120 apparts)
            <input
              required
              minLength={2}
              maxLength={60}
              value={lotsLabel}
              onChange={(e) => setLotsLabel(e.target.value)}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
            Statut
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
              className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
            >
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Nom du promoteur / projet (optionnel)
          <input
            maxLength={100}
            value={developerName}
            onChange={(e) => setDeveloperName(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold text-brand-slate">
          Téléphone de contact
          <input
            type="tel"
            placeholder="+221771234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-[15px] font-medium text-brand-ink outline-none focus:border-brand-green"
          />
          <span className="text-xs font-medium text-brand-muted">
            Affiché aux investisseurs intéressés par ce projet.
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-brand-slate">
            Remplacer les photos ({MAX_PHOTOS} max, optionnel)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={onPickPhotos}
            className="rounded-xl border border-brand-green/15 bg-white px-4 py-3 text-sm text-brand-slate"
          />
          {photos.length > 0 && (
            <p className="text-xs font-semibold text-brand-muted">
              {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
              {photos.length > 1 ? 's' : ''} — remplacera{photos.length > 1 ? 'ont' : ''} les
              photos actuelles.
            </p>
          )}
        </div>

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
          {submitting ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>

        <DeleteProjectButton
          projectId={params.id}
          title={title}
          redirectTo="/dashboard"
          className="cursor-pointer rounded-xl border border-brand-red/30 py-3.5 text-[15px] font-bold text-brand-red hover:bg-brand-red/5 disabled:opacity-50"
        />
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/projets-neufs/[id]/modifier/page.tsx"
git commit -m "feat(projets-neufs): add edit form"
```

---

### Task 12: Dashboard — "Mes projets d'investissement" section

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listInvestmentProjectsByOwner` (Task 2), `DeleteProjectButton` (Task 7), `formatFcfa` (existing).

- [ ] **Step 1: Add imports**

In `frontend/src/app/dashboard/page.tsx`, replace:

```typescript
import Link from 'next/link';
import { OpenPacksButton } from '@/components/immolink/OpenPacksButton';
import { DeleteListingButton } from '@/components/immolink/DeleteListingButton';
import { priceFmt, notificationVisual, timeAgo } from '@/lib/mock/immolink';
import { listPropertiesByOwner, DEMO_SELLER_EMAIL } from '@/lib/server/properties';
```

with:

```typescript
import Link from 'next/link';
import { OpenPacksButton } from '@/components/immolink/OpenPacksButton';
import { DeleteListingButton } from '@/components/immolink/DeleteListingButton';
import { DeleteProjectButton } from '@/components/immolink/DeleteProjectButton';
import { priceFmt, formatFcfa, notificationVisual, timeAgo } from '@/lib/mock/immolink';
import { listPropertiesByOwner, DEMO_SELLER_EMAIL } from '@/lib/server/properties';
import { listInvestmentProjectsByOwner } from '@/lib/server/investment-projects';
```

- [ ] **Step 2: Fetch the owner's projects**

Replace:

```typescript
  const rows = ownerId ? await listPropertiesByOwner(ownerId) : [];
```

with:

```typescript
  const rows = ownerId ? await listPropertiesByOwner(ownerId) : [];
  const projects = ownerId ? await listInvestmentProjectsByOwner(ownerId) : [];
```

- [ ] **Step 3: Render the new section**

Replace:

```typescript
      </div>
    </main>
  );
}
```

with:

```typescript
      </div>

      {projects.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-[20px] border border-brand-green/8 bg-white">
          <div className="flex items-center justify-between border-b border-brand-green/8 px-6 py-5">
            <h3 className="text-lg font-extrabold">Mes projets d&apos;investissement</h3>
            <Link
              href="/projets-neufs/nouveau"
              className="text-[13px] font-bold text-brand-green underline"
            >
              + Publier un projet
            </Link>
          </div>
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 border-b border-brand-green/5 px-6 py-3.5 sm:grid sm:grid-cols-[2fr_1fr_1.3fr] sm:items-center sm:gap-0"
            >
              <Link href={`/projets-neufs/${p.id}`} className="flex items-center gap-3">
                <div className="h-12 w-12 flex-none rounded-[10px] bg-brand-green/15" />
                <div>
                  <div className="text-[14.5px] font-bold">{p.title}</div>
                  <div className="text-xs font-semibold text-brand-muted">
                    À partir de {formatFcfa(p.priceFrom)} FCFA
                  </div>
                </div>
              </Link>
              <span>
                <span className="rounded-full bg-brand-green/10 px-2.75 py-1 text-xs font-bold text-brand-green">
                  {p.recordStatus === 'ACTIVE' ? 'En ligne' : 'Archivé'}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <Link
                  href={`/projets-neufs/${p.id}/modifier`}
                  className="im-tap text-[13px] font-bold text-brand-green underline"
                >
                  Modifier
                </Link>
                <DeleteProjectButton
                  projectId={p.id}
                  title={p.title}
                  className="im-tap cursor-pointer text-[13px] font-bold text-brand-red underline disabled:opacity-50"
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): add Mes projets d'investissement section"
```

---

### Task 13: Homepage + `/investir` integration, remove the `PROGRAMS` mock

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/investir/page.tsx`
- Modify: `frontend/src/lib/mock/immolink.ts`

**Interfaces:**
- Consumes: `listInvestmentProjects` (Task 2), `InvestmentProjectCard` (Task 7).

- [ ] **Step 1: Homepage — imports and data fetch**

In `frontend/src/app/page.tsx`, replace:

```typescript
import { HERO_STATS, PROGRAMS, PACKS, TESTIMONIALS } from '@/lib/mock/immolink';
import { listProperties } from '@/lib/server/properties';
import { getActiveBanner } from '@/lib/server/banners';
```

with:

```typescript
import { HERO_STATS, PACKS, TESTIMONIALS, formatFcfa } from '@/lib/mock/immolink';
import { listProperties } from '@/lib/server/properties';
import { listInvestmentProjects } from '@/lib/server/investment-projects';
import { getActiveBanner } from '@/lib/server/banners';
```

(`formatFcfa` is added here because Step 2 below uses it in the swapped-in teaser markup.)

Then replace:

```typescript
  const [all, banner] = await Promise.all([listProperties({ take: 24 }), getActiveBanner()]);
```

with:

```typescript
  const [all, banner, programs] = await Promise.all([
    listProperties({ take: 24 }),
    getActiveBanner(),
    listInvestmentProjects({ take: 3 }),
  ]);
```

- [ ] **Step 2: Homepage — swap the teaser section to real data**

Replace:

```tsx
      {/* PROJETS NEUFS */}
      <Reveal>
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-brand-green-dark p-6 text-brand-cream sm:p-11">
            <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0,rgba(242,194,0,.22),transparent_60%)]" />
            <div className="relative mb-6.5 flex items-end justify-between">
              <div>
                <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-gold uppercase">
                  Promoteurs
                </div>
                <h2 className="font-serif text-3xl leading-none font-normal sm:text-[38px]">
                  Programmes immobiliers neufs
                </h2>
              </div>
              <Link href="/projets-neufs" className="im-tap text-sm font-bold text-brand-gold">
                Explorer →
              </Link>
            </div>
            <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-3">
              {PROGRAMS.map((pr) => (
                <Link
                  key={pr.name}
                  href={`/recherche?q=${encodeURIComponent(pr.city)}`}
                  className="im-tap overflow-hidden rounded-2xl border border-brand-cream/14 bg-brand-cream/6"
                >
                  <div className="relative h-37.5">
                    <Image src={pr.image} alt={pr.name} fill className="object-cover" />
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.75 py-1 text-xs font-bold text-white">
                      {pr.status}
                    </span>
                  </div>
                  <div className="p-4.5">
                    <h3 className="mb-0.5 text-lg font-extrabold">{pr.name}</h3>
                    <div className="mb-3 text-[13px] text-brand-cream/66">
                      {pr.city} · {pr.lots}
                    </div>
                    <div className="text-[13px] font-semibold text-brand-cream/82">
                      À partir de <span className="font-extrabold text-brand-gold">{pr.from}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </Reveal>
```

with:

```tsx
      {/* PROJETS NEUFS */}
      {programs.length > 0 && (
        <Reveal>
          <section className="mx-auto max-w-6xl px-4 pt-14 pb-2 sm:px-8">
            <div className="relative overflow-hidden rounded-3xl bg-brand-green-dark p-6 text-brand-cream sm:p-11">
              <div className="absolute inset-0 bg-[radial-gradient(700px_300px_at_100%_0,rgba(242,194,0,.22),transparent_60%)]" />
              <div className="relative mb-6.5 flex items-end justify-between">
                <div>
                  <div className="mb-2 text-[13px] font-bold tracking-wide text-brand-gold uppercase">
                    Promoteurs
                  </div>
                  <h2 className="font-serif text-3xl leading-none font-normal sm:text-[38px]">
                    Programmes immobiliers neufs
                  </h2>
                </div>
                <Link href="/projets-neufs" className="im-tap text-sm font-bold text-brand-gold">
                  Explorer →
                </Link>
              </div>
              <div className="relative grid grid-cols-1 gap-5 sm:grid-cols-3">
                {programs.map((pr) => (
                  <Link
                    key={pr.id}
                    href={`/projets-neufs/${pr.id}`}
                    className="im-tap overflow-hidden rounded-2xl border border-brand-cream/14 bg-brand-cream/6"
                  >
                    <div className="relative h-37.5">
                      <Image src={pr.image} alt={pr.title} fill className="object-cover" />
                      <span className="absolute bottom-3 left-3 rounded-full bg-black/40 px-2.75 py-1 text-xs font-bold text-white">
                        {pr.status}
                      </span>
                    </div>
                    <div className="p-4.5">
                      <h3 className="mb-0.5 text-lg font-extrabold">{pr.title}</h3>
                      <div className="mb-3 text-[13px] text-brand-cream/66">
                        {pr.city} · {pr.lotsLabel}
                      </div>
                      <div className="text-[13px] font-semibold text-brand-cream/82">
                        À partir de{' '}
                        <span className="font-extrabold text-brand-gold">
                          {formatFcfa(pr.priceFrom)} FCFA
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </Reveal>
      )}
```

- [ ] **Step 3: `/investir` — imports and data fetch**

In `frontend/src/app/investir/page.tsx`, replace:

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyCard } from '@/components/immolink/PropertyCard';
import { getInvestmentStats, listInvestmentOpportunities } from '@/lib/server/properties';
import { formatFcfa } from '@/lib/mock/immolink';
```

with:

```typescript
import type { Metadata } from 'next';
import Link from 'next/link';
import { PropertyCard } from '@/components/immolink/PropertyCard';
import { InvestmentProjectCard } from '@/components/immolink/InvestmentProjectCard';
import { getInvestmentStats, listInvestmentOpportunities } from '@/lib/server/properties';
import { listInvestmentProjects } from '@/lib/server/investment-projects';
import { formatFcfa } from '@/lib/mock/immolink';
```

Then replace:

```typescript
  const [stats, opportunities] = await Promise.all([
    getInvestmentStats(),
    listInvestmentOpportunities(6),
  ]);
```

with:

```typescript
  const [stats, opportunities, projects] = await Promise.all([
    getInvestmentStats(),
    listInvestmentOpportunities(6),
    listInvestmentProjects({ take: 3 }),
  ]);
```

- [ ] **Step 4: `/investir` — insert the "Projets à financer" section**

Replace:

```tsx
      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-serif text-3xl leading-none font-normal">Opportunités du moment</h2>
```

with:

```tsx
      {projects.length > 0 && (
        <div className="mb-9">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-serif text-3xl leading-none font-normal">Projets à financer</h2>
            <Link
              href="/projets-neufs"
              className="border-b-2 border-brand-red pb-1 text-sm font-bold text-brand-green"
            >
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5.5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <InvestmentProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>
      )}

      <div className="mb-6 flex items-end justify-between">
        <h2 className="font-serif text-3xl leading-none font-normal">Opportunités du moment</h2>
```

- [ ] **Step 5: Remove the `PROGRAMS` mock**

In `frontend/src/lib/mock/immolink.ts`, delete the entire `PROGRAMS` export block:

```typescript
export const PROGRAMS = [
  {
    name: 'Les Jardins d’Almadies',
    city: 'Dakar',
    lots: '48 lots',
    from: '32M FCFA',
    status: 'En cours',
    image:
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=700&q=80&auto=format&fit=crop',
  },
  {
    name: 'Résidence Océane',
    city: 'Saly',
    lots: '120 apparts',
    from: '45M FCFA',
    status: 'Sur plan',
    image:
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&q=80&auto=format&fit=crop',
  },
  {
    name: 'Cité Émeraude',
    city: 'Diamniadio',
    lots: '80 villas',
    from: '28M FCFA',
    status: 'Livraison 2027',
    image:
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=700&q=80&auto=format&fit=crop',
  },
];

```

(delete the whole block including the blank line that follows it, leaving the surrounding `HERO_STATS` and `Pack` interface declarations directly adjacent as they were before, minus this block).

- [ ] **Step 6: Verify no remaining references**

Run: `grep -rn "PROGRAMS" frontend/src/app frontend/src/components frontend/src/lib`
Expected: no output (every usage was replaced in Steps 1–5).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/investir/page.tsx frontend/src/lib/mock/immolink.ts
git commit -m "feat(investir): surface real investment projects on the homepage and /investir; remove PROGRAMS mock"
```

---

### Task 14: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS, including the new files from Tasks 4–6 and the existing `runtime-enforcement.test.ts` (which will now also assert every new route under `frontend/src/app/api/investment-projects/**/route.ts` exports `runtime = 'nodejs'`).

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 3: Format check**

Run: `pnpm format:check`
Expected: PASS. If it fails, run `pnpm format` and re-stage the affected files.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: PASS — this also statically type-checks every page created in Tasks 8–13, catching any Server/Client Component boundary mistakes the dev server wouldn't surface immediately.

- [ ] **Step 6: Manual smoke test (dev server)**

Run: `pnpm dev`, then in a browser:
1. Visit `/projets-neufs` — should show the empty state (no projects published yet).
2. Log in (or sign up), visit `/projets-neufs/nouveau`, publish a project with at least one photo.
3. Confirm redirect to `/projets-neufs/[id]` and that the detail page renders correctly (gallery, description, price, "Manifester mon intérêt" card, owner contact card).
4. From an incognito/logged-out window, open the same `/projets-neufs/[id]` URL and submit "Manifester mon intérêt" — confirm a 201 and a toast.
5. Back in the logged-in dashboard, confirm the project appears under "Mes projets d'investissement" and a notification appears in the sidebar for the interest submitted in step 4.
6. Click "Modifier", change a field, save, confirm the update is reflected on the detail page.
7. Visit `/` and `/investir` — confirm the new project appears in the homepage teaser and the "Projets à financer" section.
8. Click "Archiver" from the dashboard or the edit page — confirm the project disappears from `/projets-neufs`.

- [ ] **Step 7: Final commit (if any formatting fixes were needed)**

```bash
git add -A
git status
```

If `pnpm format` in Step 3 modified any files, commit them:

```bash
git commit -m "chore: apply formatting fixes"
```
