import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';

import { makeMeta, postText, startBrain } from '../helpers/brain.js';
import { testConfig } from '../helpers/config.js';
import { resetDb, setupDb, teardownDb } from '../helpers/db.js';
import { startStub } from '../helpers/stub.js';

const logFile = path.join(mkdtempSync(path.join(tmpdir(), 'brain-llm-log-')), 'llm.log');
let stub;
let pool;
let brain;

before(async () => {
  pool = await setupDb();
  stub = await startStub();
  brain = await startBrain(testConfig(stub.env, { LLM_LOG_FILE: logFile }), pool);
});
after(async () => {
  await brain.close();
  await stub.close();
  await teardownDb();
});
beforeEach(async () => {
  stub.reset();
  await resetDb();
  writeFileSync(logFile, '');
});

const entries = () =>
  readFileSync(logFile, 'utf8')
    .split(/^={72}$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({ head: block.split('\n')[0], purpose: block.split(' ')[2], block }));

test('every model call of a turn is logged with its prompt and answer, the learning after it included', async () => {
  stub.state.reply = '[happy] Mun ngoan quá!';
  const meta = makeMeta({ settings: { learn: true } });
  const { status } = await postText(brain.url, meta, 'Mun nhà tớ là mèo đen');
  assert.equal(status, 200);
  await brain.deps.learner.drain();

  const logged = entries();
  assert.deepEqual(logged.map((e) => e.purpose), ['reply', 'memory_names_summary', 'memory_profile']);
  for (const e of logged) assert.ok(e.head.includes(` turn=${meta.turn_id} subject=${meta.subject} `), e.head);

  // The reply entry is exactly what the model was sent and what it said.
  const [reply, exchange] = logged;
  const sent = stub.of('openai.chat')[0].body.messages;
  assert.ok(reply.block.includes(`--- system ---\n${sent[0].content}\n--- messages (1) ---\n[user] Mun nhà tớ là mèo đen\n`));
  assert.match(reply.block, /--- answer ---\n\[happy\] Mun ngoan quá!$/);
  assert.match(reply.head, / finish=stop tokens in=\d+ out=\d+ cached=\d+$/);

  const [asked] = stub.of('openai.json', 'names');
  assert.ok(exchange.block.includes(`--- system ---\n${asked.body.messages[0].content}\n`));
  assert.ok(exchange.block.includes(`[user] ${asked.body.messages[1].content}\n--- answer ---\n`));
  // The model that answered (the stub's), which names the exact snapshot on
  // the real API, rather than the alias that was asked for.
  assert.equal(asked.body.model, 'gpt-helper-test');
  assert.match(exchange.head, / openai\/stub-model /);
});

test('a failed reply is logged with its prompt and the error', async () => {
  stub.on('openai.chat', () => ({ status: 400, json: { error: { message: 'bad model' } } }));
  const meta = makeMeta();
  const { status } = await postText(brain.url, meta, 'Xin chào');
  assert.equal(status, 502);

  const logged = entries();
  assert.equal(logged.length, 1);
  assert.ok(logged[0].head.includes(`llm reply turn=${meta.turn_id} `));
  assert.match(logged[0].block, /\[user\] Xin chào\n--- error ---\nLlmError upstream: /);
});
