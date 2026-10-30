import { createElement, useSyncExternalStore } from 'react';
import { matchRoute } from './routes.js';

// A small History API router: the site has ten flat routes, which does not
// justify a routing library.
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const snapshot = () => `${window.location.pathname}${window.location.search}`;

export function useLocation() {
  const loc = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(loc, 'http://x');
  return { pathname: url.pathname, search: url.searchParams, route: matchRoute(url.pathname) };
}

// scroll: false keeps the page where it is, for a change that stays on the
// same screen (another ?tab= or ?child=).
export function navigate(to, { replace = false, scroll = true } = {}) {
  if (to === snapshot()) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
  emit();
  if (scroll && !to.includes('#')) window.scrollTo({ top: 0 });
}

// A plain <a> for real URLs (right-click, new tab), intercepted for in-app
// navigation.
export function Link({ to, onClick, children, replace, scroll, ...rest }) {
  return createElement('a', {
    href: to,
    ...rest,
    onClick: (e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (to.startsWith('#')) return;
      e.preventDefault();
      navigate(to, { replace, scroll });
    },
  }, children);
}
