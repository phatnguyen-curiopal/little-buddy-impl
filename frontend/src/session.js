import { useSyncExternalStore } from 'react';

// Console state that should survive a page reload during a test session:
// parent tokens, the admin token, and the pasted toy credentials. Mirrored
// to sessionStorage (tab-scoped, wrapped in try/catch because private
// windows may refuse it). Nothing here is a production pattern.
const KEY = 'lb-console';

const initial = {
  parent: null, // { accessToken, refreshToken, expiresAt, parent, family }
  prevRefreshToken: null, // kept only to demonstrate refresh_token_reused
  admin: 'dev-admin-token-change-me',
  toy: { deviceId: '', secretHex: '' },
  lastClaimCode: null, // set by an admin reissue, consumed by the parent claim form
};

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...initial, ...JSON.parse(raw) } : initial;
  } catch {
    return initial;
  }
}

let state = load();
const listeners = new Set();

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the console still works for this page's lifetime
  }
}

export function get() {
  return state;
}

export function set(patch) {
  state = { ...state, ...patch };
  save();
  for (const fn of listeners) fn();
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSession() {
  return useSyncExternalStore(subscribe, get);
}

export function setParentSession(body) {
  set({
    parent: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
      parent: body.parent ?? state.parent?.parent ?? null,
      family: body.family ?? state.parent?.family ?? null,
    },
  });
}

export function clearParentSession() {
  set({ parent: null });
}
