// PROVIDER_MODE=brain against a stub brain. The stub must be listening, and
// the env set, before config.js is first imported, which is why everything
// from the app is a dynamic import (as in device_auth_off.test.js).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startBrainStub, reply, json, hang, PCM } from '../helpers/brain_stub.js';

const stub = await startBrainStub();
process.env.PROVIDER_MODE = 'brain';
process.env.BRAIN_URL = stub.url;
process.env.BRAIN_TOKEN = 'test-brain-token';
process.env.BRAIN_TIMEOUT_MS = '1500';

const { setupDb, teardownDb, resetDb, resetRedis, DEFAULT_VOICES } = await import('../helpers/db.js');
const { startTestServer } = await import('../helpers/app.js');
const { registerParent, provisionDevice, claimDevice, createChild, simFor, adminHeaders } = await import('../helpers/fixtures.js');
const { attachStream, CLOSE_BLOCKED } = await import('../../ws/stream.js');
const ledgerStore = await import('../../store/ledger.js');
const { pool } = await import('../../store/db.js');
const { FAILED_ANSWERS } = await import('../../gate/ask_gate.js');

const DEFAULT_VOICE = DEFAULT_VOICES.vi;

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
  stub.reset();
});

after(async () => {
  await srv.close();
  await stub.close();
  await teardownDb();
});

async function activeToy({ withChild = false } = {}) {
  const p = await registerParent(api);
  const child = withChild ? await createChild(api, p.token) : null;
  const d = await provisionDevice();
  await claimDevice(api, p.token, d.claimCode, child?.id);
  const sim = await simFor(d, srv.baseUrl);
  return { p, d, child, sim };
}

const balanceOf = (familyId) => ledgerStore.balance(pool, familyId);
const turnRow = async (id) => (await pool.query('SELECT status, emotion, answer_text, audio_frames, conversation_id FROM turns WHERE id = $1', [id])).rows[0];
const debitsFor = async (turnId) => (await pool.query(`SELECT delta FROM credit_ledger WHERE turn_id = $1 AND kind = 'debit'`, [turnId])).rows;
const closeWs = (ws) => new Promise((resolve) => { ws.once('close', resolve); ws.close(); });
const kinds = (msgs) => msgs.map((m) => (Buffer.isBuffer(m) ? `bin:${m.length}` : m.type));

async function waitFor(check, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('a voice turn: PCM body and meta header in, answer then audio then debit out', async () => {
  const { p, d, child, sim } = await activeToy({ withChild: true });
  stub.setHandler((call, res) => json(res, 200, reply({ emotion: 'excited' }, { audioBytes: 40000 })));
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const spoken = PCM(640 * 5, 3);
  for (let i = 0; i < 5; i += 1) ws.send(spoken.subarray(i * 640, (i + 1) * 640));
  const msgs = await sim.endAndCollect(ws);

  assert.deepEqual(kinds(msgs), ['answer', 'audio', 'bin:32000', 'bin:8000', 'audio_end', 'turn_done']);
  assert.deepEqual(msgs[0], { type: 'answer', turn_id: accepted.turn_id, emotion: 'excited', say: 'Mèo con dễ thương quá!', heard: 'con mèo' });
  assert.deepEqual(msgs[1], { type: 'audio', turn_id: accepted.turn_id, rate: 16000, bytes: 40000 });
  assert.ok(Buffer.concat([msgs[2], msgs[3]]).equals(PCM(40000, 7)));
  assert.deepEqual(msgs[4], { type: 'audio_end', turn_id: accepted.turn_id });
  assert.deepEqual(msgs[5], { type: 'turn_done', turn_id: accepted.turn_id, status: 'completed' });

  const call = stub.calls[0];
  assert.equal(call.url, '/v1/turns');
  assert.equal(call.headers.authorization, 'Bearer test-brain-token');
  assert.equal(call.headers['content-type'], 'application/octet-stream');
  assert.ok(call.body.equals(spoken), 'the exact PCM bytes reach the brain');
  const row = await turnRow(accepted.turn_id);
  assert.deepEqual(call.meta, {
    turn_id: accepted.turn_id,
    conversation_id: row.conversation_id,
    device_id: d.id,
    subject: `child:${child.id}`,
    child: { name: 'Bông', birth_year: 2020 },
    buddy: { name: 'Buddy', role: 'friend', personality: 'ENFP' },
    settings: { language: 'vi', voice_id: DEFAULT_VOICE, learn: false, mood_pin: null },
  });
  assert.equal(call.text, undefined);

  assert.equal(row.status, 'completed');
  assert.equal(row.emotion, 'excited');
  assert.equal(row.audio_frames, 5);
  assert.deepEqual(await debitsFor(accepted.turn_id), [{ delta: -1 }]);
  assert.equal(await balanceOf(p.familyId), 9);
  await closeWs(ws);
});

test('a typed turn sends JSON with the settings the parent chose; no audio means no audio messages', async () => {
  const { p, d, sim } = await activeToy();
  const added = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'VoiceTwo_2', label: 'Voice two', language: 'en' } });
  assert.equal(added.status, 201);
  const patched = await api('PATCH', `/api/devices/${d.id}/profile`, {
    token: p.token,
    body: { name: 'Mít', role: 'teacher', personality: 'infj', language: 'en', voice_id: 'VoiceTwo_2', learn: true, mood_pin: 0 },
  });
  assert.equal(patched.status, 200);
  stub.setHandler((call, res) => json(res, 200, reply({ heard: call.text, emotion: 'dancing' })));

  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const msgs = await sim.endAndCollect(ws, { text: 'What is a rainbow?' });
  assert.deepEqual(kinds(msgs), ['answer', 'turn_done']);
  assert.equal(msgs[0].heard, 'What is a rainbow?');
  assert.equal(msgs[0].emotion, 'neutral', 'an emotion outside the 14 falls back to neutral');
  assert.equal(msgs[1].status, 'completed');

  const call = stub.calls[0];
  assert.match(call.headers['content-type'], /^application\/json/);
  assert.equal(call.headers['x-lb-turn'], undefined);
  assert.equal(call.text, 'What is a rainbow?');
  assert.equal(call.meta.turn_id, accepted.turn_id);
  assert.equal(call.meta.subject, `device:${d.id}:${p.familyId}`);
  assert.equal(call.meta.child, null);
  assert.deepEqual(call.meta.buddy, { name: 'Mít', role: 'teacher', personality: 'INFJ' });
  assert.deepEqual(call.meta.settings, { language: 'en', voice_id: 'VoiceTwo_2', learn: true, mood_pin: 0 });
  await closeWs(ws);
});

test('the voice follows the language: its default when none is picked, and never a voice of the other language', async () => {
  const { p, d, sim } = await activeToy();
  const patchProfile = (body) => api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body });
  stub.setHandler((call, res) => json(res, 200, reply({ heard: call.text })));
  const voiceOfNextTurn = async () => {
    const { ws } = await sim.openStream();
    await sim.turnStart(ws);
    await sim.endAndCollect(ws, { text: 'Hello' });
    await closeWs(ws);
    return stub.calls.at(-1).meta.settings.voice_id;
  };

  assert.equal(await voiceOfNextTurn(), DEFAULT_VOICES.vi);
  assert.equal((await patchProfile({ language: 'en' })).status, 200);
  assert.equal(await voiceOfNextTurn(), DEFAULT_VOICES.en);

  const added = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'VoiceEn_3', label: 'Voice three', language: 'en' } });
  assert.equal(added.status, 201);
  assert.equal((await patchProfile({ voice_id: 'VoiceEn_3' })).status, 200);
  assert.equal(await voiceOfNextTurn(), 'VoiceEn_3');

  // An operator moves that voice to Vietnamese; the English toy that picked
  // it falls back to the English default instead.
  const moved = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'VoiceEn_3', label: 'Voice three', language: 'vi' } });
  assert.equal(moved.status, 200);
  assert.equal(await voiceOfNextTurn(), DEFAULT_VOICES.en);
});

test('no_speech: the line and its audio are sent, then the turn is abandoned and not charged', async () => {
  const { p, sim } = await activeToy();
  stub.setHandler((call, res) => json(res, 200, reply({ no_speech: true, heard: '', reply: 'Ơ, tớ chưa nghe rõ.', emotion: 'confused' }, { audioBytes: 1000 })));
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  sim.sendFrames(ws, 3);
  const msgs = await sim.endAndCollect(ws);
  assert.deepEqual(kinds(msgs), ['answer', 'audio', 'bin:1000', 'audio_end', 'turn_done']);
  assert.equal(msgs[0].emotion, 'confused');
  assert.deepEqual(msgs[4], { type: 'turn_done', turn_id: accepted.turn_id, status: 'abandoned' });
  assert.equal((await turnRow(accepted.turn_id)).status, 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);
  assert.equal(await balanceOf(p.familyId), 10);
  await closeWs(ws);
});

test('a brain error speaks the canned line in the toy language and fails the turn without charging', async () => {
  const { p, d, sim } = await activeToy();
  await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { language: 'en' } });
  const { ws } = await sim.openStream();

  for (const handler of [
    (call, res) => json(res, 502, { error: 'llm_failed', kind: 'refusal' }),
    (call, res) => res.socket.destroy(),
    (call, res) => json(res, 200, { nonsense: true }),
  ]) {
    stub.setHandler(handler);
    const accepted = await sim.turnStart(ws);
    const msgs = await sim.endAndCollect(ws, { text: 'hi' });
    assert.deepEqual(kinds(msgs), ['answer', 'turn_done']);
    assert.deepEqual(msgs[0], { type: 'answer', turn_id: accepted.turn_id, ...FAILED_ANSWERS.en, heard: 'hi' });
    assert.equal(msgs[1].status, 'failed');
    assert.equal((await turnRow(accepted.turn_id)).status, 'failed');
  }
  assert.equal(await balanceOf(p.familyId), 10);
  await closeWs(ws);
});

test('the kill switch while the brain is thinking: 4003, abandoned, not charged, and the brain call is aborted', async () => {
  const { p, d, sim } = await activeToy();
  stub.setHandler(hang);
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  sim.sendFrames(ws, 5);
  const collected = sim.endAndCollect(ws);
  const call = await stub.nextCall('POST');
  await api('POST', `/api/devices/${d.id}/disable`, { token: p.token, body: {} });

  const msgs = await collected;
  assert.equal(msgs.closed, CLOSE_BLOCKED);
  assert.deepEqual(kinds(msgs), [], 'nothing is said after the kill switch');
  await call.closed;
  assert.equal(call.aborted, true);
  await waitFor(async () => (await turnRow(accepted.turn_id)).status === 'abandoned');
  assert.deepEqual(await debitsFor(accepted.turn_id), []);
  assert.equal(await balanceOf(p.familyId), 10);
});

test('the toy hanging up while the brain is thinking aborts the call and abandons the turn', async () => {
  const { p, sim } = await activeToy();
  stub.setHandler(hang);
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  ws.send(JSON.stringify({ type: 'turn_end', text: 'hello' }));
  const call = await stub.nextCall('POST');
  await closeWs(ws);
  await call.closed;
  assert.equal(call.aborted, true);
  await waitFor(async () => (await turnRow(accepted.turn_id)).status === 'abandoned');
  assert.equal(await balanceOf(p.familyId), 10);
});

test('a brain slower than BRAIN_TIMEOUT_MS: the call is aborted and the turn fails with the canned line', async () => {
  const { p, sim } = await activeToy();
  stub.setHandler(hang);
  const { ws } = await sim.openStream();
  const accepted = await sim.turnStart(ws);
  const started = Date.now();
  const msgs = await sim.endAndCollect(ws, { text: 'xin chào' });
  const took = Date.now() - started;
  assert.ok(took >= 1400 && took < 4000, `took ${took} ms`);
  assert.deepEqual(kinds(msgs), ['answer', 'turn_done']);
  assert.deepEqual(msgs[0], { type: 'answer', turn_id: accepted.turn_id, ...FAILED_ANSWERS.vi, heard: 'xin chào' });
  assert.equal(msgs[1].status, 'failed');
  const call = stub.calls[0];
  await call.closed;
  assert.equal(call.aborted, true);
  assert.equal(await balanceOf(p.familyId), 10);
  await closeWs(ws);
});

test('unpairing asks the brain to forget the toy subject; a brain failure does not fail the unpair', async () => {
  const { p, d } = await activeToy();
  const res = await api('DELETE', `/api/devices/${d.id}`, { token: p.token });
  assert.equal(res.status, 204);
  const call = await stub.nextCall('DELETE');
  assert.equal(call.url, `/v1/subjects/${encodeURIComponent(`device:${d.id}:${p.familyId}`)}`);
  assert.equal(call.headers.authorization, 'Bearer test-brain-token');

  stub.reset();
  stub.setHandler((c, r) => json(r, 500, { error: 'boom' }));
  const again = await registerParent(api);
  await claimDevice(api, again.token, d.claimCode);
  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: again.token })).status, 204);
  const second = await stub.nextCall('DELETE');
  assert.equal(second.url, `/v1/subjects/${encodeURIComponent(`device:${d.id}:${again.familyId}`)}`);
});

test('the boot probe tells a shared token (400 on an empty turn) from a mismatch (401) and a dead brain', async () => {
  const { probe } = await import('../../pipeline/brain.js');
  stub.setHandler((c, r) => (c.headers.authorization === 'Bearer test-brain-token'
    ? json(r, 400, { error: 'invalid_request', details: [] })
    : json(r, 401, { error: 'unauthorized' })));
  assert.deepEqual(await probe(), { ok: true, code: 'brain_ready' });
  const call = stub.calls[0];
  assert.equal(call.url, '/v1/turns');
  assert.equal(call.body.toString(), '{}', 'an empty turn the brain refuses before doing any work');

  stub.setHandler((c, r) => json(r, 401, { error: 'unauthorized' }));
  assert.deepEqual(await probe(), { ok: false, code: 'brain_unauthorized' });
  stub.setHandler((c, r) => json(r, 503, { error: 'down' }));
  assert.deepEqual(await probe(), { ok: false, code: 'brain_http_503' });
});
