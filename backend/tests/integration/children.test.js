import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, createChild } from '../helpers/fixtures.js';

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

test('create and list children in creation order', async () => {
  const p = await registerParent(api);
  const a = await createChild(api, p.token, { name: 'An', birth_year: 2019 });
  const b = await createChild(api, p.token, { name: 'Bình', birth_year: 2021 });
  assert.equal(a.name, 'An');
  assert.equal(a.birth_year, 2019);

  const list = await api('GET', '/api/children', { token: p.token });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.children.map((c) => c.id), [a.id, b.id]);
  assert.equal(list.body.children[0].family_id, undefined);
});

test('another family cannot see these children', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  await createChild(api, p1.token);
  const list = await api('GET', '/api/children', { token: p2.token });
  assert.deepEqual(list.body.children, []);
});

test('validation: name bounds and birth_year range', async () => {
  const p = await registerParent(api);
  const noName = await api('POST', '/api/children', { token: p.token, body: { name: '   ', birth_year: 2020 } });
  assert.equal(noName.status, 400);
  assert.deepEqual(noName.body.error.details.map((d) => d.field), ['name']);

  const badYear = await api('POST', '/api/children', { token: p.token, body: { name: 'X', birth_year: 1999 } });
  assert.equal(badYear.status, 400);
  assert.deepEqual(badYear.body.error.details.map((d) => d.field), ['birth_year']);

  const noAuth = await api('POST', '/api/children', { body: { name: 'X', birth_year: 2020 } });
  assert.equal(noAuth.status, 401);
});
