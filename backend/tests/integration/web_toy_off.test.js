// WEB_TOY=off must be set before config.js is first imported, which is why
// everything below is a dynamic import.
process.env.WEB_TOY = 'off';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { setupDb, teardownDb, resetDb, resetRedis } = await import('../helpers/db.js');
const { startTestServer } = await import('../helpers/app.js');
const { registerParent, provisionDevice, claimDevice } = await import('../helpers/fixtures.js');
const { pool } = await import('../../store/db.js');

let srv;
let api;

before(async () => {
  await setupDb();
  srv = await startTestServer();
  api = srv.api;
});

beforeEach(async () => {
  await resetDb();
  await resetRedis();
});

after(async () => {
  await srv.close();
  await teardownDb();
});

test('with the web toy off, /api/me says so and no secret is revealed', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);

  const me = await api('GET', '/api/me', { token: p.token });
  assert.equal(me.body.web_toy, false);

  const res = await api('POST', `/api/devices/${d.id}/secret`, { token: p.token });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'web_toy_disabled');
  assert.equal(res.body.secret_hex, undefined);
  const row = await pool.query('SELECT secret_revealed_at FROM devices WHERE id = $1', [d.id]);
  assert.equal(row.rows[0].secret_revealed_at, null);
});
