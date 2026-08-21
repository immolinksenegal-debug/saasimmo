import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Account/app-only surfaces — indexable content lives at their canonical
// public route instead (e.g. a listing is /biens/[id], not /dashboard).
// Disallowed at the crawler level rather than per-page noindex meta because
// most of these are 'use client' pages, which can't export page metadata.
const DISALLOW = [
  '/api/',
  '/login',
  '/signup',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/dashboard',
  '/settings',
  '/annonces/nouvelle',
  '/annonces/*/modifier',
  '/demandes/nouvelle',
  '/admin/',
  '/auth/error',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: DISALLOW,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
