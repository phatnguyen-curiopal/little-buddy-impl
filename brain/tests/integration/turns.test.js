import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import { makeMeta, pcmSeconds, postText, postVoice, startBrain, waitFor } from '../helpers/brain.js';
import { TEST_TOKEN, testConfig } from '../helpers/config.js';
import { resetDb, setupDb, teardownDb } from '../helpers/db.js';
import { anthropicMessage, chatCompletion, startStub } from '../helpers/stub.js';

let stub;
let pool;
let brain;

before(async () => {
  pool = await setupDb();
  stub = await startStub();
  brain = await startBrain(testConfig(stub.env), pool);
});
after(async () => {
  await brain.close();
  await stub.close();
  await teardownDb();
});
beforeEach(async () => {
  stub.reset();
  await resetDb();
});

test('healthz needs no token and reports the provider and the database', async () => {
  const res = await fetch(`${brain.url}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, provider: 'openai', db: true });
});

test('a missing or wrong bearer token is 401 on every /v1 route', async () => {
  const meta = makeMeta();
  assert.equal((await postText(brain.url, meta, 'hi', { token: 'nope' })).status, 401);
  const res = await fetch(`${brain.url}/v1/subjects/${meta.subject}`, { method: 'DELETE' });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'unauthorized' });
  assert.equal(stub.calls.length, 0);
});

test('a text turn answers with the reply, the tagged emotion stripped, and audio', async () => {
  stub.state.reply = '[excited] Ôi hay quá [cười], kể tiếp đi!';
  const meta = makeMeta();
  const { status, body } = await postText(brain.url, meta, '  Hôm nay tớ được điểm mười  ');
  assert.equal(status, 200);
  assert.equal(body.no_speech, false);
  assert.equal(body.heard, 'Hôm nay tớ được điểm mười');
  assert.equal(body.reply, 'Ôi hay quá, kể tiếp đi!');
  assert.equal(body.emotion, 'excited');
  assert.equal(Buffer.from(body.audio_b64, 'base64').length, 3200);
  assert.equal(body.audio_rate, 16000);
  assert.equal(body.provider, 'openai');
  assert.equal(body.model, 'stub-model');
  assert.deepEqual(body.usage, { input: 11, output: 7, cached: 3 });
  for (const key of ['stt', 'memory', 'llm', 'tts', 'total']) assert.equal(typeof body.timings_ms[key], 'number');

  const [chat] = stub.of('openai.chat');
  const system = chat.body.messages[0].content;
  assert.match(system, /^Bạn là Buddy, một người bạn đồ chơi biết nói chuyện của bạn Bông, sinh năm 2020\./);
  assert.match(system, /CẢM XÚC TRÊN MẶT/);
  assert.match(system, /ĐỜI SỐNG CỦA VAI/);
  assert.deepEqual(chat.body.messages.slice(1), [{ role: 'user', content: 'Hôm nay tớ được điểm mười' }]);
  const [tts] = stub.of('eleven.tts');
  assert.equal(tts.path, '/eleven/v1/text-to-speech/voice123');
  assert.equal(tts.body.text, 'Ôi hay quá, kể tiếp đi!');
  assert.equal(tts.body.language_code, 'vi');
});

test('history carries the tagged reply into the next turn of the same conversation', async () => {
  const meta = makeMeta();
  stub.state.reply = '[happy] Chào Bông!';
  await postText(brain.url, meta, 'Chào cậu');
  stub.state.reply = '[curious] Hôm nay thế nào?';
  await postText(brain.url, { ...meta, turn_id: randomUUID() }, 'Tớ về rồi');
  const second = stub.of('openai.chat')[1];
  assert.deepEqual(second.body.messages.slice(1), [
    { role: 'user', content: 'Chào cậu' },
    { role: 'assistant', content: '[happy] Chào Bông!' },
    { role: 'user', content: 'Tớ về rồi' },
  ]);
  // A different conversation starts clean.
  await postText(brain.url, { ...meta, turn_id: randomUUID(), conversation_id: randomUUID() }, 'Lại là tớ');
  assert.equal(stub.of('openai.chat')[2].body.messages.length, 2);
});

test('English turns use the English prompt, pronouns and speech language', async () => {
  const meta = makeMeta({ buddy: { name: 'Pip', role: 'mommy', personality: 'ESFJ' }, settings: { language: 'en' } });
  stub.state.transcript = 'I drew a cat';
  const { body } = await postVoice(brain.url, meta, pcmSeconds(1));
  assert.equal(body.heard, 'I drew a cat');
  const system = stub.of('openai.chat')[0].body.messages[0].content;
  assert.match(system, /^You are Pip, a talking toy friend of Bông, a child born in 2020\./);
  assert.match(system, /Call yourself "Mommy"/);
  assert.equal(stub.of('eleven.stt')[0].form.language_code[0], 'en');
  assert.equal(stub.of('eleven.tts')[0].body.language_code, 'en');
});

test('a voice turn is transcribed with the header meta decoded from base64url', async () => {
  stub.state.transcript = 'Mun ơi';
  const meta = makeMeta({ buddy: { name: 'Mây' } });
  const { status, body } = await postVoice(brain.url, meta, pcmSeconds(1.2));
  assert.equal(status, 200);
  assert.equal(body.heard, 'Mun ơi');
  const [stt] = stub.of('eleven.stt');
  assert.equal(stt.form.file[0].bytes, 38400 + 44);
  assert.match(stub.of('openai.chat')[0].body.messages[0].content, /^Bạn là Mây/);
});

test('no speech: a short clip or an empty transcript returns the canned line, no LLM call', async () => {
  const meta = makeMeta({ buddy: { role: 'daddy', personality: 'ISTJ' } });
  let { status, body } = await postVoice(brain.url, meta, pcmSeconds(0.2));
  assert.equal(status, 200);
  assert.equal(body.no_speech, true);
  assert.equal(body.emotion, 'confused');
  assert.match(body.reply, /bố/i);
  assert.ok(body.audio_b64);
  assert.equal(stub.of('eleven.stt').length, 0);

  stub.state.transcript = '   ';
  ({ body } = await postVoice(brain.url, { ...meta, turn_id: randomUUID(), settings: { ...meta.settings, language: 'en' } }, pcmSeconds(1)));
  assert.equal(body.no_speech, true);
  assert.match(body.reply, /Daddy/);
  assert.equal(stub.of('eleven.stt').length, 1);
  assert.equal(stub.of('openai.chat').length, 0);

  // An empty body is no speech too, not an error.
  ({ body } = await postVoice(brain.url, { ...meta, turn_id: randomUUID() }, Buffer.alloc(0)));
  assert.equal(body.no_speech, true);
});

test('a TTS failure returns the text with audio null', async () => {
  stub.on('eleven.tts', () => ({ status: 500, json: { detail: 'quota' } }));
  const { status, body } = await postText(brain.url, makeMeta(), 'kể chuyện đi');
  assert.equal(status, 200);
  assert.equal(body.reply, 'Chào bạn nhé!');
  assert.equal(body.audio_b64, null);
  assert.equal(body.audio_rate, null);
});

test('a null voice id skips TTS', async () => {
  const { body } = await postText(brain.url, makeMeta({ settings: { voice_id: null } }), 'hi');
  assert.equal(body.audio_b64, null);
  assert.equal(stub.of('eleven.tts').length, 0);
});

test('LLM failures map to 502 llm_failed with their kind', async () => {
  stub.on('openai.chat', () => ({ json: chatCompletion('', { finish: 'content_filter' }) }));
  let res = await postText(brain.url, makeMeta(), 'x');
  assert.deepEqual([res.status, res.body], [502, { error: 'llm_failed', kind: 'refusal' }]);
  stub.on('openai.chat', () => ({ json: chatCompletion('[happy]') }));
  res = await postText(brain.url, makeMeta(), 'x');
  assert.deepEqual(res.body, { error: 'llm_failed', kind: 'empty' });
  stub.on('openai.chat', () => ({ status: 400, json: { error: { message: 'bad model' } } }));
  res = await postText(brain.url, makeMeta(), 'x');
  assert.deepEqual(res.body, { error: 'llm_failed', kind: 'upstream' });
});

test('STT failure maps to 502 stt_failed', async () => {
  stub.on('eleven.stt', () => ({ status: 401, json: { detail: 'nope' } }));
  const res = await postVoice(brain.url, makeMeta(), pcmSeconds(1));
  assert.deepEqual([res.status, res.body], [502, { error: 'stt_failed', kind: 'upstream' }]);
});

test('the turn deadline aborts the upstream call and answers timeout', async () => {
  const slow = await startBrain(testConfig(stub.env, { TURN_TIMEOUT_MS: '1000' }), pool);
  try {
    stub.on('openai.chat', () => ({ json: chatCompletion('[happy] late'), delayMs: 5000 }));
    const started = Date.now();
    const res = await postText(slow.url, makeMeta(), 'x');
    assert.deepEqual([res.status, res.body], [502, { error: 'llm_failed', kind: 'timeout' }]);
    assert.ok(Date.now() - started < 3000);
    assert.ok(await waitFor(() => stub.of('openai.chat')[0]?.aborted));
  } finally {
    await slow.close();
  }
});

test('invalid requests are 400 with every problem listed', async () => {
  let res = await postText(brain.url, { ...makeMeta(), subject: 'nobody', settings: { language: 'fr' } }, '');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_request');
  assert.ok(res.body.details.length >= 3);

  res = await fetch(`${brain.url}/v1/turns`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TEST_TOKEN}`, 'content-type': 'application/octet-stream' },
    body: pcmSeconds(1),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).details[0].field, 'x-lb-turn');

  res = await fetch(`${brain.url}/v1/turns`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TEST_TOKEN}`, 'content-type': 'text/plain' },
    body: 'hi',
  });
  assert.equal(res.status, 400);

  res = await postVoice(brain.url, makeMeta(), Buffer.alloc(3201));
  assert.equal(res.status, 400);

  res = await fetch(`${brain.url}/v1/turns`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TEST_TOKEN}`, 'content-type': 'application/json' },
    body: '{not json',
  });
  assert.equal(res.status, 400);
  assert.equal(stub.calls.length, 0);
});

test('bodies over 6 MB are refused before any upstream call', async () => {
  const res = await postVoice(brain.url, makeMeta(), Buffer.alloc(6 * 1024 * 1024 + 2));
  assert.equal(res.status, 413);
  assert.equal(stub.calls.length, 0);
});

test('anthropic and qwen answer through the same pipeline', async () => {
  for (const provider of ['anthropic', 'qwen']) {
    const other = await startBrain(testConfig(stub.env, { LLM_PROVIDER: provider }), pool);
    try {
      stub.on('anthropic.messages', () => ({ json: anthropicMessage('[wink] Từ Claude') }));
      stub.on('qwen.chat', () => ({ json: chatCompletion('[shy] Từ Qwen', { model: 'stub-qwen' }) }));
      const { status, body } = await postText(other.url, makeMeta(), 'hi');
      assert.equal(status, 200);
      assert.equal(body.provider, provider);
      assert.equal(body.emotion, provider === 'anthropic' ? 'wink' : 'shy');
    } finally {
      await other.close();
    }
  }
  assert.equal(stub.of('openai.chat').length, 0);
});

test('an LLM_SYSTEM_PROMPT override still carries the language and tag rules and skips bot life', async () => {
  const other = await startBrain(testConfig(stub.env, { LLM_SYSTEM_PROMPT: 'Bạn là máy.' }), pool);
  try {
    await postText(other.url, makeMeta(), 'hi');
    const system = stub.of('openai.chat')[0].body.messages[0].content;
    assert.ok(system.startsWith('Bạn là máy.\n\nNGÔN NGỮ\n'));
    assert.match(system, /\nCẢM XÚC TRÊN MẶT\n/);
    assert.doesNotMatch(system, /ĐỜI SỐNG/);
    const moods = await pool.query('SELECT count(*)::int AS n FROM moods');
    assert.equal(moods.rows[0].n, 0);
  } finally {
    await other.close();
  }
});
