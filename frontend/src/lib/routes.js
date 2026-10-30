// The route table and the pure rules around it (no React), so they can be
// tested with node --test. lib/router.js adds the hooks on top.

export const ROUTES = [
  { name: 'home', path: '/', area: 'public' },
  { name: 'login', path: '/login', area: 'guest' },
  { name: 'register', path: '/register', area: 'guest' },
  { name: 'overview', path: '/app', area: 'app' },
  { name: 'toys', path: '/app/toys', area: 'app' },
  // A Buddy in the browser; ?toy=<device id> picks which one. Hidden from
  // the nav when the backend has the web toy off.
  { name: 'talk', path: '/app/talk', area: 'app' },
  // One child at a time: what Buddy knows, safety alerts, weekly digests and
  // controls. ?child=<id> picks the child and ?tab= the section.
  { name: 'care', path: '/app/care', area: 'app' },
  { name: 'credits', path: '/app/credits', area: 'app' },
  { name: 'activity', path: '/app/activity', area: 'app' },
  { name: 'family', path: '/app/family', area: 'app' },
];

export const APP_SCREENS = ROUTES.filter((r) => r.area === 'app');

export function normalizePath(pathname) {
  const p = String(pathname || '/').split(/[?#]/)[0];
  if (p.length > 1 && p.endsWith('/')) return p.replace(/\/+$/, '');
  return p || '/';
}

export function matchRoute(pathname) {
  const path = normalizePath(pathname);
  return ROUTES.find((r) => r.path === path) ?? { name: 'notFound', path, area: 'public' };
}

// The normalised path with its query kept (the hash dropped): a link such as
// /app/care?tab=safety&child=... means a particular child and section.
function withQuery(href) {
  const s = String(href || '/').split('#')[0];
  const i = s.indexOf('?');
  const query = i < 0 ? '' : s.slice(i + 1);
  return `${normalizePath(s)}${query ? `?${query}` : ''}`;
}

// Only same-site app paths are accepted as a post-login destination, so a
// crafted ?next= can never send a parent to another site.
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/app') || next.startsWith('//')) return '/app';
  return matchRoute(next).area === 'app' ? withQuery(next) : '/app';
}

// What to do with a route given the session: null means render it.
// currentPath may carry a query, which survives the trip through sign-in.
export function guard(route, status, currentPath) {
  if (status === 'loading') return null;
  if (route.area === 'app' && status !== 'signedIn') {
    return `/login?next=${encodeURIComponent(withQuery(currentPath))}`;
  }
  if (route.area === 'guest' && status === 'signedIn') return '/app';
  return null;
}
