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

export function serializeInvestmentProject(p: InvestmentProject): Omit<
  InvestmentProject,
  'createdAt' | 'updatedAt'
> & {
  createdAt: string;
  updatedAt: string;
} {
  return { ...p, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() };
}
