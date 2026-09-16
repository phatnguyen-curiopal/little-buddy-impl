import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';

let srv;

before(async () => {
  await setupDb();
  srv = await startTestServer();
});

after(async () => {
  await srv.close();
  await teardownDb();
});

test('GET /healthz reports both stores up', async () => {
  const res = await srv.api('GET', '/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual({ ok: res.body.ok, pg: res.body.pg, redis: res.body.redis }, { ok: true, pg: 'ok', redis: 'ok' });
  assert.equal(typeof res.body.uptime_s, 'number');
});

test('every response carries a uuid x-request-id', async () => {
  const res = await srv.api('GET', '/healthz');
  assert.match(res.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('unknown routes return the standard error shape', async () => {
  const res = await srv.api('GET', '/does-not-exist');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: { code: 'not_found', message: 'route not found' } });
});
