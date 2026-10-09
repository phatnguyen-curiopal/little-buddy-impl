import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_BRAIN_TOKEN, loadConfig } from '../../config.js';

const minimal = {
  NODE_ENV: 'development',
  ELEVENLABS_API_KEY: 'xi',
  ANTHROPIC_API_KEY: 'sk-ant',
};

test('a minimal development env boots with the prototype defaults', () => {
  const config = loadConfig(minimal);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8080);
  assert.equal(config.brainToken, DEFAULT_BRAIN_TOKEN);
  assert.equal(config.llm.provider, 'anthropic');
  assert.equal(config.memory.enabled, false);
  assert.equal(config.botLife.enabled, false);
  assert.equal(config.speech.sttModel, 'scribe_v2');
  assert.equal(config.speech.ttsSampleRate, 16000);
  assert.equal(config.seams.elevenlabsBaseUrl, 'https://api.elevenlabs.io');
  assert.match(config.databaseUrl, /littlebuddy_brain$/);
  assert.ok(Object.isFrozen(config));
});

test('voice tags are on only for a TTS model that performs them', () => {
  assert.equal(loadConfig(minimal).speech.ttsModel, 'eleven_v4_turbo');
  assert.equal(loadConfig(minimal).speech.audioTags, true);
  assert.equal(loadConfig({ ...minimal, TTS_MODEL: 'eleven_v4' }).speech.audioTags, true);
  // Flash reads "[whispers]" aloud as a word.
  assert.equal(loadConfig({ ...minimal, TTS_MODEL: 'eleven_flash_v2_5' }).speech.audioTags, false);
  assert.equal(loadConfig({ ...minimal, TTS_AUDIO_TAGS: '0' }).speech.audioTags, false);
  assert.equal(loadConfig({ ...minimal, TTS_ENABLED: '0' }).speech.audioTags, false);
});

test('ElevenLabs is required: a brain that cannot hear or speak has no job', () => {
  assert.throws(() => loadConfig({ ...minimal, ELEVENLABS_API_KEY: '' }), /ELEVENLABS_API_KEY/);
});

test('the chosen provider needs its own key', () => {
  assert.throws(() => loadConfig({ ...minimal, ANTHROPIC_API_KEY: '' }), /ANTHROPIC_API_KEY is required/);
  assert.throws(() => loadConfig({ ...minimal, LLM_PROVIDER: 'openai' }), /OPENAI_API_KEY is required/);
  assert.throws(() => loadConfig({ ...minimal, LLM_PROVIDER: 'qwen', QWEN_API_KEY: 'q' }), /QWEN_BASE_URL/);
  assert.throws(() => loadConfig({ ...minimal, LLM_PROVIDER: 'gemini' }), /LLM_PROVIDER/);
  // With the LLM off, no reply key is needed.
  assert.doesNotThrow(() => loadConfig({ ...minimal, ANTHROPIC_API_KEY: '', LLM_ENABLED: '0' }));
});

test('OPENAI_API_KEY is required whenever memory is on, whatever the provider', () => {
  assert.throws(() => loadConfig({ ...minimal, MEMORY_ENABLED: '1' }), /OPENAI_API_KEY is required when MEMORY_ENABLED/);
  assert.doesNotThrow(() => loadConfig({ ...minimal, MEMORY_ENABLED: '1', OPENAI_API_KEY: 'sk' }));
});

test('production refuses a default or short BRAIN_TOKEN and the debug taps', () => {
  const prod = { ...minimal, NODE_ENV: 'production', DATABASE_URL: 'postgres://x/y' };
  assert.throws(() => loadConfig(prod), /BRAIN_TOKEN/);
  assert.throws(() => loadConfig({ ...prod, BRAIN_TOKEN: 'short' }), /BRAIN_TOKEN/);
  const token = 'a'.repeat(48);
  assert.doesNotThrow(() => loadConfig({ ...prod, BRAIN_TOKEN: token }));
  assert.throws(() => loadConfig({ ...prod, BRAIN_TOKEN: token, LLM_LOG_FILE: 'x.log' }), /refused in production/);
  assert.throws(() => loadConfig({ ...prod, BRAIN_TOKEN: token, STT_DUMP_WAV: 'wavs' }), /refused in production/);
  assert.throws(() => loadConfig({ ...minimal, NODE_ENV: 'production', BRAIN_TOKEN: token }), /DATABASE_URL/);
});

test('bad values fail at boot instead of on a turn', () => {
  assert.throws(() => loadConfig({ ...minimal, ELEVENLABS_STT_MODEL: 'scribe_v2_realtime' }), /realtime/);
  assert.throws(() => loadConfig({ ...minimal, TTS_OUTPUT_FORMAT: 'mp3_44100_128' }), /pcm_/);
  assert.throws(() => loadConfig({ ...minimal, MEMORY_RETRIEVAL: 'all' }), /MEMORY_RETRIEVAL/);
  assert.throws(() => loadConfig({ ...minimal, LLM_TEMPERATURE: 'warm' }), /LLM_TEMPERATURE/);
  assert.throws(() => loadConfig({ ...minimal, LLM_THINKING: 'enabled' }), /LLM_THINKING/);
  assert.throws(() => loadConfig({ ...minimal, TURN_TIMEOUT_MS: '10' }), /TURN_TIMEOUT_MS/);
});

test('sampling knobs stay null when empty so the field is not sent', () => {
  const config = loadConfig({ ...minimal, LLM_TEMPERATURE: '', LLM_PRESENCE_PENALTY: ' ' });
  assert.equal(config.llm.temperature, null);
  assert.equal(config.llm.presencePenalty, null);
  assert.equal(loadConfig({ ...minimal, LLM_TEMPERATURE: '0' }).llm.temperature, 0);
});

test('vendor-only knobs warn once under another provider', () => {
  const config = loadConfig({ ...minimal, LLM_SERVICE_TIER: 'fast', LLM_MODERATION: 'score', LLM_CACHE: '0' });
  assert.equal(config.warnings.length, 2);
  assert.match(config.warnings.join('\n'), /OpenAI-only/);
});

test('name notes and correction follow the names switch; the profile model follows the names model', () => {
  const config = loadConfig({ ...minimal, MEMORY_NAMES: '0', MEMORY_NAMES_MODEL: 'mini' });
  assert.equal(config.memory.nameContext, false);
  assert.equal(config.memory.nameFix, false);
  assert.equal(config.memory.profileModel, 'mini');
});

test('an old ws:// ElevenLabs seam still points batch at http', () => {
  assert.equal(loadConfig({ ...minimal, ELEVENLABS_BASE_URL: 'ws://127.0.0.1:9/' }).seams.elevenlabsBaseUrl, 'http://127.0.0.1:9');
});
