import { NextResponse, type NextRequest } from 'next/server';

// Silent-refresh gate for protected pages.
//
// The (15-min) access cookie can expire while a (7-day) refresh cookie is
// still valid — typically when a tab sat unfocused or the laptop slept. The
// (authed) layout calling /api/auth/me would 401 and the user would be kicked
// to /login. This middleware catches that case BEFORE the page renders and
// bounces the request through /api/auth/refresh-and-return, which mints fresh
// cookies and 302s back to the original URL — invisible to the user.
//
// Protected paths are configured via AUTH_PROTECTED_PREFIXES (comma-separated,
// e.g. "/dashboard,/account"). Empty by default — the API surface is the only
// thing shipped, so out-of-the-box this middleware is a no-op.
//
// Edge runtime: no DB, no bcrypt, no Prisma. We only inspect cookies and
// build redirects — the heavy lifting happens in /api/auth/refresh-and-return
// (runtime=nodejs).

const COOKIE_PREFIX = process.env.COOKIE_PREFIX || 'app';
const ACCESS_COOKIE = `${COOKIE_PREFIX}-token`;
const REFRESH_COOKIE = `${COOKIE_PREFIX}-refresh`;
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH || '/login';

const AUTHED_PREFIXES = (process.env.AUTH_PROTECTED_PREFIXES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAuthedPath(pathname: string): boolean {
  return AUTHED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// www → apex canonicalization. Both hosts otherwise serve identical content
// with no redirect between them — split SEO signal (duplicate content, no
// single canonical URL) and, worse, a session-continuity bug: auth cookies
// are host-only unless COOKIE_DOMAIN is set, so a session started on one
// host silently doesn't carry over to the other. Redirecting collapses
// traffic onto a single host before either problem can occur. Generic (no
// hardcoded domain) so it's a no-op on preview/vercel.app/localhost hosts,
// which never start with "www.".
function wwwRedirect(req: NextRequest): NextResponse | null {
  const host = req.headers.get('host');
  if (!host?.startsWith('www.')) return null;
  const url = req.nextUrl.clone();
  url.hostname = host.slice('www.'.length);
  url.port = '';
  return NextResponse.redirect(url, 308);
}

export function middleware(req: NextRequest): NextResponse {
  const redirect = wwwRedirect(req);
  if (redirect) return redirect;

  if (AUTHED_PREFIXES.length === 0) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (!isAuthedPath(pathname)) return NextResponse.next();

  if (req.cookies.get(ACCESS_COOKIE)?.value) return NextResponse.next();

  const target = pathname + search;

  if (!req.cookies.get(REFRESH_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(target)}`;
    return NextResponse.redirect(url, 303);
  }

  const url = req.nextUrl.clone();
  url.pathname = '/api/auth/refresh-and-return';
  url.search = `?next=${encodeURIComponent(target)}`;
  return NextResponse.redirect(url, 303);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
