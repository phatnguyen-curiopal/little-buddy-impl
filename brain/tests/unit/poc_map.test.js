import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMBED_DIMS } from '../../memory/embed.js';
import { checkDiary, diaryRows } from '../../scripts/seed_botlife.js';
import { mapWorld } from '../../scripts/import_poc.js';
import { clusterConversations, mapFact, mapName, mapSummary, parseVector } from '../../scripts/poc_map.js';

const vecText = JSON.stringify(new Array(EMBED_DIMS).fill(0.01));

test('missing conversation ids cluster by the 3-minute gap rule', () => {
  const rows = [
    { id: 1, created_at: '2026-09-01T10:00:00Z', conversation_id: null },
    { id: 2, created_at: '2026-09-01T10:02:00Z', conversation_id: null },
    { id: 3, created_at: '2026-09-01T10:06:00Z', conversation_id: null },
    { id: 4, created_at: '2026-09-01T10:07:00Z', conversation_id: 'c-kept' },
    { id: 5, created_at: '2026-09-01T10:08:00Z', conversation_id: null },
  ];
  const ids = clusterConversations(rows, 'T');
  assert.equal(ids.get('1'), 'bfT-1');
  assert.equal(ids.get('2'), 'bfT-1');
  assert.equal(ids.get('3'), 'bfT-2');
  assert.equal(ids.get('5'), 'bfT-2');
  assert.equal(ids.has('4'), false);
});

test('vectors must be exactly 3072 wide', () => {
  assert.equal(parseVector(vecText).length, EMBED_DIMS);
  assert.equal(parseVector(null), null);
  assert.throws(() => parseVector('[1,2,3]'), /3072/);
});

test('names, facts and summaries map their Vietnamese enums to codes', () => {
  const name = mapName({ name: 'Mun', display: 'Mun', kind: 'thú cưng', count: 4, contexts: [{ conv: 'c-1', note: 'x' }] });
  assert.equal(name.name, 'mun');
  assert.equal(name.kind, 'pet');
  assert.deepEqual(name.contexts, [{ conv: 'c-1', note: 'x' }]);
  assert.equal(mapName({ name: 'X', display: 'X', kind: 'lạ', count: 1 }).kind, 'other');

  assert.equal(mapFact({ category: 'sở thích', fact: 'kem', count: 2, embedding: null }).category, 'likes');
  assert.equal(mapFact({ category: 'sự kiện', fact: 'mai đi khám' }), null);

  const summary = mapSummary({ conversation_id: 'c-1', points: [{ id: 4, text: 'a' }], next_id: null, category: 'bạn bè', embedding: vecText });
  assert.equal(summary.category, 'friends');
  assert.equal(summary.next_id, 5);
  assert.equal(summary.embedding.length, EMBED_DIMS);
});

test('a whole world maps with counts of what was clustered and skipped', () => {
  const mapped = mapWorld(
    {
      memories: [{ id: 1, user_text: 'u', assistant_text: 'a', embedding: vecText, created_at: '2026-09-01T10:00:00Z', conversation_id: null }],
      names: [],
      facts: [{ category: 'sự kiện', fact: 'x' }, { category: 'nỗi sợ', fact: 'sấm', embedding: null }],
      summaries: [],
    },
    'Z',
  );
  assert.equal(mapped.exchanges[0].conversationId, 'bfZ-1');
  assert.equal(mapped.clustered, 1);
  assert.equal(mapped.skippedFacts, 1);
  assert.equal(mapped.facts[0].category, 'fears');
});

test('the diary seed is valid and dated relative to today in both languages', () => {
  assert.doesNotThrow(() => checkDiary());
  const rows = diaryRows('friend', '2026-09-29');
  assert.equal(rows.length, 24);
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.lang, r.day, r.valence]), [['vi', '2026-09-29', 'bright'], ['en', '2026-09-29', 'bright']]);
  assert.ok(rows.some((r) => r.day === '2026-09-15'));
  assert.throws(() => checkDiary({ friend: [{ daysAgo: 1, valence: 'sáng', vi: 'a', en: 'b' }] }), /valence/);
});
