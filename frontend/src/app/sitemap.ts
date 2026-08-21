import type { MetadataRoute } from 'next';
import { listProperties } from '@/lib/server/properties';
import { SITE_URL } from '@/lib/seo';

export const runtime = 'nodejs';

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_URL}/recherche`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE_URL}/agences`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/demandes`, changeFrequency: 'daily', priority: 0.6 },
  { url: `${SITE_URL}/investir`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/projets-neufs`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/mentions-legales`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/cgv`, changeFrequency: 'yearly', priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const properties = await listProperties({ take: 5000 });

  const listingRoutes: MetadataRoute.Sitemap = properties.map((p) => ({
    url: `${SITE_URL}/biens/${p.id}`,
    lastModified: p.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...STATIC_ROUTES, ...listingRoutes];
}
