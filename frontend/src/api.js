import * as session from './session.js';
import { append } from './log.js';

export class ApiError extends Error {
  constructor(status, body, retryAfter = null) {
    super(body?.error?.message || `HTTP ${status}`);
    this.status = status;
    this.code = body?.error?.code ?? (status === 0 ? 'network_error' : 'http_error');
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

function parse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text };
  }
}

// One fetch wrapper for all three lanes. Every call is logged; the parent
// lane gets one silent refresh-and-retry when the access token has expired,
// which is what the real dashboard will do too.
export async function call(method, path, opts = {}) {
  const { body, bodyText, auth = null, headers = {}, logPath, redact, _retried = false } = opts;
  const h = { ...headers };
  const payload = bodyText !== undefined ? bodyText : body !== undefined ? JSON.stringify(body) : undefined;
  if (payload !== undefined) h['content-type'] = 'application/json';

  const s = session.get();
  if (auth === 'parent' && s.parent) h.authorization = `Bearer ${s.parent.accessToken}`;
  if (auth === 'admin' && s.admin) h.authorization = `Bearer ${s.admin}`;

  const t0 = performance.now();
  let res;
  let json = null;
  try {
    res = await fetch(path, { method, headers: h, body: payload });
    json = parse(await res.text());
  } catch (err) {
    append({ method, path: logPath ?? path, status: 0, ms: Math.round(performance.now() - t0), req: body ?? parse(bodyText), res: { network_error: err.message } });
    throw new ApiError(0, { error: { code: 'network_error', message: err.message } });
  }
  const ms = Math.round(performance.now() - t0);
  const retryAfter = res.headers.get('retry-after');
  append({ method, path: logPath ?? path, status: res.status, ms, req: body ?? (bodyText !== undefined ? parse(bodyText) : undefined), res: redact ? redact(json) : json, retryAfter });

  if (res.status === 401 && json?.error?.code === 'token_expired' && auth === 'parent' && !_retried && s.parent?.refreshToken) {
    await refreshSession();
    return call(method, path, { ...opts, _retried: true });
  }
  if (!res.ok) throw new ApiError(res.status, json, retryAfter);
  return json;
}

// reuseOld sends the refresh token that was already rotated away, to show
// the backend revoking the whole chain (refresh_token_reused).
export async function refreshSession({ reuseOld = false } = {}) {
  const s = session.get();
  const token = reuseOld ? s.prevRefreshToken : s.parent?.refreshToken;
  if (!token) throw new ApiError(0, { error: { code: 'no_refresh_token', message: 'no refresh token to send' } });
  try {
    const out = await call('POST', '/api/auth/refresh', { body: { refresh_token: token } });
    session.set({ prevRefreshToken: s.parent?.refreshToken ?? null });
    session.setParentSession(out);
    return out;
  } catch (err) {
    if (err.status === 401) session.clearParentSession();
    throw err;
  }
}

export const health = () => call('GET', '/healthz');

export const parentApi = {
  async register(body) {
    const out = await call('POST', '/api/auth/register', { body });
    session.set({ prevRefreshToken: null });
    session.setParentSession(out);
    return out;
  },
  async login(body) {
    const out = await call('POST', '/api/auth/login', { body });
    session.set({ prevRefreshToken: null });
    session.setParentSession(out);
    return out;
  },
  refresh: refreshSession,
  async logout() {
    const token = session.get().parent?.refreshToken;
    if (token) await call('POST', '/api/auth/logout', { body: { refresh_token: token } });
    session.clearParentSession();
  },
  me: () => call('GET', '/api/me', { auth: 'parent' }),
  listChildren: () => call('GET', '/api/children', { auth: 'parent' }),
  addChild: (body) => call('POST', '/api/children', { auth: 'parent', body }),
  claim: (body) => call('POST', '/api/devices/claim', { auth: 'parent', body }),
  listDevices: () => call('GET', '/api/devices', { auth: 'parent' }),
  setChild: (id, childId) => call('PATCH', `/api/devices/${id}`, { auth: 'parent', body: { child_id: childId } }),
  disable: (id, reason) => call('POST', `/api/devices/${id}/disable`, { auth: 'parent', body: reason ? { reason } : {} }),
  enable: (id) => call('POST', `/api/devices/${id}/enable`, { auth: 'parent' }),
  unpair: (id) => call('DELETE', `/api/devices/${id}`, { auth: 'parent' }),
  wallet: () => call('GET', '/api/wallet', { auth: 'parent' }),
  turns: (limit = 30) => call('GET', `/api/turns?limit=${limit}`, { auth: 'parent' }),
  packs: () => call('GET', '/api/credit-packs', { auth: 'parent' }),
  purchases: () => call('GET', '/api/purchases?limit=10', { auth: 'parent' }),
  createPurchase: (body) => call('POST', '/api/purchases', { auth: 'parent', body }),
  demoPay: (id, outcome) => call('POST', `/api/purchases/${id}/demo-pay`, { auth: 'parent', body: { outcome } }),
};

// A reissued claim code is shown once in the UI and never lands in the log,
// matching the backend rule that claim codes never reach a logger.
const redactClaimCode = (json) => (json?.claim_code ? { ...json, claim_code: '[shown once in the admin lane]' } : json);

export const adminApi = {
  batches: () => call('GET', '/admin/batches', { auth: 'admin' }),
  devices: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));
    return call('GET', `/admin/devices${qs.size ? `?${qs}` : ''}`, { auth: 'admin' });
  },
  disable: (id, reason) => call('POST', `/admin/devices/${id}/disable`, { auth: 'admin', body: { reason } }),
  enable: (id) => call('POST', `/admin/devices/${id}/enable`, { auth: 'admin' }),
  revoke: (id, reason) => call('POST', `/admin/devices/${id}/revoke`, { auth: 'admin', body: { reason } }),
  reissue: (id) => call('POST', `/admin/devices/${id}/reissue-claim-code`, { auth: 'admin', redact: redactClaimCode }),
  grantCredits: (familyId, body) => call('POST', `/admin/families/${familyId}/credits`, { auth: 'admin', body }),
  wallet: (familyId) => call('GET', `/admin/families/${familyId}/wallet`, { auth: 'admin' }),
};
