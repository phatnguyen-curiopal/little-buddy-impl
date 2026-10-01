import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MOODS,
  addDays,
  botLifeBlock,
  dayKey,
  dayLabel,
  moodByScore,
  moodReasonFrom,
  pickMood,
  pickMoodScore,
} from '../../persona/botlife.js';

// mulberry32: a tiny seeded generator so the dice are reproducible.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the bands tile 0-100 exactly once', () => {
  for (let n = 0; n <= 100; n++) {
    assert.equal(MOODS.filter((m) => n >= m.range[0] && n <= m.range[1]).length, 1, `score ${n}`);
  }
  assert.equal(moodByScore(0).code, 'sad');
  assert.equal(moodByScore(100).code, 'elated');
  assert.equal(moodByScore(150).code, 'elated');
  assert.equal(moodByScore(null), null);
});

test('the day rolls at midnight in Vietnam, not UTC', () => {
  // 17:30 UTC is 00:30 the next day in Ho Chi Minh City (UTC+7).
  assert.equal(dayKey(new Date('2026-09-28T17:30:00Z')), '2026-09-29');
  assert.equal(dayKey(new Date('2026-09-28T16:59:00Z')), '2026-09-28');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('seeded dice are reproducible and land inside the picked band', () => {
  const a = pickMoodScore({ mbti: 'ENFP', rand: seeded(42) });
  const b = pickMoodScore({ mbti: 'ENFP', rand: seeded(42) });
  assert.deepEqual(a, b);
  assert.ok(a.score >= a.mood.range[0] && a.score <= a.mood.range[1]);
});

test('the first throw walks the palette in array order', () => {
  assert.equal(pickMood({ rand: () => 0 }).code, 'elated');
  assert.equal(pickMood({ rand: () => 0.999999 }).code, 'wistful');
});

test('a grey diary tilts toward grey bands, a bright one toward bright', () => {
  const count = (valence, tone) => {
    const rand = seeded(7);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (pickMood({ valence, rand }).tone === tone) hits += 1;
    return hits;
  };
  assert.ok(count('grey', 'grey') > count('normal', 'grey'));
  assert.ok(count('bright', 'bright') > count('normal', 'bright'));
});

test('the E/I letter nudges energy', () => {
  const lowShare = (mbti) => {
    const rand = seeded(3);
    let hits = 0;
    for (let i = 0; i < 4000; i++) if (pickMood({ mbti, rand }).energy === 'low') hits += 1;
    return hits;
  };
  assert.ok(lowShare('INFP') > lowShare('ENFP'));
});

test('diary days read as words', () => {
  assert.equal(dayLabel('2026-09-29', '2026-09-29', 'vi'), 'Hôm nay');
  assert.equal(dayLabel('2026-09-28', '2026-09-29', 'vi'), 'Hôm qua');
  assert.equal(dayLabel('2026-09-05', '2026-09-29', 'vi'), 'Hôm 05/09');
  assert.equal(dayLabel('2026-09-28', '2026-09-29', 'en'), 'Yesterday');
});

test('the mood reason is the first clause, lowercased', () => {
  assert.equal(moodReasonFrom('Làm rơi hộp phấn. Tiếc ghê'), 'làm rơi hộp phấn.');
});

test('the block degrades part by part and never states nothing', () => {
  assert.equal(botLifeBlock({ lang: 'vi', today: '2026-09-29' }), '');
  const onlyMood = botLifeBlock({ lang: 'vi', score: 0, today: '2026-09-29' });
  // 0 is the worst day and a valid mood, not a missing one.
  assert.match(onlyMood, /CẢM XÚC CỦA VAI HÔM NAY: 0 trên thang 100\./);
  const full = botLifeBlock({
    lang: 'en',
    backstory: 'Has a treasure box.\nLoves drawing.',
    diary: [{ day: '2026-09-29', story: 'Built a bridge', valence: 'bright' }],
    score: 80,
    reason: 'built a bridge',
    moodFeel: true,
    today: '2026-09-29',
  });
  assert.match(full, /- Has a treasure box\./);
  assert.match(full, /- Today: Built a bridge/);
  assert.match(full, /THE ROLE'S MOOD TODAY: 80 out of 100\. Because built a bridge/);
  assert.match(full, /Today the role feels: cheerful/);
});
