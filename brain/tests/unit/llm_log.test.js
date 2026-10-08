import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createLlmLog, formatEntry, withLlmContext } from '../../llm/log_tap.js';

const AT = new Date('2026-10-08T03:00:00.000Z');

test('an answered call shows who asked, what the model saw and what it said', () => {
  const text = formatEntry({
    at: AT.toISOString(),
    purpose: 'reply',
    turn_id: 't1',
    subject: 'child:c1',
    provider: 'openai',
    model: 'gpt-x',
    ms: 812,
    finish: 'stop',
    usage: { input: 1200, output: 40, cached: 1024 },
    system: 'Bạn là Buddy.\nLuôn bắt đầu bằng thẻ cảm xúc.',
    messages: [{ role: 'user', content: 'Chào Buddy' }, { role: 'assistant', content: '[happy] Chào bạn!' }, { role: 'user', content: 'Kể chuyện đi' }],
    answer: '[excited] Ngày xửa ngày xưa...',
  });
  assert.equal(
    text.split('\n')[0],
    '2026-10-08T03:00:00.000Z llm reply turn=t1 subject=child:c1 openai/gpt-x 812 ms finish=stop tokens in=1200 out=40 cached=1024',
  );
  assert.match(text, /--- system ---\nBạn là Buddy\.\nLuôn bắt đầu bằng thẻ cảm xúc\.\n--- messages \(3\) ---\n\[user\] Chào Buddy\n\[assistant\] \[happy\] Chào bạn!\n\[user\] Kể chuyện đi\n/);
  assert.match(text, /--- answer ---\n\[excited\] Ngày xửa ngày xưa\.\.\.\n={72}\n$/);
});

test('a failed call records the error instead of an answer', () => {
  const err = Object.assign(new Error('deadline passed'), { name: 'LlmError', kind: 'timeout' });
  const text = formatEntry({ at: AT.toISOString(), purpose: 'name_fix', provider: 'openai', model: 'mini', ms: 3000, system: 's', messages: [], error: err });
  assert.match(text, /^\S+ llm name_fix openai\/mini 3000 ms\n/);
  assert.match(text, /--- error ---\nLlmError timeout: deadline passed\n/);
  assert.doesNotMatch(text, /--- answer ---/);
});

test('no path means no log at all', () => {
  assert.equal(createLlmLog(''), null);
  assert.equal(createLlmLog(undefined), null);
});

test('entries carry the turn they were made in, also from work chained inside it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'llm-log-'));
  const file = path.join(dir, 'nested', 'llm.log');
  const llmLog = createLlmLog(file, { now: () => AT });
  const call = (purpose) => llmLog.record({ purpose, provider: 'openai', model: 'm', ms: 1, system: 's', messages: [], answer: 'a' });

  let chained;
  await withLlmContext({ turn_id: 't9', subject: 'child:c9' }, async () => {
    call('reply');
    // As the learner does: queued now, run after the turn has returned.
    chained = Promise.resolve().then(() => new Promise((r) => setTimeout(r, 5))).then(() => call('memory_profile'));
  });
  call('outside');
  await chained;

  const heads = readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('2026-'));
  assert.deepEqual(heads.map((h) => h.split(' ').slice(1, 5).join(' ')), [
    'llm reply turn=t9 subject=child:c9',
    'llm outside openai/m 1',
    'llm memory_profile turn=t9 subject=child:c9',
  ]);
});

test('a broken log path never throws into the turn', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'llm-log-'));
  const blocker = path.join(dir, 'file');
  writeFileSync(blocker, 'x');
  const llmLog = createLlmLog(path.join(blocker, 'llm.log'));
  assert.doesNotThrow(() => llmLog.record({ purpose: 'reply', provider: 'p', model: 'm', ms: 1, messages: [], answer: 'a' }));
});
