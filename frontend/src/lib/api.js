// The one place the site talks to the backend: backend-v2, served under /v2
// (nginx in production, vite in development, forward it to the API's /v1).
// The access token lives in memory only; the refresh token is kept in
// localStorage so a parent stays signed in across reloads. (Production should
// move it to an httpOnly cookie; see frontend/README.md.)
// docs/backend-v2.md describes every call and shape used here.
const BASE = '/v2';
// A key of its own: a token from the first backend means nothing to v2.
const RT_KEY = 'lb-web-refresh-v2';
// Where the site kept the first backend's refresh token. nginx still sends
// same-origin /api/ to that backend, where such a token stays valid until it
// is revoked, so dropFirstBackendToken revokes it there and removes it.
const FIRST_RT_KEY = 'lb-web-refresh';

// Errors arrive as problem details: { type: '/problems/<code>', title,
// status, errors: [{ field, code }] }. code is kept in snake case
// ('email-taken' becomes 'email_taken') because the dictionaries name their
// messages err_<code>. retryAfter is the wait a 429 asks for, in whole
// seconds (backend-v2 sends Retry-After with every one), or null.
export class ApiError extends Error {
  constructor(status, body, retryAfter = null) {
    const type = typeof body?.type === 'string' ? body.type.replace(/^\/problems\//, '') : null;
    super(body?.title || `HTTP ${status}`);
    this.status = status;
    this.code = (type ?? (status === 0 ? 'network_error' : 'http_error')).replace(/-/g, '_');
    this.fields = Array.isArray(body?.errors) ? body.errors : [];
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

// Runs once as the site loads, for a parent who signed in before the port.
// The token leaves storage first, so a failed revocation is never retried:
// fire and forget, with keepalive so it still goes out if the page moves on.
function dropFirstBackendToken() {
  let token = null;
  try {
    token = localStorage.getItem(FIRST_RT_KEY);
    if (token) localStorage.removeItem(FIRST_RT_KEY);
  } catch {
    return;
  }
  if (!token || typeof fetch !== 'function') return;
  fetch('/api/auth/logout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: token }),
    keepalive: true,
  }).catch(() => {});
}
dropFirstBackendToken();

// Retry-After in whole seconds, or null when it is missing or not a
// positive number (backend-v2 never sends the HTTP-date form).
function retrySeconds(header) {
  const s = Math.ceil(Number(header));
  return Number.isFinite(s) && s > 0 ? s : null;
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

async function raw(method, path, { body, token, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    throw new ApiError(0, { type: '/problems/network-error', title: err.message });
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new ApiError(res.status, json, retrySeconds(res.headers.get('retry-after')));
  return json;
}

// One refresh at a time: several requests failing together share it, so a
// rotated refresh token is never presented twice (the backend treats that as
// a leak and ends every session).
let refreshing = null;
export function refresh() {
  if (!refreshToken) return Promise.reject(new ApiError(401, { type: '/problems/unauthorized' }));
  if (!refreshing) {
    refreshing = raw('POST', '/auth/refresh', { body: { refresh_token: refreshToken } })
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

// v2 answers an expired access token with a plain 401, so any 401 on a
// signed-in call gets one refresh and one retry.
async function request(method, path, { body, auth = true, headers } = {}) {
  if (auth && !accessToken && refreshToken) await refresh();
  try {
    return await raw(method, path, { body, token: auth ? accessToken : null, headers });
  } catch (err) {
    if (auth && err.status === 401 && refreshToken) {
      await refresh();
      return raw(method, path, { body, token: accessToken, headers });
    }
    throw err;
  }
}

// A missing resource that is a normal state (a child without a Buddy yet).
async function orNull(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const ifMatch = (etag) => ({ 'if-match': etag });
const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const text = s.toString();
  return text ? `?${text}` : '';
};
const kid = (childId) => `/children/${encodeURIComponent(childId)}`;

export const api = {
  // Sign-in. register and login answer { access_token, refresh_token,
  // parent, family }.
  async register(body) {
    const out = await raw('POST', '/auth/register', { body });
    setSession(out);
    return out;
  },
  async login(body) {
    const out = await raw('POST', '/auth/login', { body });
    setSession(out);
    return out;
  },
  async logout() {
    const token = refreshToken;
    clearSession();
    if (token) await raw('POST', '/auth/logout', { body: { refresh_token: token } }).catch(() => {});
  },

  // { parent, family: { id, name }, children, web_toy, payments: 'demo'|'disabled',
  // speak_first }: speak_first false means the voice service never lets Buddy
  // greet first, whatever the child's controls say.
  me: () => request('GET', '/me'),
  updateMe: (patch) => request('PATCH', '/me', { body: patch }),
  updateFamily: (name) => request('PATCH', '/family', { body: { name } }),
  consents: () => request('GET', '/consents'),
  giveConsent: (kind, version) => request('POST', '/consents', { body: { kind, version } }),
  withdrawConsent: (kind) => request('DELETE', `/consents/${encodeURIComponent(kind)}`),

  // Children: { data: [child] }; a child is { id, name, nickname, birth_date,
  // languages, time_zone, city, learning_enabled, created_at }.
  children: () => request('GET', '/children'),
  addChild: (body) => request('POST', '/children', { body }),
  updateChild: (childId, patch) => request('PATCH', kid(childId), { body: patch }),
  deleteChild: (childId) => request('DELETE', kid(childId)),

  // Buddy: one per child. buddy() is null until the child has one.
  // characters: { data: [{ slug, name, who, themes, voices: { vi, en } }] },
  // voices being the character's own voice id per language (or null).
  characters: () => request('GET', '/characters'),
  questionnaire: (lang) => request('GET', '/questionnaire', { headers: { 'accept-language': lang } }),
  answerQuestionnaire: (childId, answers, lang) => request('POST', `${kid(childId)}/questionnaire`, { body: { answers }, headers: { 'accept-language': lang } }),
  createBuddy: (childId, questionnaireId, slug) => request('POST', `${kid(childId)}/buddy`, { body: { questionnaire_id: questionnaireId, character_slug: slug } }),
  changeBuddy: (childId, questionnaireId, slug) => request('POST', `${kid(childId)}/buddy/change`, { body: { questionnaire_id: questionnaireId, character_slug: slug, confirm: true } }),
  buddy: (childId) => orNull(request('GET', `${kid(childId)}/buddy`)),
  // patch: any of role, language_mode, dials, personality (null clears),
  // voice_id (null = the character's own voice). etag is the Buddy's etag.
  updateBuddy: (childId, patch, etag) => request('PATCH', `${kid(childId)}/buddy`, { body: patch, headers: ifMatch(etag) }),
  voices: () => request('GET', '/voices'),

  // Toys: { data: [device] }.
  devices: () => request('GET', '/devices'),
  claim: (claimCode, childId) => request('POST', '/devices/claim', { body: { claim_code: claimCode, child_id: childId }, headers: { 'idempotency-key': newKey() } }),
  createWebToy: (childId) => request('POST', '/devices/web', { body: { child_id: childId } }),
  // { device_id, secret }: owner-only; the web toy keeps it in memory for this page only.
  credential: (deviceId) => request('POST', `/devices/${encodeURIComponent(deviceId)}/credential`),
  pause: (deviceId) => request('POST', `/devices/${encodeURIComponent(deviceId)}/pause`),
  resume: (deviceId) => request('POST', `/devices/${encodeURIComponent(deviceId)}/resume`),
  unpair: (deviceId) => request('POST', `/devices/${encodeURIComponent(deviceId)}/unpair`),

  // Credits.
  packs: () => request('GET', '/credit-packs', { auth: false }),
  wallet: (limit = 100) => request('GET', `/wallet${qs({ limit })}`),
  purchases: () => request('GET', '/purchases'),
  createPurchase: (packId) => request('POST', '/purchases', { body: { pack_id: packId, idempotency_key: newKey() } }),
  demoPay: (purchaseId, outcome) => request('POST', `/purchases/${encodeURIComponent(purchaseId)}/demo-pay`, { body: { outcome } }),

  // Activity: answered turns without words, and talk time per day.
  turns: ({ limit = 200, childId } = {}) => request('GET', `/turns${qs({ limit, child_id: childId })}`),
  usage: (childId, { from, to } = {}) => request('GET', `${kid(childId)}/usage${qs({ from, to })}`),

  // What Buddy knows. Lists page with { data, next_cursor }.
  memorySummary: (childId) => request('GET', `${kid(childId)}/memory/summary`),
  people: (childId, { kind, cursor, limit } = {}) => request('GET', `${kid(childId)}/people${qs({ kind, cursor, limit })}`),
  person: (childId, personId) => request('GET', `${kid(childId)}/people/${encodeURIComponent(personId)}`),
  updatePerson: (childId, personId, patch, etag) => request('PATCH', `${kid(childId)}/people/${encodeURIComponent(personId)}`, { body: patch, headers: ifMatch(etag) }),
  deletePerson: (childId, personId) => request('DELETE', `${kid(childId)}/people/${encodeURIComponent(personId)}`),
  facts: (childId, { category, cursor, limit } = {}) => request('GET', `${kid(childId)}/facts${qs({ category, cursor, limit })}`),
  addFact: (childId, body) => request('POST', `${kid(childId)}/facts`, { body }),
  updateFact: (childId, factId, patch, etag) => request('PATCH', `${kid(childId)}/facts/${encodeURIComponent(factId)}`, { body: patch, headers: ifMatch(etag) }),
  deleteFact: (childId, factId) => request('DELETE', `${kid(childId)}/facts/${encodeURIComponent(factId)}`),
  events: (childId, { cursor, limit } = {}) => request('GET', `${kid(childId)}/events${qs({ cursor, limit })}`),
  updateEvent: (childId, eventId, patch, etag) => request('PATCH', `${kid(childId)}/events/${encodeURIComponent(eventId)}`, { body: patch, headers: ifMatch(etag) }),
  deleteEvent: (childId, eventId) => request('DELETE', `${kid(childId)}/events/${encodeURIComponent(eventId)}`),
  relationship: (childId) => request('GET', `${kid(childId)}/relationship`),
  traits: (childId) => request('GET', `${kid(childId)}/traits`),
  deleteTrait: (childId, name) => request('DELETE', `${kid(childId)}/traits/${encodeURIComponent(name)}`),
  words: (childId) => request('GET', `${kid(childId)}/words`),
  speech: (childId) => request('GET', `${kid(childId)}/speech`),
  addSpeech: (childId, body) => request('POST', `${kid(childId)}/speech`, { body }),
  deleteSpeech: (childId, entryId) => request('DELETE', `${kid(childId)}/speech/${encodeURIComponent(entryId)}`),
  forgetEverything: (childId) => request('DELETE', `${kid(childId)}/memory`),

  // Safety alerts: { data: [{ id, severity, category, excerpt, created_at, acknowledged_at }], next_cursor }.
  alerts: (childId, { cursor, limit } = {}) => request('GET', `${kid(childId)}/alerts${qs({ cursor, limit })}`),
  acknowledgeAlert: (childId, alertId) => request('POST', `${kid(childId)}/alerts/${encodeURIComponent(alertId)}/acknowledge`),
  deleteAlert: (childId, alertId) => request('DELETE', `${kid(childId)}/alerts/${encodeURIComponent(alertId)}`),

  // Weekly digests, newest first.
  digests: (childId, { cursor, limit } = {}) => request('GET', `${kid(childId)}/digests${qs({ cursor, limit })}`),
  digest: (childId, weekStart) => request('GET', `${kid(childId)}/digests/${encodeURIComponent(weekStart)}`),

  // Controls (a full PUT guarded by the etag), nudges and goals.
  controls: (childId) => request('GET', `${kid(childId)}/controls`),
  putControls: (childId, body, etag) => request('PUT', `${kid(childId)}/controls`, { body, headers: ifMatch(etag) }),
  nudges: (childId) => request('GET', `${kid(childId)}/nudges`),
  addNudge: (childId, body) => request('POST', `${kid(childId)}/nudges`, { body, headers: { 'idempotency-key': newKey() } }),
  cancelNudge: (childId, nudgeId) => request('DELETE', `${kid(childId)}/nudges/${encodeURIComponent(nudgeId)}`),
  goals: (childId) => request('GET', `${kid(childId)}/goals`),
  setGoals: (childId, focuses) => request('PUT', `${kid(childId)}/goals`, { body: { focuses } }),
};

// The toy socket a browser Buddy connects to.
export function deviceSocketUrl(origin = globalThis.location?.origin ?? '') {
  return `${String(origin).replace(/^http/, 'ws')}${BASE}/device`;
}
