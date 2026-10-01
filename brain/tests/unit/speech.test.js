import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createOpenAiClient } from '../../llm/helper.js';
import { EMBED_DIMS, EMBED_MODEL, createEmbedder } from '../../memory/embed.js';
import { createStt, keytermsFor } from '../../speech/stt.js';
import { createTts } from '../../speech/tts.js';
import { wrapWav } from '../../speech/wav.js';
import { testConfig } from '../helpers/config.js';
import { startStub } from '../helpers/stub.js';

let stub;
before(async () => {
  stub = await startStub();
});
after(() => stub.close());
beforeEach(() => stub.reset());

test('wav header describes PCM16 mono 16 kHz', () => {
  const wav = wrapWav(Buffer.alloc(100));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(40), 100);
  assert.equal(wav.length, 144);
});

test('stt posts one wav with model, language, keyterms and explicit audio-event off', async () => {
  const stt = createStt(testConfig(stub.env, { STT_KEYTERMS_MAX: '2', STT_NO_VERBATIM: '1', STT_LOGGING: '0' }));
  stub.state.transcript = '  Mun ơi  ';
  const text = await stt.transcribe({ pcm: Buffer.alloc(32000), languageCode: 'vi', keyterms: ['Mun', 'Sóc', 'Bông'] });
  assert.equal(text, 'Mun ơi');
  const [call] = stub.of('eleven.stt');
  assert.equal(call.headers['xi-api-key'], 'xi-test');
  assert.equal(call.query.get('enable_logging'), 'false');
  assert.equal(call.form.model_id[0], 'scribe_v2');
  assert.equal(call.form.language_code[0], 'vi');
  assert.deepEqual(call.form.keyterms, ['Mun', 'Sóc']);
  assert.equal(call.form.tag_audio_events[0], 'false');
  assert.equal(call.form.no_verbatim[0], 'true');
  assert.equal(call.form.file[0].bytes, 32044);
});

test('keyterms drop names the API would reject and respect the switch', () => {
  assert.deepEqual(keytermsFor(['Ok', 'a<b>', 'x'.repeat(51)], { enabled: true, max: 10 }), ['Ok']);
  assert.deepEqual(keytermsFor(['Ok'], { enabled: false, max: 10 }), []);
});

test('stt failure is an upstream speech error', async () => {
  const stt = createStt(testConfig(stub.env));
  stub.on('eleven.stt', () => ({ status: 401, json: { detail: 'bad key' } }));
  await assert.rejects(stt.transcribe({ pcm: Buffer.alloc(32000), languageCode: 'en' }), (err) => err.name === 'SpeechError' && err.kind === 'upstream');
});

test('tts posts the text with model and language, returns raw pcm and the rate', async () => {
  const tts = createTts(testConfig(stub.env, { TTS_MODEL: 'eleven_test', TTS_OUTPUT_FORMAT: 'pcm_24000' }));
  stub.state.ttsBytes = 4801;
  const { pcm, rate } = await tts.synthesize({ text: 'Chào cậu', voiceId: 'voice123', languageCode: 'vi' });
  assert.equal(pcm.length, 4800);
  assert.equal(rate, 24000);
  const [call] = stub.of('eleven.tts');
  assert.equal(call.path, '/eleven/v1/text-to-speech/voice123');
  assert.equal(call.query.get('output_format'), 'pcm_24000');
  assert.deepEqual(call.body, { text: 'Chào cậu', model_id: 'eleven_test', language_code: 'vi' });
  await assert.rejects(tts.synthesize({ text: 'x', voiceId: '../../v1/keys' }), /invalid voice id/);
});

test('embeddings ask for 3072 floats of text-embedding-3-large', async () => {
  const config = testConfig(stub.env);
  const embed = createEmbedder(createOpenAiClient(config));
  const vec = await embed('xin chào');
  assert.equal(vec.length, EMBED_DIMS);
  const [call] = stub.of('openai.embed');
  assert.deepEqual(call.body, { model: EMBED_MODEL, input: 'xin chào', encoding_format: 'float', dimensions: 3072 });
  stub.on('openai.embed', () => ({ json: { data: [{ embedding: [1, 2, 3] }] } }));
  await assert.rejects(embed('x'), /3 dimensions, expected 3072/);
});
