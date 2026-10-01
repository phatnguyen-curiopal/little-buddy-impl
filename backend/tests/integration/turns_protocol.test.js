import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, createChild, simFor } from '../helpers/fixtures.js';
import { attachStream, MAX_PAYLOAD } from '../../ws/stream.js';
import * as ledgerStore from '../../store/ledger.js';
import { pool } from '../../store/db.js';
import { DENIALS } from '../../gate/ask_gate.js';
import config from '../../config.js';

// The protocol additions for the web toy, against the mock pipeline: typed
// turns, audio buffering limits, no-speech, "new conversation", and the
// conversation language of the canned lines.

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

async function activeToy({ childId } = {}) {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode, childId);
  const sim = await simFor(d, srv.baseUrl);
  return { p, d, sim };
}

const balanceOf = (familyId) => ledgerStore.balance(pool, familyId);
const turnRow = async (id) => (await pool.query('SELECT status, audio_frames, conversation_id FROM turns WHERE id = $1', [id])).rows[0];
const debitsFor = async (turnId) => (await pool.query(`SELECT delta FROM credit_ledger WHERE turn_id = $1 AND kind = 'debit'`, [turnId])).rows;
const closeWs = (ws) => new Promise((resolve) => { ws.once('close', resolve); ws.close(); });
const pong = (ws) => new Promise((resolve) => {
  const on = (data, isBinary) => {
    if (isBinary) return;
    const msg = JSON.parse(data.toString());
    if (msg.type !== 'pong') return;
    ws.off('message', on);
    resolve(msg);
  };
  ws.on('message', on);
  ws.send(JSON.stringify({ type: 'ping' }));
});

test('a typed turn: heard is the text, audio in that turn is ignored, and it is charged', async () => {
  const { p, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  sim.sendFrames(ws, 5);
  const { answer, done } = await sim.turnEnd(ws, { text: '  Xin chào Buddy  ' });
  assert.equal(answer.heard, 'Xin chào Buddy');
  assert.equal(answer.emotion, 'happy');
  assert.deepEqual(done, { type: 'turn_done', turn_id: accepted.turn_id, status: 'completed' });
  const row = await turnRow(accepted.turn_id);
  assert.equal(row.status, 'completed');
  assert.equal(row.audio_frames, 0);
  assert.equal(await balanceOf(p.familyId), 9);
  await closeWs(ws);
});

test('bad text is refused and leaves the turn open', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  for (const text of ['', '   ', 'x'.repeat(2001), 42, { a: 1 }]) {
    const { error } = await sim.turnEnd(ws, { text });
    assert.deepEqual(error, { type: 'error', code: 'invalid_text' }, JSON.stringify(text));
  }
  const { answer, done } = await sim.turnEnd(ws, { text: 'x'.repeat(2000) });
  assert.equal(answer.heard.length, 2000);
  assert.equal(done.turn_id, accepted.turn_id);
  assert.equal(done.status, 'completed');
  await closeWs(ws);
});

test('audio: frames before turn_accepted and odd-length frames are dropped', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  sim.sendFrames(ws, 3);
  const accepted = await sim.turnStart(ws);
  sim.sendFrames(ws, 4);
  ws.send(Buffer.alloc(641));
  ws.send(Buffer.alloc(1280));
  const { done } = await sim.turnEnd(ws);
  assert.equal(done.status, 'completed');
  assert.equal((await turnRow(accepted.turn_id)).audio_frames, 6);
  await closeWs(ws);
});

test('audio past TURN_MAX_SEC is dropped', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const maxBytes = config.turnMaxSec * 32000;
  const chunk = Buffer.alloc(64000);
  for (let sent = 0; sent <= maxBytes; sent += chunk.length) ws.send(chunk);
  const { done } = await sim.turnEnd(ws);
  assert.equal(done.status, 'completed');
  assert.equal((await turnRow(accepted.turn_id)).audio_frames, maxBytes / 640);
  await closeWs(ws);
});

test('one message is at most 64 KB: exactly that is fine, more closes with 1009', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  ws.send(Buffer.alloc(MAX_PAYLOAD));
  assert.equal((await pong(ws)).type, 'pong');
  const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
  ws.send(Buffer.alloc(MAX_PAYLOAD + 2));
  assert.equal(await closed, 1009);
});

test('a voice turn with no audio at all is no_speech: answered, abandoned, not charged', async () => {
  const { p, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const { answer, done } = await sim.turnEnd(ws);
  assert.equal(answer.emotion, 'confused');
  assert.equal(typeof answer.say, 'string');
  assert.deepEqual(done, { type: 'turn_done', turn_id: accepted.turn_id, status: 'abandoned' });
  assert.equal((await turnRow(accepted.turn_id)).status, 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);
  assert.equal(await balanceOf(p.familyId), 10);
  await closeWs(ws);
});

test('conversation_new ends the open conversation; refused while a turn is open', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  const t1 = await sim.turnStart(ws);
  const busy = await sim.conversationNew(ws);
  assert.deepEqual(busy, { type: 'error', code: 'turn_in_flight' });
  await sim.turnEnd(ws, { text: 'một' });
  const t2 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'hai' });
  const c1 = (await turnRow(t1.turn_id)).conversation_id;
  assert.equal((await turnRow(t2.turn_id)).conversation_id, c1, 'the refused request ended nothing');

  assert.deepEqual(await sim.conversationNew(ws), { type: 'conversation_started' });
  const ended = await pool.query('SELECT ended_at FROM conversations WHERE id = $1', [c1]);
  assert.ok(ended.rows[0].ended_at);
  const t3 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'ba' });
  const c3 = (await turnRow(t3.turn_id)).conversation_id;
  assert.notEqual(c3, c1);
  const t4 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'bốn' });
  assert.equal((await turnRow(t4.turn_id)).conversation_id, c3);
  await closeWs(ws);
});

test('conversation_new on an unclaimed toy is harmless', async () => {
  const d = await provisionDevice();
  const sim = await simFor(d, srv.baseUrl);
  const { ws } = await sim.openStream();
  assert.deepEqual(await sim.conversationNew(ws), { type: 'conversation_started' });
  await closeWs(ws);
});

test('assigning the toy to another child starts a new conversation', async () => {
  const { p, d, sim } = await activeToy();
  const child = await createChild(api, p.token);
  const { ws } = await sim.openStream();
  const t1 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'một' });
  const res = await api('PATCH', `/api/devices/${d.id}`, { token: p.token, body: { child_id: child.id } });
  assert.equal(res.status, 200);
  const t2 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'hai' });
  const t3 = await sim.turnStart(ws);
  await sim.turnEnd(ws, { text: 'ba' });
  const [r1, r2, r3] = await Promise.all([turnRow(t1.turn_id), turnRow(t2.turn_id), turnRow(t3.turn_id)]);
  assert.notEqual(r2.conversation_id, r1.conversation_id);
  assert.equal(r3.conversation_id, r2.conversation_id);
  const conv = await pool.query('SELECT child_id FROM conversations WHERE id = $1', [r2.conversation_id]);
  assert.equal(conv.rows[0].child_id, child.id);
  await closeWs(ws);
});

test('canned lines follow the toy conversation language, and English refusals stay identical', async () => {
  const { p, d, sim } = await activeToy();
  const patched = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { language: 'en' } });
  assert.equal(patched.body.device.profile.language, 'en');

  let { ws } = await sim.openStream();
  await sim.turnStart(ws);
  const { answer } = await sim.turnEnd(ws, { text: 'hello' });
  assert.match(answer.say, /great question/);
  await closeWs(ws);

  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: {} });
  ({ ws } = await sim.openStream());
  const paused = await sim.turnStart(ws);
  assert.deepEqual(paused, { type: 'turn_denied', ...DENIALS.en.disabled, conversation_open: false });
  await closeWs(ws);

  await api('POST', `/api/devices/${d.id}/enable`, { token: p.token });
  await ledgerStore.insert(pool, { familyId: p.familyId, kind: 'expiry', delta: -(await balanceOf(p.familyId)), actorKind: 'system', reason: 'test' });
  ({ ws } = await sim.openStream());
  assert.deepEqual(await sim.turnStart(ws), paused);
  await closeWs(ws);
});
