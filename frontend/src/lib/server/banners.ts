import 'server-only';
import { prisma } from '@/lib/server/prisma';

// Homepage promo banner — see PromoBanner in schema.prisma. Only one banner
// is meant to be active at a time; this returns the most recently created
// active row, or null if none is set.
export async function getActiveBanner() {
  return prisma.promoBanner.findFirst({
    where: { active: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, imageUrl: true, linkUrl: true },
  });
}
