import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, simFor } from '../helpers/fixtures.js';
import { attachStream, openSocketCount, CLOSE_BLOCKED } from '../../ws/stream.js';
import * as registry from '../../devices/registry.js';
import redis from '../../store/redis.js';
import { pool } from '../../store/db.js';
import { logOptions } from '../../lib/log.js';

let srv;
let api;

before(async () => {
  await setupDb();
  srv = await startTestServer({ attach: attachStream });
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

const nowSec = () => Math.floor(Date.now() / 1000);

async function activeDevice() {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  return { p, d, sim: await simFor(d, srv.baseUrl) };
}

test('GET /v1/time is unauthenticated and returns integer seconds', async () => {
  const res = await api('GET', '/v1/time');
  assert.equal(res.status, 200);
  assert.ok(Number.isInteger(res.body.server_time));
  assert.ok(Math.abs(res.body.server_time - nowSec()) <= 2);
});

test('a valid signed heartbeat is accepted and updates last_seen and firmware', async () => {
  const { d, sim } = await activeDevice();
  const res = await sim.heartbeat({ firmware_version: '1.2.3', uptime_s: 42 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'active');
  assert.equal(res.body.heartbeat_interval_s, 60);
  assert.ok(Number.isInteger(res.body.server_time));

  const row = await pool.query('SELECT last_seen_at, firmware_version FROM devices WHERE id = $1', [d.id]);
  assert.ok(row.rows[0].last_seen_at);
  assert.equal(row.rows[0].firmware_version, '1.2.3');
});

test('unclaimed and disabled devices can heartbeat and learn their status; revoked cannot', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const sim = await simFor(d, srv.baseUrl);

  let res = await sim.heartbeat();
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'provisioned');
  assert.equal(res.body.heartbeat_interval_s, 5);

  await claimDevice(api, p.token, d.claimCode);
  await registry.disable({ deviceId: d.id, familyId: p.familyId, by: 'parent' });
  res = await sim.heartbeat();
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'disabled');

  await registry.revoke({ deviceId: d.id, reason: 'lost' });
  res = await sim.heartbeat();
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'device_revoked');
  assert.ok(Number.isInteger(res.body.error.server_time));
});

test('a flipped signature character is rejected and no nonce is stored', async () => {
  const { d, sim } = await activeDevice();
  const signed = sim.sign({ method: 'POST', path: '/v1/heartbeat', body: Buffer.from('{}') });
  const badSig = (signed.sig[0] === 'a' ? 'b' : 'a') + signed.sig.slice(1);
  const res = await fetch(`${srv.baseUrl}/v1/heartbeat`, {
    method: 'POST',
    headers: { ...signed.headers, 'x-lb-sig': badSig, 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, 'auth_bad_signature');
  assert.equal(await redis.exists(`dev:nonce:${d.id}:${signed.nonce}`), 0);
});

test('missing or malformed auth values are auth_missing', async () => {
  const { sim } = await activeDevice();
  const cases = [
    { 'x-lb-device': '' },
    { 'x-lb-nonce': 'abc' },
    { 'x-lb-ts': 'soon' },
    { 'x-lb-sig': 'zz' },
  ];
  for (const override of cases) {
    const res = await sim.request('POST', '/v1/heartbeat', {}, { headersOverride: override });
    assert.equal(res.status, 401, JSON.stringify(override));
    assert.equal(res.body.error.code, 'auth_missing');
  }
  const bare = await api('POST', '/v1/heartbeat', { body: {} });
  assert.equal(bare.status, 401);
  assert.equal(bare.body.error.code, 'auth_missing');
});

test('timestamps outside the 300 s window are rejected with server_time; inside is fine', async () => {
  const { d } = await activeDevice();
  const stale = await simFor(d, srv.baseUrl, { clockOffsetS: -400 });
  const res = await stale.heartbeat();
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'auth_ts_skew');
  assert.ok(Math.abs(res.body.error.server_time - nowSec()) <= 2);

  const drifted = await simFor(d, srv.baseUrl, { clockOffsetS: -200 });
  assert.equal((await drifted.heartbeat()).status, 200);
  const ahead = await simFor(d, srv.baseUrl, { clockOffsetS: 400 });
  assert.equal((await ahead.heartbeat()).body.error.code, 'auth_ts_skew');
});

test('a replayed nonce is rejected and the nonce key has the configured TTL', async () => {
  const { d } = await activeDevice();
  const nonce = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const sim = await simFor(d, srv.baseUrl, { nonceFn: () => nonce });
  assert.equal((await sim.heartbeat()).status, 200);
  const replay = await sim.heartbeat();
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, 'auth_replay');
  const ttl = await redis.ttl(`dev:nonce:${d.id}:${nonce}`);
  assert.ok(ttl > 890 && ttl <= 900, `ttl ${ttl}`);
});

test('unknown device id and tampered body are rejected', async () => {
  const { sim } = await activeDevice();
  const ghost = await simFor({ id: '00000000-0000-4000-8000-000000000000', secretHex: 'ab'.repeat(32) }, srv.baseUrl);
  const unknown = await ghost.heartbeat();
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.code, 'auth_unknown_device');

  const tampered = await sim.request('POST', '/v1/heartbeat', { uptime_s: 1 }, { bodyOverride: '{"uptime_s":2}' });
  assert.equal(tampered.status, 401);
  assert.equal(tampered.body.error.code, 'auth_bad_signature');
});

test('after rotation the old secret works until the grace period ends', async () => {
  const { d, sim: oldSim } = await activeDevice();
  const rotated = await registry.rotateSecret({ deviceId: d.id });
  const newSim = await simFor({ id: d.id, secretHex: rotated.secret_hex }, srv.baseUrl);
  assert.equal((await oldSim.heartbeat()).status, 200);
  assert.equal((await newSim.heartbeat()).status, 200);

  await pool.query(`UPDATE devices SET secret_prev_expires_at = now() - interval '1 second' WHERE id = $1`, [d.id]);
  assert.equal((await oldSim.heartbeat()).body.error.code, 'auth_bad_signature');
  assert.equal((await newSim.heartbeat()).status, 200);
});

test('after 30 failures in a minute the device id is rate limited without touching the database', async () => {
  const { d } = await activeDevice();
  const wrong = await simFor({ id: d.id, secretHex: 'cd'.repeat(32) }, srv.baseUrl);
  for (let i = 0; i < 30; i += 1) {
    const res = await wrong.heartbeat();
    assert.equal(res.body.error.code, 'auth_bad_signature', `attempt ${i + 1}`);
  }
  const original = pool.query;
  let queries = 0;
  pool.query = function counted(...args) {
    queries += 1;
    return original.apply(this, args);
  };
  try {
    const blocked = await wrong.heartbeat();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'rate_limited');
    assert.equal(queries, 0);
    const good = await simFor(d, srv.baseUrl);
    assert.equal((await good.heartbeat()).status, 429, 'the real device is locked out too until the window passes');
  } finally {
    pool.query = original;
  }
});

test('auth failures log the device id and code, never the signature or nonce', async () => {
  const { d } = await activeDevice();
  const lines = [];
  const saved = { ...logOptions };
  logOptions.level = 'warn';
  logOptions.write = (line) => lines.push(JSON.parse(line));
  try {
    const wrong = await simFor({ id: d.id, secretHex: 'ef'.repeat(32) }, srv.baseUrl);
    await wrong.heartbeat();
  } finally {
    Object.assign(logOptions, saved);
  }
  const line = lines.find((l) => l.event === 'device_auth_failed');
  assert.ok(line);
  assert.equal(line.device_id, d.id);
  assert.equal(line.code, 'auth_bad_signature');
  assert.equal(line.sig, undefined);
  assert.equal(line.nonce, undefined);
});

test('WebSocket upgrade: any non-revoked toy connects; query and header forms both work', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const sim = await simFor(d, srv.baseUrl);

  // Unclaimed toys get a socket too; the gate answers per turn (turns_stream tests).
  const early = await sim.openStream();
  assert.equal(early.ready.device_id, d.id);
  early.ws.close();
  await new Promise((resolve) => early.ws.once('close', resolve));

  await claimDevice(api, p.token, d.claimCode);
  const { ws, ready } = await sim.openStream();
  assert.equal(ready.device_id, d.id);
  assert.ok(Number.isInteger(ready.server_time));
  assert.equal(openSocketCount(d.id), 1);

  const pong = await new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    ws.send(JSON.stringify({ type: 'ping' }));
  });
  assert.equal(pong.type, 'pong');
  ws.send(Buffer.alloc(640));
  ws.close();
  await new Promise((resolve) => ws.once('close', resolve));

  const viaHeaders = await sim.openStream({ useHeaders: true });
  viaHeaders.ws.close();
  await new Promise((resolve) => viaHeaders.ws.once('close', resolve));
  // The client sees its own close before the server has processed it.
  await waitFor(() => openSocketCount(d.id) === 0);
});

async function waitFor(check, { timeoutMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('WebSocket upgrade rejections: bad signature, revoked device, stray path', async () => {
  const { d, sim } = await activeDevice();

  await assert.rejects(sim.openStream({ signedPath: '/v1/stream?x=1' }), (err) => err.status === 401 && err.body.error.code === 'auth_bad_signature');

  await registry.revoke({ deviceId: d.id, reason: 'lost' });
  await assert.rejects(sim.openStream(), (err) => err.status === 403 && err.body.error.code === 'device_revoked');

  const { default: WebSocket } = await import('ws');
  await assert.rejects(
    new Promise((resolve, reject) => {
      const stray = new WebSocket(`${srv.wsUrl}/api/whatever`);
      stray.on('open', resolve);
      stray.on('error', reject);
    }),
  );
});

test('the kill switch closes an open stream with code 4003', async () => {
  const { d, p, sim } = await activeDevice();
  const { ws } = await sim.openStream();
  const closed = new Promise((resolve) => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: { reason: 'bedtime' } });
  const result = await closed;
  assert.equal(result.code, CLOSE_BLOCKED);
  assert.equal(result.reason, 'disabled');
  assert.equal(openSocketCount(d.id), 0);
});
