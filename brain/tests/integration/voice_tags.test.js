import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { makeMeta, postText, startBrain } from '../helpers/brain.js';
import { testConfig } from '../helpers/config.js';
import { resetDb, setupDb, teardownDb } from '../helpers/db.js';
import { startStub } from '../helpers/stub.js';

// The same turn as turns.test.js, on a TTS model that performs voice tags.
let stub;
let pool;
let brain;
const logLines = [];

before(async () => {
  pool = await setupDb();
  stub = await startStub();
  brain = await startBrain(testConfig(stub.env, { TTS_MODEL: 'eleven_v4_turbo' }), pool, { logLines });
});
after(async () => {
  await brain.close();
  await stub.close();
  await teardownDb();
});
beforeEach(async () => {
  stub.reset();
  logLines.length = 0;
  await resetDb();
});

test('the model is asked for voice tags and only the speech engine hears them', async () => {
  stub.state.reply = '[happy] [giggles] Hay quá! [whispering, playful] Bí mật nè [yawns].';
  const meta = makeMeta();
  const { status, body } = await postText(brain.url, meta, 'Tớ tìm được xương khủng long');
  assert.equal(status, 200);

  const system = stub.of('openai.chat')[0].body.messages[0].content;
  assert.match(system, /\nGIỌNG NÓI\n/);
  assert.match(system, /KHÔNG có danh sách cố định/);

  const [tts] = stub.of('eleven.tts');
  assert.equal(tts.body.model_id, 'eleven_v4_turbo');
  assert.equal(tts.body.text, '[giggles] Hay quá! [whispering, playful] Bí mật nè [yawns].');
  assert.equal(body.reply, 'Hay quá! Bí mật nè.');
  assert.equal(body.emotion, 'happy');
  assert.ok(!logLines.some((l) => l.event === 'voice_tag_missing'));
});

test('a reply without a voice tag is still spoken, and the miss is logged by id', async () => {
  stub.state.reply = '[happy] Hay quá!';
  const meta = makeMeta();
  const { status } = await postText(brain.url, meta, 'Chào Buddy');
  assert.equal(status, 200);
  assert.equal(stub.of('eleven.tts')[0].body.text, 'Hay quá!');
  const missing = logLines.filter((l) => l.event === 'voice_tag_missing');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].turn_id, meta.turn_id);
});
