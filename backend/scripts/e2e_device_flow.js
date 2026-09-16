// A simulated toy through its whole life, against the real dev stores:
// provision, heartbeat while unclaimed, refused stream, claim from the
// dashboard side, heartbeat, live stream, kill switch, unpair. Exits 0 when
// every step matched, 1 on the first mismatch. Cleans up after itself.
import http from 'node:http';
import { createApp } from '../app.js';
import { attachStream, CLOSE_BLOCKED } from '../ws/stream.js';
import { pool } from '../store/db.js';
import * as redisStore from '../store/redis.js';
import * as registry from '../devices/registry.js';
import { SimDevice } from '../devices/sim_client.js';

const RUN = Date.now().toString(36).toUpperCase();
let failed = false;

async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`ok   ${name}${detail ? `  (${detail})` : ''}`);
  } catch (err) {
    failed = true;
    console.log(`FAIL ${name}: ${err.message}`);
    throw err;
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message);
}

async function api(baseUrl, method, path, { body, token } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

await redisStore.connect();
const server = http.createServer(createApp());
attachStream(server);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

let familyId = null;
let batchLabel = null;

try {
  let token;
  let device;
  let sim;

  await step('register a throwaway parent', async () => {
    const res = await api(baseUrl, 'POST', '/api/auth/register', {
      body: { email: `e2e-${RUN.toLowerCase()}@test.local`, password: 'e2e-password-123', family_name: `E2E ${RUN}` },
    });
    expect(res.status === 201, `status ${res.status}`);
    token = res.body.access_token;
    familyId = res.body.family.id;
  });

  await step('provision one device through the registry', async () => {
    batchLabel = `E2E${RUN.slice(-6)}`;
    const { devices } = await registry.provisionBatch({ label: batchLabel, hardwareRev: 'r1', count: 1, actorId: 'e2e' });
    device = devices[0];
    sim = new SimDevice({ deviceId: device.device_id, secretHex: device.secret_hex, baseUrl });
    return device.serial;
  });

  await step('GET /v1/time answers without auth', async () => {
    const { server_time } = await sim.time();
    expect(Number.isInteger(server_time), 'server_time missing');
  });

  await step('heartbeat while unclaimed reports provisioned and a fast interval', async () => {
    const res = await sim.heartbeat({ firmware_version: '0.0.1-e2e' });
    expect(res.status === 200, `status ${res.status} ${JSON.stringify(res.body)}`);
    expect(res.body.status === 'provisioned', `status ${res.body.status}`);
    return `interval ${res.body.heartbeat_interval_s}s`;
  });

  await step('stream is refused while unclaimed', async () => {
    try {
      await sim.openStream();
    } catch (err) {
      expect(err.status === 403 && err.body?.error?.code === 'device_not_claimed', `got ${err.status} ${JSON.stringify(err.body)}`);
      return;
    }
    throw new Error('upgrade was accepted');
  });

  await step('parent claims the toy with the printed code', async () => {
    const res = await api(baseUrl, 'POST', '/api/devices/claim', { token, body: { claim_code: device.claim_code } });
    expect(res.status === 200, `status ${res.status} ${JSON.stringify(res.body)}`);
    expect(res.body.device.status === 'active', 'not active');
  });

  await step('heartbeat now reports active', async () => {
    const res = await sim.heartbeat();
    expect(res.body.status === 'active', `status ${res.body.status}`);
    return `interval ${res.body.heartbeat_interval_s}s`;
  });

  let ws;
  await step('stream opens, answers ping, accepts audio frames', async () => {
    const opened = await sim.openStream();
    ws = opened.ws;
    const pong = await new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send(JSON.stringify({ type: 'ping' }));
    });
    expect(pong.type === 'pong', `got ${pong.type}`);
    for (let i = 0; i < 3; i += 1) ws.send(Buffer.alloc(640));
  });

  await step('parent disables the toy and the open stream closes with 4003', async () => {
    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    const res = await api(baseUrl, 'POST', `/api/devices/${device.device_id}/disable`, { token, body: { reason: 'e2e' } });
    expect(res.status === 200, `status ${res.status}`);
    const code = await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('stream did not close')), 3000))]);
    expect(code === CLOSE_BLOCKED, `close code ${code}`);
  });

  await step('heartbeat reports disabled; stream is refused', async () => {
    const res = await sim.heartbeat();
    expect(res.body.status === 'disabled', `status ${res.body.status}`);
    try {
      await sim.openStream();
    } catch (err) {
      expect(err.body?.error?.code === 'device_disabled', `got ${JSON.stringify(err.body)}`);
      return;
    }
    throw new Error('upgrade was accepted');
  });

  await step('parent unpairs the toy', async () => {
    const res = await api(baseUrl, 'DELETE', `/api/devices/${device.device_id}`, { token });
    expect(res.status === 204, `status ${res.status}`);
    const hb = await sim.heartbeat();
    expect(hb.body.status === 'provisioned', `status ${hb.body.status}`);
  });
} catch {
  // already reported by step()
} finally {
  try {
    if (familyId) await pool.query('DELETE FROM families WHERE id = $1', [familyId]);
    if (batchLabel) {
      await pool.query('DELETE FROM devices WHERE batch_id IN (SELECT id FROM device_batches WHERE label = $1)', [batchLabel]);
      await pool.query('DELETE FROM device_batches WHERE label = $1', [batchLabel]);
    }
  } catch (err) {
    console.log(`cleanup failed: ${err.message}`);
  }
  await new Promise((resolve) => server.close(resolve));
  await redisStore.close();
  await pool.end();
}

console.log(failed ? '\ne2e: FAILED' : '\ne2e: all steps passed');
process.exitCode = failed ? 1 : 0;
