// Must be set before config.js is first imported, hence the dynamic imports.
process.env.PAYMENT_PROVIDER = 'disabled';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { setupDb, teardownDb } = await import('../helpers/db.js');
const { startTestServer } = await import('../helpers/app.js');
const { registerParent } = await import('../helpers/fixtures.js');

let srv;

before(async () => {
  await setupDb();
  srv = await startTestServer();
});

after(async () => {
  await srv.close();
  await teardownDb();
});

test('with payments disabled, packs are still listed but nothing can be bought', async () => {
  const p = await registerParent(srv.api);
  assert.equal((await srv.api('GET', '/api/credit-packs', { token: p.token })).status, 200);
  const res = await srv.api('POST', '/api/purchases', { token: p.token, body: { pack_id: 'starter' } });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'payments_disabled');
});
