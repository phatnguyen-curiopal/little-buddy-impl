import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  memoryBlock,
  nameContextBlock,
  nameFixBlock,
  namesBlock,
  profileBlock,
  renderSummary,
  summaryBlock,
} from '../../memory/blocks.js';

const names = [
  { display: 'Mun', kind: 'pet', count: 5, species: 'mèo', contexts: [{ conv: 'c1', at: '2026-09-20T10:00:00Z', note: 'Mun bỏ ăn' }] },
  { display: 'Pôm', kind: 'other', count: 1, contexts: [] },
  { display: 'Sóc', kind: 'friend', count: 3, contexts: [] },
];

test('only trusted names reach the names block, words in the turn language', () => {
  const vi = namesBlock(names, { trust: 2, lang: 'vi' });
  assert.match(vi, /^NHỮNG TÊN QUEN/);
  assert.match(vi, /Mun \(thú cưng\), Sóc \(bạn\)$/);
  assert.doesNotMatch(vi, /Pôm/);
  assert.match(namesBlock(names, { trust: 2, lang: 'en' }), /Mun \(pet\), Sóc \(friend\)$/);
  assert.equal(namesBlock(names, { trust: 9, lang: 'vi' }), '');
});

test('name notes render only for names the sentence mentions', () => {
  assert.equal(nameContextBlock(names, 'hôm nay trời mưa', { lang: 'vi' }), '');
  const block = nameContextBlock(names, 'Mun dạo này thế nào?', { lang: 'vi' });
  assert.match(block, /^GHI CHÚ VỀ NHÂN VẬT/);
  assert.match(block, /  Mun \(thú cưng: mèo\):\n    \[2026-09-20\] Mun bỏ ăn/);
});

test('the name fix block states the correction as fact', () => {
  assert.equal(nameFixBlock([], { lang: 'vi' }), '');
  assert.match(nameFixBlock([{ from: 'sắp', to: 'Sóc' }], { lang: 'vi' }), /"sắp" chính là Sóc$/);
});

test('profile facts group under fixed labels within the char budget', () => {
  const rows = [
    { category: 'fears', fact: 'sấm' },
    { category: 'likes', fact: 'kem' },
    { category: 'likes', fact: 'vẽ' },
  ];
  assert.match(profileBlock(rows, { lang: 'vi' }), /\n- Sở thích: kem, vẽ\n- Nỗi sợ: sấm$/);
  assert.match(profileBlock(rows, { lang: 'en' }), /\n- Likes: kem, vẽ\n- Fears: sấm$/);
  assert.equal(profileBlock([], { lang: 'vi' }), '');
});

test('summaries render one terminator per point and three distinct parts', () => {
  assert.equal(renderSummary({ points: [{ id: 1, text: 'Mun nằm lì.' }, { id: 2, text: 'Hôm nay khỏi' }] }), 'Mun nằm lì. Hôm nay khỏi');
  const row = (id, day, category) => ({ conversation_id: id, updated_at: `${day}T08:00:00Z`, category, points: [{ id: 1, text: id }] });
  const block = summaryBlock({
    current: { points: [{ id: 1, text: 'đang kể về Mun' }] },
    recent: [row('r1', '2026-09-28', 'pets')],
    past: [row('r1', '2026-09-28', 'pets'), row('p1', '2026-09-01', 'school'), row('v1', '2026-08-01', null)],
    exclude: ['v1'],
    retrieval: true,
    verbatim: true,
    lang: 'vi',
  });
  assert.match(block, /^CHUYỆN ĐANG NÓI HÔM NAY[^\n]*\n- đang kể về Mun/);
  assert.match(block, /CHUYỆN MẤY HÔM GẦN ĐÂY[\s\S]*- 2026-09-28 \[thú cưng\]: r1/);
  assert.match(block, /CHUYỆN CŨ \(tóm tắt máy viết[^\n]*\n- 2026-09-01 \[trường lớp\]: p1$/);
  // Recent summaries answer to MEMORY_SUMMARY, not to MEMORY_RETRIEVAL.
  const verbatimOnly = summaryBlock({ current: { points: [{ id: 1, text: 'x' }] }, recent: [row('r1', '2026-09-28')], past: [row('p1', '2026-09-01')], retrieval: false, verbatim: true, lang: 'vi' });
  assert.doesNotMatch(verbatimOnly, /CHUYỆN ĐANG NÓI|CHUYỆN CŨ/);
  assert.match(verbatimOnly, /CHUYỆN MẤY HÔM GẦN ĐÂY/);
});

test('verbatim memories render as quotes, conversations grouped', () => {
  const at = '2026-09-10T09:00:00Z';
  const block = memoryBlock(
    [
      [{ user_text: 'Mun bỏ ăn', assistant_text: 'Ôi thương Mun', created_at: at }, { user_text: 'Mun khỏi rồi', assistant_text: 'Tốt quá', created_at: at }],
      [{ user_text: 'tớ sợ sấm', assistant_text: 'Tớ ở đây', created_at: at }],
    ],
    { lang: 'vi' },
  );
  assert.match(block, /^Ký ức liên quan/);
  assert.match(block, /- \[2026-09-10\] Cuộc trò chuyện:\n    Hỏi: Mun bỏ ăn → Đáp: Ôi thương Mun\n    Hỏi: Mun khỏi rồi → Đáp: Tốt quá/);
  assert.match(block, /- \[2026-09-10\] Hỏi: tớ sợ sấm → Đáp: Tớ ở đây$/);
  assert.equal(memoryBlock([], { lang: 'vi' }), '');
});
