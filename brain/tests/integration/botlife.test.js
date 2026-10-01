import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';

import { dayKey, addDays } from '../../persona/botlife.js';
import { loadLife, resolveMood } from '../../persona/life.js';
import { seedBotLife } from '../../scripts/seed_botlife.js';
import { makeMeta, postText, startBrain } from '../helpers/brain.js';
import { testConfig } from '../helpers/config.js';
import { resetDb, setupDb, teardownDb } from '../helpers/db.js';
import { startStub } from '../helpers/stub.js';

let stub;
let pool;
let brain;

before(async () => {
  pool = await setupDb();
  stub = await startStub();
  brain = await startBrain(testConfig(stub.env), pool);
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

const systemOf = (i = 0) => stub.of('openai.chat')[i].body.messages[0].content;

test('the seed writes both languages for the four roles and is idempotent', async () => {
  const first = await seedBotLife(pool, { today: '2026-09-29' });
  assert.equal(first.backstories, 8);
  assert.equal(first.added, 2 * (12 + 4 + 4 + 4));
  const again = await seedBotLife(pool, { today: '2026-09-29' });
  assert.deepEqual([again.backstories, again.added], [0, 0]);
  const { rows } = await pool.query("SELECT lang, count(*)::int AS n FROM diary WHERE role = 'friend' GROUP BY lang ORDER BY lang");
  assert.deepEqual(rows, [{ lang: 'en', n: 12 }, { lang: 'vi', n: 12 }]);
  const wiped = await seedBotLife(pool, { only: 'teacher', wipe: true, resetProfile: true, today: '2026-09-30' });
  assert.equal(wiped.wiped, 8);
  assert.equal(wiped.backstories, 2);
  await assert.rejects(seedBotLife(pool, { only: 'robot' }), /not one of/);
});

test('an unpinned toy rolls one mood per Vietnam day and keeps it, even with learning off', async () => {
  await seedBotLife(pool);
  const meta = makeMeta();
  await postText(brain.url, meta, 'chào');
  await postText(brain.url, { ...meta, turn_id: randomUUID() }, 'chào lần nữa');
  const { rows } = await pool.query('SELECT device_id, to_char(day, \'YYYY-MM-DD\') AS day, score FROM moods');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].device_id, meta.device_id);
  assert.equal(rows[0].day, dayKey());
  const line = `CẢM XÚC CỦA VAI HÔM NAY: ${rows[0].score} trên thang 100.`;
  assert.ok(systemOf(0).includes(line));
  assert.ok(systemOf(1).includes(line));
  // The diary and backstory of the role ride the prompt.
  assert.match(systemOf(0), /ĐỜI SỐNG CỦA VAI[\s\S]*- Có một hộp kho báu[\s\S]*Mấy hôm nay của vai:\n- Hôm nay: Xếp xong một cái cầu/);

  // Another toy gets its own mood row.
  await postText(brain.url, makeMeta(), 'chào');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM moods')).rows[0].n, 2);
});

test('a pinned mood is used as is and writes nothing', async () => {
  const meta = makeMeta({ settings: { mood_pin: 0, language: 'en' } });
  await postText(brain.url, meta, 'hi');
  assert.match(systemOf(), /THE ROLE'S MOOD TODAY: 0 out of 100\./);
  // With no backstory row, the built-in one is used.
  assert.match(systemOf(), /- Has a treasure box/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM moods')).rows[0].n, 0);
});

test('BOT_LIFE_ENABLED=0 leaves the life block and moods out', async () => {
  const off = await startBrain(testConfig(stub.env, { BOT_LIFE_ENABLED: '0' }), pool);
  try {
    await postText(off.url, makeMeta(), 'hi');
    assert.doesNotMatch(systemOf(), /ĐỜI SỐNG CỦA VAI/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM moods')).rows[0].n, 0);
  } finally {
    await off.close();
  }
});

test('a fresh grey page explains a grey mood; a stale one does not tilt', async () => {
  const today = '2026-09-29';
  const deviceId = randomUUID();
  await pool.query(
    "INSERT INTO diary (role, lang, day, story, valence) VALUES ('daddy', 'vi', $1, 'Đóng cái kệ bị lệch. Buồn ghê', 'grey')",
    [addDays(today, -1)],
  );
  // rand 0.99 lands the band throw on the last (grey) band.
  const row = await resolveMood(pool, { deviceId, role: 'daddy', lang: 'vi', personality: 'ISTJ', today, rand: () => 0.99 });
  assert.equal(row.reason_day, addDays(today, -1));
  const life = await loadLife(pool, {
    config: testConfig(stub.env),
    deviceId,
    buddy: { role: 'daddy', personality: 'ISTJ' },
    lang: 'vi',
    now: new Date(`${today}T05:00:00Z`),
  });
  assert.match(life.block, /Vì đóng cái kệ bị lệch\./);
  assert.match(life.block, /- Hôm qua: Đóng cái kệ bị lệch/);

  const stale = await resolveMood(pool, { deviceId: randomUUID(), role: 'daddy', lang: 'vi', personality: 'ISTJ', today: addDays(today, 10), rand: () => 0.99 });
  assert.equal(stale.reason_day, null);
});
