// Shared SEO constants — single source of truth for the canonical site URL,
// consumed by layout metadata, robots.ts, sitemap.ts, and per-page
// generateMetadata calls. Keeping it here (not inline per-file) means a
// domain change is a one-line edit instead of a grep-and-replace.
//
// Apex, not www: middleware.ts 308-redirects www.* → apex, so the apex host
// is the one canonical URL search engines should ever see.
export const SITE_URL = 'https://immolinksenegal.net';
export const SITE_NAME = 'ImmoLink Sénégal';
