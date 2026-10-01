// The one place the site talks to the backend. The access token lives in
// memory only; the refresh token is kept in localStorage so a parent stays
// signed in across reloads. (Production should move it to an httpOnly
// cookie; see web/README.md.)
const RT_KEY = 'lb-web-refresh';

export class ApiError extends Error {
  constructor(status, body, retryAfter = null) {
    super(body?.error?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code ?? (status === 0 ? 'network_error' : 'http_error');
    this.details = body?.error?.details ?? null;
    this.retryAfter = retryAfter;
  }
}

function readToken() {
  try {
    return localStorage.getItem(RT_KEY);
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(RT_KEY, token);
    else localStorage.removeItem(RT_KEY);
  } catch {
    // storage unavailable: the session lasts for this page only
  }
}

let accessToken = null;
let refreshToken = readToken();
const listeners = new Set();

export const hasSession = () => Boolean(refreshToken);

export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setSession(tokens) {
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  writeToken(refreshToken);
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  writeToken(null);
  for (const fn of listeners) fn();
}

async function raw(method, path, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    throw new ApiError(0, { error: { code: 'network_error', message: err.message } });
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new ApiError(res.status, json, res.headers.get('retry-after'));
  return json;
}

// One refresh at a time: several requests failing together share it, so a
// rotated refresh token is never presented twice (the backend would treat
// that as a leak and end every session).
let refreshing = null;
export function refresh() {
  if (!refreshToken) return Promise.reject(new ApiError(401, { error: { code: 'no_session' } }));
  if (!refreshing) {
    refreshing = raw('POST', '/api/auth/refresh', { body: { refresh_token: refreshToken } })
      .then((out) => {
        setSession(out);
        return out;
      })
      .catch((err) => {
        if (err.status === 401) clearSession();
        throw err;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request(method, path, { body, auth = true } = {}) {
  if (auth && !accessToken && refreshToken) await refresh();
  try {
    return await raw(method, path, { body, token: auth ? accessToken : null });
  } catch (err) {
    if (auth && err.status === 401 && err.code === 'token_expired' && refreshToken) {
      await refresh();
      return raw(method, path, { body, token: accessToken });
    }
    throw err;
  }
}

const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const api = {
  async register(body) {
    const out = await raw('POST', '/api/auth/register', { body });
    setSession(out);
    return out;
  },
  async login(body) {
    const out = await raw('POST', '/api/auth/login', { body });
    setSession(out);
    return out;
  },
  async logout() {
    const token = refreshToken;
    clearSession();
    if (token) await raw('POST', '/api/auth/logout', { body: { refresh_token: token } }).catch(() => {});
  },
  me: () => request('GET', '/api/me'),
  children: () => request('GET', '/api/children'),
  addChild: (body) => request('POST', '/api/children', { body }),
  devices: () => request('GET', '/api/devices'),
  claim: (body) => request('POST', '/api/devices/claim', { body }),
  setChild: (id, childId) => request('PATCH', `/api/devices/${id}`, { body: { child_id: childId } }),
  // patch: any of name, role, personality, personality_source, language
  // (vi|en), voice_id (null = the default voice), learn, mood_pin (0..100,
  // null = automatic).
  updateProfile: (id, patch) => request('PATCH', `/api/devices/${id}/profile`, { body: patch }),
  voices: () => request('GET', '/api/voices'),
  // Owner-only; the web toy keeps the answer in memory for this page only.
  revealSecret: (id) => request('POST', `/api/devices/${id}/secret`, { body: {} }),
  pause: (id) => request('POST', `/api/devices/${id}/disable`, { body: {} }),
  resume: (id) => request('POST', `/api/devices/${id}/enable`, { body: {} }),
  unpair: (id) => request('DELETE', `/api/devices/${id}`),
  wallet: () => request('GET', '/api/wallet?limit=100'),
  turns: () => request('GET', '/api/turns?limit=200'),
  packs: () => request('GET', '/api/credit-packs', { auth: false }),
  createPurchase: (packId) => request('POST', '/api/purchases', { body: { pack_id: packId, idempotency_key: newKey() } }),
  demoPay: (id, outcome) => request('POST', `/api/purchases/${id}/demo-pay`, { body: { outcome } }),
};
