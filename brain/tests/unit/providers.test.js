import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { createLlm } from '../../llm/index.js';
import { clampTemperature } from '../../llm/providers/qwen.js';
import { LlmError, TurnAbort } from '../../llm/result.js';
import { testConfig } from '../helpers/config.js';
import { anthropicMessage, chatCompletion, startStub } from '../helpers/stub.js';

let stub;
before(async () => {
  stub = await startStub();
});
after(() => stub.close());
beforeEach(() => stub.reset());

const system = 'SYSTEM';
const messages = [{ role: 'user', content: 'xin chào' }];

test('openai: request carries effort, tier, moderation and the system as message zero', async () => {
  const config = testConfig(stub.env, {
    LLM_EFFORT: 'medium',
    LLM_SERVICE_TIER: 'fast',
    LLM_MODERATION: 'score',
    LLM_MAX_TOKENS: '777',
  });
  stub.on('openai.chat', () => ({
    json: chatCompletion('[happy] Chào!', {
      extra: {
        moderation: {
          input: { results: [{ flagged: true, category_scores: { violence: 0.52, harassment: 0.1, self_harm: 0.01, sexual: 0 } }] },
          output: { results: [{ flagged: false, category_scores: { violence: 0.9 } }] },
        },
      },
    }),
  }));
  const llm = createLlm(config);
  const result = await llm.generate({ system, messages });
  const [call] = stub.of('openai.chat');
  assert.equal(call.headers.authorization, 'Bearer sk-test-openai');
  assert.equal(call.body.model, 'gpt-test');
  assert.equal(call.body.max_completion_tokens, 777);
  assert.equal(call.body.reasoning_effort, 'medium');
  assert.equal(call.body.service_tier, 'fast');
  assert.deepEqual(call.body.moderation, {
    model: 'omni-moderation-latest',
    policy: { input: { mode: 'score' }, output: { mode: 'score' } },
  });
  assert.equal(call.body.stream, undefined);
  assert.equal('temperature' in call.body, false);
  assert.equal('prompt_cache_key' in call.body, false);
  assert.deepEqual(call.body.messages, [{ role: 'system', content: system }, ...messages]);

  assert.equal(result.text, '[happy] Chào!');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'stub-model');
  assert.equal(result.finish, 'stop');
  assert.deepEqual(result.usage, { input: 11, output: 7, cached: 3 });
  assert.ok(result.latency_ms >= 0);
  assert.equal(result.moderation.flagged, true);
  assert.deepEqual(result.moderation.top.map((t) => `${t.side}:${t.category}`), ['input:violence', 'input:harassment', 'input:self_harm']);
});

test('openai: temperature clamps to [0, 2], LLM_CACHE=0 sends a unique cache key', async () => {
  const llm = createLlm(testConfig(stub.env, { LLM_TEMPERATURE: '3', LLM_PRESENCE_PENALTY: '-5', LLM_CACHE: '0' }));
  await llm.generate({ system, messages });
  await llm.generate({ system, messages });
  const [a, b] = stub.of('openai.chat');
  assert.equal(a.body.temperature, 2);
  assert.equal(a.body.presence_penalty, -2);
  assert.match(a.body.prompt_cache_key, /^nocache-/);
  assert.notEqual(a.body.prompt_cache_key, b.body.prompt_cache_key);
  assert.equal(a.body.moderation, undefined);
});

test('openai: content_filter is a refusal, an empty reply is its own kind, a 400 is upstream', async () => {
  const llm = createLlm(testConfig(stub.env));
  stub.on('openai.chat', () => ({ json: chatCompletion('', { finish: 'content_filter' }) }));
  await assert.rejects(llm.generate({ system, messages }), (err) => err instanceof LlmError && err.kind === 'refusal');
  stub.on('openai.chat', () => ({ json: chatCompletion('   ') }));
  await assert.rejects(llm.generate({ system, messages }), (err) => err.kind === 'empty');
  stub.on('openai.chat', () => ({ status: 400, json: { error: { message: 'bad', type: 'invalid_request_error' } } }));
  await assert.rejects(llm.generate({ system, messages }), (err) => err.kind === 'upstream' && err.status === 400);
  stub.on('openai.chat', () => ({ json: chatCompletion('cut', { finish: 'length' }) }));
  assert.equal((await llm.generate({ system, messages })).finish, 'length');
});

test('abort reasons map to timeout or aborted', async () => {
  const llm = createLlm(testConfig(stub.env));
  stub.on('openai.chat', () => ({ json: chatCompletion('late'), delayMs: 2000 }));
  for (const [reason, kind] of [['timeout', 'timeout'], ['closed', 'aborted']]) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new TurnAbort(reason)), 50);
    await assert.rejects(llm.generate({ system, messages, signal: controller.signal }), (err) => err.kind === kind);
  }
  assert.ok(await waitAborted(stub.of('openai.chat')));
});

async function waitAborted(calls) {
  for (let i = 0; i < 50; i++) {
    if (calls.every((c) => c.aborted)) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

test('anthropic: system as its own field, effort defaults to low, thinking disabled', async () => {
  const llm = createLlm(testConfig(stub.env, { LLM_PROVIDER: 'anthropic', LLM_TEMPERATURE: '1.5' }));
  const result = await llm.generate({ system, messages });
  const [call] = stub.of('anthropic.messages');
  assert.equal(call.headers['x-api-key'], 'sk-test-anthropic');
  assert.equal(call.body.model, 'claude-test');
  assert.equal(call.body.system, system);
  assert.deepEqual(call.body.messages, messages);
  assert.deepEqual(call.body.output_config, { effort: 'low' });
  assert.deepEqual(call.body.thinking, { type: 'disabled' });
  assert.equal(call.body.temperature, 1);
  assert.equal(call.body.max_tokens, 1024);
  assert.equal(result.provider, 'anthropic');
  assert.deepEqual(result.usage, { input: 21, output: 9, cached: 4 });
  assert.equal(result.finish, 'stop');
});

test('anthropic: adaptive thinking drops temperature, a refusal stop reason is an error', async () => {
  const llm = createLlm(testConfig(stub.env, { LLM_PROVIDER: 'anthropic', LLM_THINKING: 'adaptive', LLM_EFFORT: 'high', LLM_TEMPERATURE: '0.5' }));
  stub.on('anthropic.messages', () => ({ json: anthropicMessage(null, { stop: 'refusal' }) }));
  await assert.rejects(llm.generate({ system, messages }), (err) => err.kind === 'refusal');
  const [call] = stub.of('anthropic.messages');
  assert.deepEqual(call.body.thinking, { type: 'adaptive' });
  assert.deepEqual(call.body.output_config, { effort: 'high' });
  assert.equal('temperature' in call.body, false);
});

test('qwen: max_tokens from QWEN_MAX_TOKENS, no OpenAI-only fields, whole temperatures nudged', async () => {
  const llm = createLlm(
    testConfig(stub.env, {
      LLM_PROVIDER: 'qwen',
      QWEN_MAX_TOKENS: '300',
      LLM_TEMPERATURE: '1',
      LLM_EFFORT: 'high',
      LLM_SERVICE_TIER: 'fast',
      LLM_MODERATION: 'score',
      LLM_CACHE: '0',
    }),
  );
  const result = await llm.generate({ system, messages });
  const [call] = stub.of('qwen.chat');
  assert.equal(call.headers.authorization, 'Bearer sk-test-qwen');
  assert.equal(call.body.model, 'qwen-test');
  assert.equal(call.body.max_tokens, 300);
  assert.equal(call.body.temperature, 1.01);
  for (const field of ['reasoning_effort', 'service_tier', 'moderation', 'prompt_cache_key', 'max_completion_tokens']) {
    assert.equal(field in call.body, false, field);
  }
  assert.equal(result.provider, 'qwen');
  assert.equal(result.model, 'stub-qwen');
});

test('qwen temperature clamp keeps the open upper bound', () => {
  assert.equal(clampTemperature(null), null);
  assert.equal(clampTemperature(2), 1.99);
  assert.equal(clampTemperature(0), 0.01);
  assert.equal(clampTemperature(0.7), 0.7);
});

test('LLM_ENABLED=0 fails every turn as upstream without calling anyone', async () => {
  const llm = createLlm(testConfig(stub.env, { LLM_ENABLED: '0' }));
  await assert.rejects(llm.generate({ system, messages }), (err) => err.kind === 'upstream');
  assert.equal(stub.calls.length, 0);
});
