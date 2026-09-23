import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, claimDevice, simFor } from '../helpers/fixtures.js';
import { attachStream, CLOSE_BLOCKED } from '../../ws/stream.js';
import * as registry from '../../devices/registry.js';
import * as ledgerStore from '../../store/ledger.js';
import * as turnsService from '../../turns/service.js';
import { pool } from '../../store/db.js';
import { DENIALS } from '../../gate/ask_gate.js';

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

async function activeToy() {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode);
  const sim = await simFor(d, srv.baseUrl);
  return { p, d, sim };
}

const balanceOf = (familyId) => ledgerStore.balance(pool, familyId);
const debitsFor = async (turnId) => (await pool.query(`SELECT delta FROM credit_ledger WHERE turn_id = $1 AND kind = 'debit'`, [turnId])).rows;
const turnRow = async (id) => (await pool.query('SELECT status, denied_reason, audio_frames, answer_text, emotion, conversation_id FROM turns WHERE id = $1', [id])).rows[0];
const turnsOf = async (familyId) => (await pool.query('SELECT status, denied_reason, conversation_id FROM turns WHERE family_id = $1 ORDER BY started_at', [familyId])).rows;
const closeWs = (ws) => new Promise((resolve) => { ws.once('close', resolve); ws.close(); });

async function waitFor(check, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('an unclaimed toy connects and is turned away kindly, with no turn row', async () => {
  const d = await provisionDevice();
  const sim = await simFor(d, srv.baseUrl);
  const { ws } = await sim.openStream();
  const reply = await sim.turnStart(ws);
  assert.deepEqual(reply, { type: 'turn_denied', ...DENIALS.not_claimed, conversation_open: false });
  assert.equal(reply.reason, undefined);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM turns')).rows[0].n, 0);
  await closeWs(ws);
});

test('a paused toy and a toy with no credits get the same sleepy answer; the parent sees the difference', async () => {
  const { p, d, sim } = await activeToy();
  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: { reason: 'nap' } });
  let { ws } = await sim.openStream();
  const paused = await sim.turnStart(ws);
  assert.equal(paused.emotion, 'sleepy');
  await closeWs(ws);

  await api('POST', `/api/devices/${d.id}/enable`, { token: p.token });
  await ledgerStore.insert(pool, { familyId: p.familyId, kind: 'expiry', delta: -10, actorKind: 'system', reason: 'test' });
  assert.equal(await balanceOf(p.familyId), 0);
  ({ ws } = await sim.openStream());
  const broke = await sim.turnStart(ws);
  assert.deepEqual(broke, paused);
  await closeWs(ws);

  const rows = await turnsOf(p.familyId);
  assert.deepEqual(rows.map((r) => [r.status, r.denied_reason, r.conversation_id]), [['denied', 'disabled', null], ['denied', 'no_credits', null]]);
  const list = await api('GET', '/api/turns', { token: p.token });
  assert.deepEqual(list.body.turns.map((t) => t.denied_reason), ['no_credits', 'disabled']);
  assert.equal(list.body.turns[0].device_serial, d.serial);
});

test('a full turn: accepted, frames, answer, done, debited exactly once', async () => {
  const { p, d, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  assert.equal(accepted.type, 'turn_accepted');
  assert.equal(accepted.emotion, 'listening');
  assert.match(accepted.turn_id, /^[0-9a-f-]{36}$/);

  sim.sendFrames(ws, 5);
  const { answer, done } = await sim.turnEnd(ws);
  assert.equal(answer.type, 'answer');
  assert.equal(answer.turn_id, accepted.turn_id);
  assert.equal(answer.emotion, 'happy');
  assert.equal(typeof answer.say, 'string');
  assert.deepEqual(done, { type: 'turn_done', turn_id: accepted.turn_id, status: 'completed' });

  const row = await turnRow(accepted.turn_id);
  assert.equal(row.status, 'completed');
  assert.equal(row.audio_frames, 5);
  assert.equal(row.answer_text, answer.say);
  assert.deepEqual(await debitsFor(accepted.turn_id), [{ delta: -1 }]);
  assert.equal(await balanceOf(p.familyId), 9);

  const again = await sim.turnEnd(ws);
  assert.equal(again.error.code, 'no_turn');
  assert.equal((await debitsFor(accepted.turn_id)).length, 1);
  assert.equal(await balanceOf(p.familyId), 9);

  const wallet = await api('GET', '/api/wallet', { token: p.token });
  assert.equal(wallet.body.balance, 9);
  assert.equal(wallet.body.ledger[0].kind, 'debit');
  assert.equal(wallet.body.ledger[0].turn_id, accepted.turn_id);
  const turnsList = await api('GET', '/api/turns', { token: p.token });
  assert.equal(turnsList.body.turns[0].status, 'completed');
  assert.equal(turnsList.body.turns[0].device_serial, d.serial);
  await closeWs(ws);
});

test('a second press during a turn is refused; cancel releases the credit without charging', async () => {
  const { p, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const dup = await sim.turnStart(ws);
  assert.deepEqual(dup, { type: 'error', code: 'turn_in_flight' });

  const cancelled = await sim.turnCancel(ws);
  assert.deepEqual(cancelled, { type: 'turn_done', turn_id: accepted.turn_id, status: 'abandoned' });
  assert.equal((await turnRow(accepted.turn_id)).status, 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);
  assert.equal(await balanceOf(p.familyId), 10);
  assert.equal((await sim.turnCancel(ws)).code, 'no_turn');
  await closeWs(ws);
});

test('closing the socket mid-turn abandons it; the next socket is admitted', async () => {
  const { p, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  await closeWs(ws);
  await waitFor(async () => (await turnRow(accepted.turn_id)).status === 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);

  const next = await sim.openStream();
  const again = await sim.turnStart(next.ws);
  assert.equal(again.type, 'turn_accepted');
  assert.equal(await balanceOf(p.familyId), 10);
  await closeWs(next.ws);
});

test('the kill switch mid-turn closes with 4003, abandons the turn and charges nothing', async () => {
  const { p, d, sim } = await activeToy();
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const closed = new Promise((resolve) => ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: {} });
  assert.deepEqual(await closed, { code: CLOSE_BLOCKED, reason: 'disabled' });
  await waitFor(async () => (await turnRow(accepted.turn_id)).status === 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);
  assert.equal(await balanceOf(p.familyId), 10);
});

test('two toys racing on the last credit: exactly one is admitted', async () => {
  const p = await registerParent(api);
  const a = await provisionDevice();
  const b = await provisionDevice();
  await claimDevice(api, p.token, a.claimCode);
  await claimDevice(api, p.token, b.claimCode);
  await ledgerStore.insert(pool, { familyId: p.familyId, kind: 'expiry', delta: -9, actorKind: 'system', reason: 'test' });
  assert.equal(await balanceOf(p.familyId), 1);

  const simA = await simFor(a, srv.baseUrl);
  const simB = await simFor(b, srv.baseUrl);
  const [{ ws: wsA }, { ws: wsB }] = await Promise.all([simA.openStream(), simB.openStream()]);
  const [ra, rb] = await Promise.all([simA.turnStart(wsA), simB.turnStart(wsB)]);
  const types = [ra.type, rb.type].sort();
  assert.deepEqual(types, ['turn_accepted', 'turn_denied']);
  const denied = ra.type === 'turn_denied' ? ra : rb;
  assert.equal(denied.emotion, 'sleepy');

  const winner = ra.type === 'turn_accepted' ? { sim: simA, ws: wsA, r: ra } : { sim: simB, ws: wsB, r: rb };
  const { done } = await winner.sim.turnEnd(winner.ws);
  assert.equal(done.status, 'completed');
  assert.equal(await balanceOf(p.familyId), 0);
  assert.equal((await pool.query(`SELECT count(*)::int AS n FROM credit_ledger WHERE kind = 'debit'`)).rows[0].n, 1);
  await Promise.all([closeWs(wsA), closeWs(wsB)]);
});

test('turns within the idle window share a conversation; later ones start a new one', async () => {
  const { sim } = await activeToy();
  const { ws } = await sim.openStream();
  const t1 = await sim.turnStart(ws);
  await sim.turnEnd(ws);
  const t2 = await sim.turnStart(ws);
  await sim.turnEnd(ws);
  const c1 = (await turnRow(t1.turn_id)).conversation_id;
  assert.equal((await turnRow(t2.turn_id)).conversation_id, c1);

  await pool.query(`UPDATE conversations SET last_turn_at = now() - interval '6 minutes' WHERE id = $1`, [c1]);
  const t3 = await sim.turnStart(ws);
  await sim.turnEnd(ws);
  assert.notEqual((await turnRow(t3.turn_id)).conversation_id, c1);
  await closeWs(ws);
});

test('stale accepted rows neither reserve a credit nor survive the sweep', async () => {
  const { p, sim } = await activeToy();
  await ledgerStore.insert(pool, { familyId: p.familyId, kind: 'expiry', delta: -9, actorKind: 'system', reason: 'test' });
  const { ws } = await sim.openStream();
  const t = await sim.turnStart(ws);
  assert.equal(t.type, 'turn_accepted');
  // Simulate a crash that left the row behind long ago.
  await pool.query(`UPDATE turns SET started_at = now() - interval '10 minutes' WHERE id = $1`, [t.turn_id]);
  const other = await sim.openStream();
  const fresh = await sim.turnStart(other.ws);
  assert.equal(fresh.type, 'turn_accepted', 'the stale row did not hold the last credit');

  assert.equal(await turnsService.sweepStale(), 1);
  assert.equal((await turnRow(t.turn_id)).status, 'abandoned');
  // The stale turn cannot be completed and charged any more.
  const late = await sim.turnEnd(ws);
  assert.equal(late.done.status, 'abandoned');
  assert.deepEqual(await debitsFor(t.turn_id), []);
  await Promise.all([closeWs(ws), closeWs(other.ws)]);
});
