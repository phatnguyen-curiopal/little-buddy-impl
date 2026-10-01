import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applySummaryOps,
  factValue,
  fixNames,
  parseFix,
  parseNames,
  parseProfileOps,
  parseSummary,
} from '../../memory/extract.js';
import { isNoInfoReply } from '../../memory/learn.js';
import { mentions, mergeContexts, trustedNames } from '../../memory/names.js';

test('only names the child said survive, garbled ones through `heard`', () => {
  const parsed = {
    names: [
      { name: 'Sóc', kind: 'bạn', heard: 'sắp', note: 'Bé giận Sóc', age: 'không rõ', relation: 'bạn cùng lớp' },
      { name: 'Bụp', kind: 'khác', heard: null, note: 'nhân vật trong truyện' },
      { name: 'Mun', kind: 'thú cưng', heard: 'Mun', species: 'mèo' },
      { name: '12 cái', kind: 'khác', heard: '12' },
    ],
  };
  const { names, dropped } = parseNames(parsed, 'hôm nay tớ giận sắp rồi, còn Mun thì ngủ');
  assert.deepEqual(names.map((n) => [n.display, n.kind]), [['Sóc', 'friend'], ['Mun', 'pet']]);
  assert.equal(names[0].age, null);
  assert.equal(names[0].relation, 'bạn cùng lớp');
  assert.equal(names[1].species, 'mèo');
  assert.equal(dropped, 1);
});

test('summary ops are whitelisted and the point budget is spent in order', () => {
  const current = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  const parsed = {
    summary: {
      loai: 'thú cưng',
      ops: [
        { op: 'add', point: 'c' },
        { op: 'add', point: 'd' },
        { op: 'drop', id: 1 },
        { op: 'add', point: 'e' },
        { op: 'update', id: 99, point: 'x' },
        { op: 'update', id: 2, point: 'B' },
      ],
    },
  };
  const out = parseSummary(parsed, current, 3);
  assert.equal(out.category, 'pets');
  assert.deepEqual(out.ops, [
    { op: 'add', text: 'c' },
    { op: 'drop', id: 1 },
    { op: 'add', text: 'e' },
    { op: 'update', id: 2, text: 'B' },
  ]);
  assert.equal(out.overflow, 1);
  assert.equal(parseSummary({ summary: { ops: [] } }, current, 3), null);
  assert.equal(parseSummary({ summary: { category: 'school', ops: [] } }, [], 3).category, 'school');
});

test('applying summary ops never reuses an id and leaves untouched points identical', () => {
  const points = [{ id: 1, text: 'a' }, { id: 2, text: 'b' }];
  const { points: out, nextId } = applySummaryOps(points, 3, [
    { op: 'drop', id: 1 },
    { op: 'add', text: 'c' },
    { op: 'update', id: 2, text: 'B' },
  ]);
  assert.deepEqual(out, [{ id: 2, text: 'B' }, { id: 3, text: 'c' }]);
  assert.equal(nextId, 4);
});

test('profile ops need known ids and known categories', () => {
  const rows = [{ id: 7, category: 'likes', fact: 'kem' }];
  const ops = parseProfileOps(
    {
      ops: [
        { op: 'add', category: 'nỗi sợ', fact: 'sợ sấm' },
        { op: 'add', category: 'sự kiện', fact: 'mai đi khám' },
        { op: 'bump', id: 7 },
        { op: 'drop', id: 8 },
        { op: 'update', id: 7, fact: '' },
      ],
    },
    rows,
  );
  assert.deepEqual(ops.map((o) => [o.op, o.category ?? null]), [['add', 'fears'], ['bump', null]]);
});

test('a name fix must target a known name that the raw sentence really contained', () => {
  const known = ['Sóc', 'Buddy'];
  assert.deepEqual(parseFix({ text: 'tớ giận Sóc', fixed: [{ from: 'sắp', to: 'Sóc' }] }, 'tớ giận sắp', known), {
    text: 'tớ giận Sóc',
    fixed: [{ from: 'sắp', to: 'Sóc' }],
  });
  assert.deepEqual(parseFix({ text: 'tớ giận Na', fixed: [{ from: 'sắp', to: 'Na' }] }, 'tớ giận sắp', known).fixed, []);
  assert.deepEqual(parseFix({ text: 'tớ giận Sóc', fixed: [{ from: 'xoài', to: 'Sóc' }] }, 'tớ giận sắp', known).fixed, []);
});

test('fixNames skips the call when the sentence already says a known name', async () => {
  let calls = 0;
  const helper = { json: async () => (calls++, {}) };
  const out = await fixNames(helper, { model: 'm', lang: 'vi', text: 'Sóc hôm nay vui', known: ['Sóc'] });
  assert.equal(out.text, 'Sóc hôm nay vui');
  assert.equal(calls, 0);
  const failing = { json: async () => { throw new Error('down'); } };
  assert.deepEqual(await fixNames(failing, { model: 'm', lang: 'vi', text: 'tớ giận sắp', known: ['Sóc'] }), {
    text: 'tớ giận sắp',
    fixed: [],
  });
});

test('mentions respects Vietnamese letters as word characters', () => {
  assert.equal(mentions('hôm nay trời đẹp', 'Na'), false);
  assert.equal(mentions('Na ơi', 'Na'), true);
  assert.equal(mentions('tớ chơi với Sóc', 'sóc'), true);
});

test('trust gates names, contexts keep one note per conversation', () => {
  assert.deepEqual(trustedNames([{ display: 'A', count: 1 }, { display: 'B', count: 2 }], 2).map((r) => r.display), ['B']);
  let ctx = mergeContexts([], { note: 'n1', conversationId: 'c1', at: 't1', max: 2 });
  ctx = mergeContexts(ctx, { note: 'n2', conversationId: 'c2', at: 't2', max: 2 });
  ctx = mergeContexts(ctx, { note: 'n1b', conversationId: 'c1', at: 't3', max: 2 });
  assert.deepEqual(ctx.map((c) => c.note), ['n1b', 'n2']);
  ctx = mergeContexts(ctx, { note: 'n3', conversationId: 'c3', at: 't4', max: 2 });
  assert.deepEqual(ctx.map((c) => c.conv), ['c3', 'c1']);
  assert.equal(mergeContexts(ctx, { note: '', conversationId: 'c4', at: 't', max: 2 }), ctx);
});

test('unknown attribute values never overwrite learned ones', () => {
  assert.equal(factValue('không rõ'), null);
  assert.equal(factValue(' unknown '), null);
  assert.equal(factValue('8 tháng'), '8 tháng');
});

test('the no-info filter only catches short pure admissions', () => {
  assert.equal(isNoInfoReply('Tớ chưa biết con mèo của cậu tên gì.'), true);
  assert.equal(isNoInfoReply("I don't know yet!"), true);
  assert.equal(isNoInfoReply(`Tớ không biết Sóc đang nghĩ gì đâu, nhưng ${'mình cùng đoán nhé '.repeat(8)}`), false);
  assert.equal(isNoInfoReply('Mun là con mèo lông đen.'), false);
});
