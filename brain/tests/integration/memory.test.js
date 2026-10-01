import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import { vectorLiteral } from '../../store/db.js';
import { makeMeta, pcmSeconds, postText, postVoice, startBrain, waitFor } from '../helpers/brain.js';
import { TEST_TOKEN, testConfig } from '../helpers/config.js';
import { resetDb, setupDb, teardownDb } from '../helpers/db.js';
import { chatCompletion, fakeEmbedding, startStub } from '../helpers/stub.js';

let stub;
let pool;
let brain;

const MEMORY_TABLES = ['exchanges', 'familiar_names', 'child_facts', 'conversation_summaries'];

before(async () => {
  pool = await setupDb();
  stub = await startStub();
  brain = await startBrain(testConfig(stub.env, { MEMORY_MIN_SCORE: '0.05', MEMORY_SUMMARY_MIN_SCORE: '0.05' }), pool);
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

async function counts(subject) {
  const out = {};
  for (const table of MEMORY_TABLES) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE subject = $1`, [subject]);
    out[table] = rows[0].n;
  }
  return out;
}

// Extractor answers keyed by prompt kind, as the real helper model would.
function programExtractors({ names = [], ops = [{ op: 'add', point: 'Bé kể về Mun' }], loai = 'thú cưng', profile = [] } = {}) {
  stub.on('openai.json', (call, defaults) => {
    if (call.kind === 'names') {
      return { json: chatCompletion(JSON.stringify({ names, summary: { loai, ops } })) };
    }
    if (call.kind === 'profile') return { json: chatCompletion(JSON.stringify({ ops: profile })) };
    return defaults['openai.json'](call);
  });
}

const systemOf = (call) => call.body.messages[0].content;

test('learning off writes nothing and calls no extractor', async () => {
  const meta = makeMeta();
  await postText(brain.url, meta, 'Mun nhà tớ là mèo đen');
  await postVoice(brain.url, { ...meta, turn_id: randomUUID() }, pcmSeconds(1));
  await brain.deps.learner.drain();
  assert.deepEqual(await counts(meta.subject), { exchanges: 0, familiar_names: 0, child_facts: 0, conversation_summaries: 0 });
  assert.equal(stub.of('openai.json').length, 0);
});

test('learning on stores the exchange, names, summary and profile for the subject', async () => {
  programExtractors({
    names: [{ name: 'Mun', kind: 'thú cưng', heard: 'Mun', note: 'Mun bỏ ăn', species: 'mèo' }],
    profile: [{ op: 'add', category: 'sở thích', fact: 'thích mèo' }],
  });
  stub.state.reply = '[sad] Ôi thương Mun quá.';
  const meta = makeMeta({ settings: { learn: true } });
  const { body } = await postText(brain.url, meta, 'Mun nhà tớ bỏ ăn');
  assert.equal(body.reply, 'Ôi thương Mun quá.');
  await brain.deps.learner.drain();

  assert.deepEqual(await counts(meta.subject), { exchanges: 1, familiar_names: 1, child_facts: 1, conversation_summaries: 1 });
  const ex = await pool.query('SELECT user_text, assistant_text, conversation_id FROM exchanges');
  assert.deepEqual(ex.rows[0], { user_text: 'Mun nhà tớ bỏ ăn', assistant_text: 'Ôi thương Mun quá.', conversation_id: meta.conversation_id });
  const name = (await pool.query('SELECT * FROM familiar_names')).rows[0];
  assert.equal(name.kind, 'pet');
  assert.equal(name.species, 'mèo');
  assert.equal(name.contexts[0].note, 'Mun bỏ ăn');
  assert.equal(name.contexts[0].conv, meta.conversation_id);
  const summary = (await pool.query('SELECT points, next_id, category, embedding IS NOT NULL AS has_vec FROM conversation_summaries')).rows[0];
  assert.deepEqual(summary.points, [{ id: 1, text: 'Bé kể về Mun' }]);
  assert.equal(summary.next_id, 2);
  assert.equal(summary.category, 'pets');
  assert.equal(summary.has_vec, true);
  const fact = (await pool.query('SELECT category, fact, embedding IS NOT NULL AS has_vec FROM child_facts')).rows[0];
  assert.deepEqual(fact, { category: 'likes', fact: 'thích mèo', has_vec: true });

  // The extractor was asked in Vietnamese with the Vietnamese category list.
  const [names] = stub.of('openai.json', 'names');
  assert.match(systemOf(names), /gia đình \| trường lớp \| bạn bè \| thú cưng \| cảm xúc \| đời sống \| khác/);
  assert.match(names.body.messages[1].content, /^Bé: Mun nhà tớ bỏ ăn\nĐồ chơi: Ôi thương Mun quá\./);
  assert.equal(names.body.model, 'gpt-helper-test');
});

test('learning is serialized per subject: summary ids and name counts never race', async () => {
  programExtractors({ names: [{ name: 'Mun', kind: 'thú cưng', heard: 'Mun', note: 'x' }] });
  // Slow extractors widen the window two unserialized learns would race in.
  const original = stub.state.handlers['openai.json'];
  stub.on('openai.json', async (call, defaults) => ({ ...(await original(call, defaults)), delayMs: 150 }));
  const meta = makeMeta({ settings: { learn: true } });
  const turns = await Promise.all([
    postText(brain.url, meta, 'Mun ăn cá'),
    postText(brain.url, { ...meta, turn_id: randomUUID() }, 'Mun ngủ trên ghế sofa cả chiều'),
  ]);
  assert.deepEqual(turns.map((t) => t.status), [200, 200]);
  await brain.deps.learner.drain();

  const summary = (await pool.query('SELECT points, next_id FROM conversation_summaries')).rows[0];
  assert.deepEqual(summary.points.map((p) => p.id), [1, 2]);
  assert.equal(summary.next_id, 3);
  const name = (await pool.query('SELECT count FROM familiar_names')).rows[0];
  assert.equal(name.count, 2);
  // The second extraction saw the first one's point.
  const calls = stub.of('openai.json', 'names');
  assert.match(calls[1].body.messages[1].content, /1 \| Bé kể về Mun/);
});

test('subjects are isolated: another child never sees these memories', async () => {
  programExtractors({ names: [{ name: 'Mun', kind: 'thú cưng', heard: 'Mun', note: 'Mun là mèo đen', species: 'mèo' }] });
  const a = makeMeta({ settings: { learn: true } });
  await postText(brain.url, a, 'Mun nhà tớ là mèo đen');
  await postText(brain.url, { ...a, turn_id: randomUUID() }, 'Mun thích ăn cá');
  await brain.deps.learner.drain();

  stub.calls.length = 0;
  const b = makeMeta({ device_id: a.device_id });
  await postText(brain.url, b, 'Mun là con gì thế?');
  const systemB = systemOf(stub.of('openai.chat')[0]);
  assert.doesNotMatch(systemB, /MỚI NHẤT xếp trên cùng|NHỮNG TÊN QUEN|mèo đen|CHUYỆN MẤY HÔM/);

  stub.calls.length = 0;
  await postText(brain.url, { ...a, turn_id: randomUUID(), conversation_id: randomUUID() }, 'Mun là con gì thế?');
  const systemA = systemOf(stub.of('openai.chat')[0]);
  assert.match(systemA, /MỚI NHẤT xếp trên cùng/);
  assert.match(systemA, /Hỏi: Mun nhà tớ là mèo đen/);
  assert.match(systemA, /NHỮNG TÊN QUEN[^\n]*\nMun \(thú cưng\)/);
  assert.match(systemA, /GHI CHÚ VỀ NHÂN VẬT/);
  assert.match(systemA, /CHUYỆN MẤY HÔM GẦN ĐÂY/);
});

test('a slow embedding keeps the legs that did not need it', async () => {
  const fast = await startBrain(testConfig(stub.env, { MEMORY_WAIT_MS: '300' }), pool);
  try {
    const meta = makeMeta();
    const vec = vectorLiteral(fakeEmbedding('x'));
    await pool.query(
      `INSERT INTO conversation_summaries (subject, conversation_id, points, next_id, category, embedding, updated_at)
       VALUES ($1, $2, $3, 2, 'pets', $4::vector, now()), ($1, 'older', $5, 2, 'school', $4::vector, now() - interval '1 day')`,
      [meta.subject, meta.conversation_id, JSON.stringify([{ id: 1, text: 'đang kể về Mun' }]), vec, JSON.stringify([{ id: 1, text: 'hẹn kể chuyện trường' }])],
    );
    await pool.query("INSERT INTO child_facts (subject, category, fact) VALUES ($1, 'fears', 'sợ sấm')", [meta.subject]);
    await pool.query(
      `INSERT INTO exchanges (subject, conversation_id, user_text, assistant_text, embedding) VALUES ($1, 'older', 'tớ sợ sấm', 'tớ ở đây', $2::vector)`,
      [meta.subject, vec],
    );
    stub.on('openai.embed', (call, defaults) => ({ ...defaults['openai.embed'](call), delayMs: 3000 }));

    const started = Date.now();
    const { status, body } = await postText(fast.url, meta, 'tớ sợ sấm quá');
    assert.equal(status, 200);
    assert.ok(Date.now() - started < 2500, 'the turn did not wait for the embedding');
    assert.ok(body.timings_ms.memory >= 250 && body.timings_ms.memory < 1500);
    const system = systemOf(stub.of('openai.chat')[0]);
    assert.match(system, /CHUYỆN ĐANG NÓI HÔM NAY[^\n]*\n- đang kể về Mun/);
    assert.match(system, /CHUYỆN MẤY HÔM GẦN ĐÂY[\s\S]*hẹn kể chuyện trường/);
    assert.match(system, /VỀ BẠN NHỎ[^\n]*\n- Nỗi sợ: sợ sấm/);
    assert.doesNotMatch(system, /MỚI NHẤT xếp trên cùng|CHUYỆN CŨ/);
  } finally {
    await fast.close();
  }
});

test('a turn the backend abandons writes no history and learns nothing', async () => {
  programExtractors({ names: [{ name: 'Mun', kind: 'thú cưng', heard: 'Mun', note: 'x' }] });
  stub.on('openai.chat', () => ({ json: chatCompletion('[happy] quá muộn'), delayMs: 3000 }));
  const meta = makeMeta({ settings: { learn: true } });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 300);
  await assert.rejects(postText(brain.url, meta, 'Mun ơi', { signal: controller.signal }));
  assert.ok(await waitFor(() => stub.of('openai.chat')[0]?.aborted), 'the upstream call was aborted');
  await brain.deps.learner.drain();
  assert.deepEqual(await counts(meta.subject), { exchanges: 0, familiar_names: 0, child_facts: 0, conversation_summaries: 0 });
  assert.equal(stub.of('openai.json').length, 0);

  stub.reset();
  await postText(brain.url, { ...meta, turn_id: randomUUID() }, 'lại đây');
  assert.equal(stub.of('openai.chat')[0].body.messages.length, 2, 'no history from the abandoned turn');
});

test('DELETE /v1/subjects/:subject wipes that subject, its history, and nothing else', async () => {
  programExtractors({
    names: [{ name: 'Mun', kind: 'thú cưng', heard: 'Mun', note: 'x' }],
    profile: [{ op: 'add', category: 'sở thích', fact: 'mèo' }],
  });
  const device = randomUUID();
  const family = randomUUID();
  const mine = makeMeta({ subject: `device:${device}:${family}`, device_id: device, settings: { learn: true } });
  const other = makeMeta({ settings: { learn: true } });
  await postText(brain.url, mine, 'Mun ngủ rồi');
  await postText(brain.url, other, 'Mun dậy rồi');
  await brain.deps.learner.drain();
  assert.equal((await counts(mine.subject)).exchanges, 1);

  const res = await fetch(`${brain.url}/v1/subjects/${mine.subject}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(res.status, 204);
  assert.deepEqual(await counts(mine.subject), { exchanges: 0, familiar_names: 0, child_facts: 0, conversation_summaries: 0 });
  assert.deepEqual(await counts(other.subject), { exchanges: 1, familiar_names: 1, child_facts: 1, conversation_summaries: 1 });

  stub.calls.length = 0;
  await postText(brain.url, { ...mine, turn_id: randomUUID(), settings: { ...mine.settings, learn: false } }, 'còn nhớ không?');
  assert.equal(stub.of('openai.chat')[0].body.messages.length, 2, 'history is gone too');

  const bad = await fetch(`${brain.url}/v1/subjects/family:1`, { method: 'DELETE', headers: { authorization: `Bearer ${TEST_TOKEN}` } });
  assert.equal(bad.status, 400);
});

test('only trusted names bias STT and get corrected; the raw words reach the model', async () => {
  const meta = makeMeta();
  await pool.query(
    `INSERT INTO familiar_names (subject, name, display, kind, count) VALUES ($1, 'sóc', 'Sóc', 'friend', 3), ($1, 'pôm', 'Pôm', 'pet', 1)`,
    [meta.subject],
  );
  stub.state.transcript = 'hôm nay tớ giận sắp';
  stub.on('openai.json', (call, defaults) => {
    if (call.kind !== 'fix') return defaults['openai.json'](call);
    return { json: chatCompletion(JSON.stringify({ text: 'hôm nay tớ giận Sóc', fixed: [{ from: 'sắp', to: 'Sóc' }] })) };
  });
  const { body } = await postVoice(brain.url, meta, pcmSeconds(1));
  assert.equal(body.heard, 'hôm nay tớ giận sắp');
  assert.deepEqual(stub.of('eleven.stt')[0].form.keyterms, ['Sóc']);
  const [fix] = stub.of('openai.json', 'fix');
  assert.match(fix.body.messages[1].content, /^Tên đã biết: Sóc\nCâu của bé: hôm nay tớ giận sắp$/);
  const chat = stub.of('openai.chat')[0];
  assert.match(systemOf(chat), /NHỮNG TÊN QUEN[^\n]*\nSóc \(bạn\)$/m);
  assert.match(systemOf(chat), /ĐÃ SỬA TÊN[^\n]*\n  "sắp" chính là Sóc/);
  assert.equal(chat.body.messages.at(-1).content, 'hôm nay tớ giận sắp');
  // Text turns are typed, so the corrector never runs on them.
  stub.calls.length = 0;
  await postText(brain.url, { ...meta, turn_id: randomUUID() }, 'tớ giận sắp');
  assert.equal(stub.of('openai.json', 'fix').length, 0);
});

test('memory off: no embeddings, no memory blocks, and learn=true stores nothing', async () => {
  const off = await startBrain(testConfig(stub.env, { MEMORY_ENABLED: '0' }), pool);
  try {
    const meta = makeMeta({ settings: { learn: true } });
    await postText(off.url, meta, 'Mun ơi');
    await off.deps.learner.drain();
    assert.equal(stub.of('openai.embed').length, 0);
    assert.equal((await counts(meta.subject)).exchanges, 0);
  } finally {
    await off.close();
  }
});
