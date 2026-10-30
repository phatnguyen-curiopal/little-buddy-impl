import { test } from 'node:test';
import assert from 'node:assert/strict';

// api.js reads storage as it loads, so the browser's storage and fetch are
// stood in for before it is imported (node --test runs each file in its own
// process, so nothing leaks into the other tests).
const store = new Map([['lb-web-refresh', 'first-backend-token'], ['lb-web-refresh-v2', 'v2-token']]);
const calls = [];
let answer = () => new Response(null, { status: 204 });
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  },
});
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return answer();
};
const { api, ApiError, hasSession } = await import('../src/lib/api.js');

test("the first backend's refresh token is revoked there and dropped, once", () => {
  assert.equal(store.has('lb-web-refresh'), false);
  const logouts = calls.filter((c) => c.url === '/api/auth/logout');
  assert.equal(logouts.length, 1);
  const { init } = logouts[0];
  assert.equal(init.method, 'POST');
  assert.equal(init.keepalive, true);
  assert.equal(init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { refresh_token: 'first-backend-token' });
});

test('the backend-v2 session is left alone', () => {
  assert.equal(store.get('lb-web-refresh-v2'), 'v2-token');
  assert.equal(hasSession(), true);
});

test('a 429 carries its Retry-After as whole seconds, or null', async () => {
  const cases = [['720', 720], ['1', 1], ['2.2', 3], [null, null], ['0', null], ['-5', null], ['soon', null], ['Wed, 21 Oct 2026 07:28:00 GMT', null]];
  for (const [header, want] of cases) {
    answer = () => new Response(JSON.stringify({ type: '/problems/rate-limited', title: 'Too many attempts', status: 429 }), {
      status: 429,
      headers: header === null ? {} : { 'retry-after': header },
    });
    const err = await api.login({ email: 'parent@example.com', password: 'secret-pass' }).catch((e) => e);
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'rate_limited');
    assert.equal(err.retryAfter, want, `Retry-After ${header}`);
  }
});

test('an error without Retry-After has none', async () => {
  answer = () => new Response(JSON.stringify({ type: '/problems/invalid-credentials', title: 'Wrong email or password', status: 401 }), { status: 401 });
  const err = await api.login({ email: 'parent@example.com', password: 'secret-pass' }).catch((e) => e);
  assert.equal(err.code, 'invalid_credentials');
  assert.equal(err.retryAfter, null);
});
