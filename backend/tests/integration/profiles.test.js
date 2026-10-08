import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, teardownDb, resetDb, resetRedis, DEFAULT_VOICES } from '../helpers/db.js';
import { startTestServer } from '../helpers/app.js';
import { registerParent, provisionDevice, adminHeaders } from '../helpers/fixtures.js';
import { pool } from '../../store/db.js';

// What every claim starts from, whatever the toy's past.
const SETTINGS = { design: 'orbit', language: 'vi', voice_id: null, learn: false, mood_pin: null };

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

const claim = (p, code, profile) => api('POST', '/api/devices/claim', { token: p.token, body: profile ? { claim_code: code, profile } : { claim_code: code } });

test('all 16 personalities are seeded with the prototype temperaments', async () => {
  const r = await pool.query('SELECT code, vibe FROM personalities ORDER BY code');
  assert.equal(r.rowCount, 16);
  assert.ok(r.rows.every((row) => /^[EI][SN][TF][JP]$/.test(row.code) && row.vibe.split('\n').length >= 4));
});

test('a claim with a profile stores it and the device list shows it', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode, { name: ' Bin ', role: 'teacher', personality: 'infj', personality_source: 'quiz' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Bin', role: 'teacher', personality: 'INFJ', personality_source: 'quiz', ...SETTINGS });
  const list = await api('GET', '/api/devices', { token: p.token });
  assert.deepEqual(list.body.devices[0].profile, res.body.device.profile);
});

test('a claim without a profile gets the friendly defaults', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default', ...SETTINGS });
});

test('a bad profile fails the claim with every field listed, and the toy stays unclaimed', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  const res = await claim(p, d.claimCode, { name: '', role: 'robot', personality: 'XXXX' });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details.map((x) => x.field).sort(), ['name', 'personality', 'role']);
  const again = await claim(p, d.claimCode);
  assert.equal(again.status, 200, 'the code was not consumed by the failed attempt');
});

test('the owning family can edit the profile; another family cannot', async () => {
  const p = await registerParent(api);
  const other = await registerParent(api);
  const d = await provisionDevice();
  await claim(p, d.claimCode);

  const res = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { name: 'Mít', personality: 'ISFJ', personality_source: 'picked' } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Mít', role: 'friend', personality: 'ISFJ', personality_source: 'picked', ...SETTINGS });

  const bad = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: { role: 'pirate' } });
  assert.equal(bad.status, 400);
  const empty = await api('PATCH', `/api/devices/${d.id}/profile`, { token: p.token, body: {} });
  assert.equal(empty.status, 400);
  const foreign = await api('PATCH', `/api/devices/${d.id}/profile`, { token: other.token, body: { name: 'Hacked' } });
  assert.equal(foreign.status, 404);

  const events = await pool.query(`SELECT event FROM device_events WHERE device_id = $1 AND event = 'profile_updated'`, [d.id]);
  assert.equal(events.rowCount, 1);
});

test('a toy that changes family starts from a fresh profile', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  await claim(p1, d.claimCode, { name: 'Bin', role: 'daddy', personality: 'ISTJ' });
  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: p1.token })).status, 204);
  const res = await claim(p2, d.claimCode);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default', ...SETTINGS });
});

const patch = (p, id, body) => api('PATCH', `/api/devices/${id}/profile`, { token: p.token, body });
// Seeded by migration 008: one non-default voice in each language.
const ZIGGY = '87n4zM8Wuy87vFILuKvE';
const CAM_HONG = 'x4KAhuXs2G8TfK9Zr7Q4';

test('voices: the chosen voices are seeded with one default per language and listed for parents', async () => {
  const p = await registerParent(api);
  const res = await api('GET', '/api/voices', { token: p.token });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.voices, [
    { id: DEFAULT_VOICES.en, label: 'Little Dude II', language: 'en', is_default: true },
    { id: ZIGGY, label: 'Ziggy', language: 'en', is_default: false },
    { id: 'e79twtVS2278lVZZQiAD', label: 'The Elf', language: 'en', is_default: false },
    { id: DEFAULT_VOICES.vi, label: 'Phan Anh', language: 'vi', is_default: true },
    { id: CAM_HONG, label: 'Cam Hong', language: 'vi', is_default: false },
  ]);
  assert.equal((await api('GET', '/api/voices')).status, 401);
});

test('admin adds and edits voices; making one the default moves the flag within its language only', async () => {
  const unauth = await api('POST', '/admin/voices', { body: { id: 'Abc', label: 'x' } });
  assert.equal(unauth.status, 401);
  const bad = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'has space', label: '', language: 'fr' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['id', 'label', 'language']);
  const badFlag = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'Abc', label: 'A', is_default: 'yes' } });
  assert.equal(badFlag.status, 400);

  const created = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'NewVoice01', label: 'Giọng bé', sort: 5 } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.voice, { id: 'NewVoice01', label: 'Giọng bé', language: 'vi', is_default: false, sort: 5 });

  const promoted = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'NewVoice01', label: 'Giọng bé mới', sort: 5, is_default: true } });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.voice.is_default, true);
  const p = await registerParent(api);
  const defaults = async () => (await api('GET', '/api/voices', { token: p.token })).body.voices.filter((v) => v.is_default).map((v) => [v.language, v.id]);
  assert.deepEqual(await defaults(), [['en', DEFAULT_VOICES.en], ['vi', 'NewVoice01']]);

  // Relabelling the default without is_default, sort or language keeps all three.
  const relabelled = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'NewVoice01', label: 'Giọng bé 2' } });
  assert.equal(relabelled.status, 200);
  assert.deepEqual(relabelled.body.voice, { id: 'NewVoice01', label: 'Giọng bé 2', language: 'vi', is_default: true, sort: 5 });
  assert.deepEqual(await defaults(), [['en', DEFAULT_VOICES.en], ['vi', 'NewVoice01']]);

  // A default moved into a language that has one already must say so.
  const clash = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'NewVoice01', label: 'Giọng bé 2', language: 'en' } });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'default_exists');
  const moved = await api('POST', '/admin/voices', { headers: adminHeaders, body: { id: 'NewVoice01', label: 'Giọng bé 2', language: 'en', is_default: true } });
  assert.equal(moved.status, 200);
  assert.deepEqual(await defaults(), [['en', 'NewVoice01']]);
});

test('settings: set, clear the mood pin with null, keep 0 as a real pin, and leave absent fields alone', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claim(p, d.claimCode);

  let res = await patch(p, d.id, { language: 'en', learn: true, mood_pin: 0, voice_id: ZIGGY });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default', design: 'orbit', language: 'en', voice_id: ZIGGY, learn: true, mood_pin: 0 });

  res = await patch(p, d.id, { name: 'Kem' });
  assert.equal(res.body.device.profile.mood_pin, 0, 'an absent field is untouched');
  assert.equal(res.body.device.profile.learn, true);

  res = await patch(p, d.id, { mood_pin: 73 });
  assert.equal(res.body.device.profile.mood_pin, 73);
  res = await patch(p, d.id, { mood_pin: null, voice_id: null });
  assert.equal(res.body.device.profile.mood_pin, null);
  assert.equal(res.body.device.profile.voice_id, null);
  assert.equal(res.body.device.profile.language, 'en');
  const list = await api('GET', '/api/devices', { token: p.token });
  assert.deepEqual(list.body.devices[0].profile, res.body.device.profile);
});

test('bad settings are a 400 naming each field; an unknown voice is a 400 too, not a 500', async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claim(p, d.claimCode);
  const bad = await patch(p, d.id, { language: 'fr', learn: 1, mood_pin: 101 });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((x) => x.field).sort(), ['language', 'learn', 'mood_pin']);
  const ghost = await patch(p, d.id, { voice_id: 'NoSuchVoice' });
  assert.equal(ghost.status, 400);
  assert.deepEqual(ghost.body.error.details, [{ field: 'voice_id', message: 'unknown voice' }]);
  const d2 = await provisionDevice();
  const ghostClaim = await claim(p, d2.claimCode, { name: 'Bin', role: 'friend', personality: 'ENFP', voice_id: 'NoSuchVoice' });
  assert.equal(ghostClaim.status, 400);
  assert.equal(ghostClaim.body.error.details[0].field, 'voice_id');
  assert.equal((await claim(p, d2.claimCode)).status, 200, 'the failed claim consumed nothing');
});

test("a voice must speak the toy's language; switching language alone drops a voice of the other one", async () => {
  const p = await registerParent(api);
  const d = await provisionDevice();
  await claim(p, d.claimCode);
  const wrong = [{ field: 'voice_id', message: 'voice does not speak this language' }];

  let res = await patch(p, d.id, { voice_id: ZIGGY });
  assert.equal(res.status, 400, 'an English voice on a Vietnamese toy');
  assert.deepEqual(res.body.error.details, wrong);
  res = await patch(p, d.id, { language: 'en', voice_id: ZIGGY });
  assert.equal(res.status, 200, 'language and voice switched together');
  assert.equal(res.body.device.profile.voice_id, ZIGGY);
  res = await patch(p, d.id, { language: 'en', voice_id: CAM_HONG });
  assert.equal(res.status, 400);

  res = await patch(p, d.id, { language: 'vi' });
  assert.equal(res.status, 200);
  assert.equal(res.body.device.profile.language, 'vi');
  assert.equal(res.body.device.profile.voice_id, null, 'Ziggy goes; the toy speaks the Vietnamese default');
  const event = await pool.query(
    "SELECT detail FROM device_events WHERE device_id = $1 AND event = 'profile_updated' ORDER BY id DESC LIMIT 1",
    [d.id],
  );
  assert.deepEqual(event.rows[0].detail.fields.sort(), ['language', 'voice_id']);

  res = await patch(p, d.id, { voice_id: CAM_HONG });
  assert.equal(res.status, 200);
  res = await patch(p, d.id, { language: 'vi' });
  assert.equal(res.body.device.profile.voice_id, CAM_HONG, 'the same language keeps the choice');

  const d2 = await provisionDevice();
  const badClaim = await claim(p, d2.claimCode, { name: 'Bin', role: 'friend', personality: 'ENFP', voice_id: ZIGGY });
  assert.equal(badClaim.status, 400);
  assert.deepEqual(badClaim.body.error.details, wrong);
  const okClaim = await claim(p, d2.claimCode, { name: 'Bin', role: 'friend', personality: 'ENFP', language: 'en', voice_id: ZIGGY });
  assert.equal(okClaim.status, 200);
  assert.equal(okClaim.body.device.profile.voice_id, ZIGGY);
});

test('design: chosen at claim, changed alone by a patch, and reset for the next owner', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  let res = await claim(p1, d.claimCode, { name: 'Bin', role: 'friend', personality: 'ENFP', design: 'volt' });
  assert.equal(res.status, 200);
  assert.equal(res.body.device.profile.design, 'volt');

  res = await patch(p1, d.id, { design: 'glim' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.device.profile, { name: 'Bin', role: 'friend', personality: 'ENFP', personality_source: 'picked', ...SETTINGS, design: 'glim' });
  const list = await api('GET', '/api/devices', { token: p1.token });
  assert.equal(list.body.devices[0].profile.design, 'glim');

  const bad = await patch(p1, d.id, { design: null });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details.map((x) => x.field), ['design']);

  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: p1.token })).status, 204);
  res = await claim(p2, d.claimCode);
  assert.equal(res.body.device.profile.design, 'orbit');
});

test('a claim resets every setting, so the next owner never inherits them', async () => {
  const p1 = await registerParent(api);
  const p2 = await registerParent(api);
  const d = await provisionDevice();
  await claim(p1, d.claimCode);
  await patch(p1, d.id, { language: 'en', learn: true, mood_pin: 5, voice_id: ZIGGY });
  assert.equal((await api('DELETE', `/api/devices/${d.id}`, { token: p1.token })).status, 204);
  const res = await claim(p2, d.claimCode);
  assert.deepEqual(res.body.device.profile, { name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default', ...SETTINGS });
});
