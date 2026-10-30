// A year in the life of three children, replayed through the backend once
// (replay.ts), and what must be true of everything it left behind. Expected
// values come from the histories themselves, so editing a history moves the
// expectations with it. Tests that change data work on a copy, and tests
// that move the clock put it back.
//
// Tests marked todo pin a defect the year exposed; they run and report, but
// do not fail the suite until the defect is fixed.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { fakeClassify } from '../../src/gateway/fake.ts';
import type { LearnResult } from '../../src/gateway/schemas.ts';
import { scheduleTick } from '../../src/jobs/handlers.ts';
import { createWorker } from '../../src/jobs/worker.ts';
import { buildDigest } from '../../src/memory/digest.ts';
import { learnFromTurn } from '../../src/memory/learner.ts';
import { nameKey } from '../../src/memory/names.ts';
import { dueItems, recall } from '../../src/memory/recall.ts';
import { KIDS } from './kids/index.ts';
import type { PlannedSession, PlannedTurn } from './plan.ts';
import { replayYear, type Year } from './replay.ts';
import { HISTORY_END, addDays, localDate, localToUtc, weekday } from './time.ts';
import type { KidHistory } from './types.ts';

const DAY = 86_400_000;
let year: Year;

const rows = async <R = Record<string, any>>(sql: string, params: unknown[] = []) => (await year.db.query<R>(sql, params)).rows;
const one = async <R = Record<string, any>>(sql: string, params: unknown[] = []) => (await rows<R>(sql, params))[0];
const child = (kid: string) => year.kids[kid].childId;
const history = (kid: string): KidHistory => year.histories[kid];
const story = (kid: string, id: string): PlannedSession => {
  const s = year.plans[kid].find((p) => p.id === id);
  assert.ok(s, `no story session ${id}`);
  return s;
};

function learningOn(kid: string, at: Date): boolean {
  const h = history(kid);
  const toggles = h.parentActions
    .filter((a) => a.do === 'learning')
    .map((a) => ({ at: localToUtc(a.at, h.child.timeZone), on: (a as { on: boolean }).on }))
    .filter((t) => t.at <= at)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return toggles.length ? toggles[toggles.length - 1].on : h.setup.learning;
}

// Every turn the learner saw: sessions that started while learning was on.
function learnedTurns(kid: string): (PlannedTurn & { learned: LearnResult })[] {
  return year.plans[kid].filter((s) => learningOn(kid, s.start)).flatMap((s) => s.turns).filter((t): t is PlannedTurn & { learned: LearnResult } => t.learned !== null);
}

const peopleNamed = (kid: string, keys: string[]) => learnedTurns(kid).flatMap((t) => t.learned.people).filter((p) => keys.includes(nameKey(p.name))).length;
const factEntries = (kid: string, statement: string, category: string) =>
  learnedTurns(kid).filter((t) => t.learned.facts.some((f) => f.statement === statement && f.category === category));

async function fact(kid: string, statement: string) {
  return one<{ id: string; status: string; source: string; confidence: number; weight: number; mentions: number; person_id: string | null; embedded: boolean; sensitivity: string; reality: string }>(
    `SELECT id, status, source, confidence, weight, mentions, person_id, embedding IS NOT NULL AS embedded, sensitivity, reality
     FROM fact WHERE child_id = $1 AND statement = $2 ORDER BY status, first_seen_at DESC LIMIT 1`,
    [child(kid), statement],
  );
}

async function onCopy(fn: (copy: Awaited<ReturnType<Year['copy']>>) => Promise<void>) {
  const copy = await year.copy();
  try {
    await fn(copy);
  } finally {
    year.clock.set(HISTORY_END);
    await copy.close();
  }
}

// A turn said "now" on a copy, learned the way the worker learns it.
async function sayNow(copy: Awaited<ReturnType<Year['copy']>>, kid: string, c: string, b: string, learned: LearnResult) {
  const ids = year.kids[kid];
  const instance = (await copy.db.query<{ id: string }>("SELECT id FROM character_instance WHERE child_id = $1 AND status = 'active'", [ids.childId])).rows[0].id;
  const session = (await copy.db.query<{ id: string }>('INSERT INTO chat_session (child_id, instance_id, device_id, turns) VALUES ($1, $2, $3, 1) RETURNING id', [ids.childId, instance, ids.deviceId])).rows[0].id;
  await copy.db.query('SELECT ensure_turn_partition($1::date)', [new Date().toISOString().slice(0, 10)]);
  const turn = (await copy.db.query<{ id: string }>(
    "INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language) VALUES ($1, $2, $3, $4, 'happy', 'answer', 'vi') RETURNING id",
    [session, ids.childId, c, b],
  )).rows[0].id;
  year.gateway.teach(c, b, learned);
  return learnFromTurn(copy.deps, turn);
}

const learn = (over: Partial<LearnResult>): LearnResult => ({ people: [], facts: [], events: [], promises: [], relationship: [], canon: [], ...over });

before(async () => {
  year = await replayYear(KIDS);
}, { timeout: 300_000 });

after(async () => {
  await year?.close();
});

describe('the replayed year', () => {
  it('covers more than a year of conversations for each child, without a warning or a dead job', async (t) => {
    t.diagnostic(`replayed in ${year.record.ms} ms, ${year.record.jobs} jobs`);
    for (const kid of Object.keys(year.kids)) {
      const span = await one<{ first: Date; last: Date; n: number }>('SELECT min(started_at) AS first, max(started_at) AS last, count(*)::int AS n FROM chat_session WHERE child_id = $1', [child(kid)]);
      assert.equal(span.n, year.plans[kid].length, `${kid}: one chat session per sitting`);
      assert.ok(span.last.getTime() - span.first.getTime() > 365 * DAY, `${kid}: more than a year`);
    }
    assert.deepEqual(year.record.logged, [], 'the backend logged no warning or error');
    assert.equal(year.gateway.misses.episode, 0, 'every session was summarised from its own transcript');
    const jobs = await rows<{ status: string; n: number }>("SELECT status, count(*)::int AS n FROM job WHERE status <> 'done' GROUP BY status");
    assert.deepEqual(jobs, [], 'no job is left dead, running or waiting');
  });

  it('counts every turn once in the daily usage, on the child\'s local day', async () => {
    for (const kid of Object.keys(year.kids)) {
      const tz = history(kid).child.timeZone;
      const usage = await rows<{ day: string; turns: number }>('SELECT day::text AS day, turns FROM usage_daily WHERE child_id = $1 ORDER BY day', [child(kid)]);
      const expected = new Map<string, number>();
      for (const s of year.plans[kid]) for (const t of s.turns) expected.set(localDate(t.at, tz), (expected.get(localDate(t.at, tz)) ?? 0) + 1);
      assert.deepEqual(Object.fromEntries(usage.map((u) => [u.day, u.turns])), Object.fromEntries([...expected].sort()), kid);
    }
  });

  it('records each friendship moving from meeting to best friends', () => {
    for (const kid of ['mai', 'lily']) {
      assert.deepEqual(year.record.stages[kid].map((s) => s.stage), ['meeting', 'buddies', 'best_friends'], kid);
    }
    const mai = year.record.stages.mai;
    assert.ok(mai[2].date < addDays(history('mai').start.slice(0, 10), 42), 'a daily talker is best friends within six weeks');
    // Minh changed character in January: the new friendship starts over.
    assert.deepEqual(year.record.stages.minh.map((s) => s.stage), ['meeting', 'buddies', 'best_friends', 'meeting', 'buddies', 'best_friends']);
    assert.equal(year.record.stages.minh[3].date, '2026-01-11');
  });
});

describe('the 30-day rule over a year', () => {
  it('keeps only the last month of words, in whole-day partitions', async () => {
    const parts = await rows<{ name: string }>(
      "SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'turn' ORDER BY 1",
    );
    const days = parts.map((p) => p.name.slice(5).replaceAll('_', '-'));
    const cutoff = new Date(HISTORY_END.getTime() - 31 * DAY).toISOString().slice(0, 10);
    assert.ok(days.every((d) => d >= cutoff), `oldest partition ${days[0]}`);
    assert.ok(parts.length >= 30 && parts.length <= 33, `${parts.length} partitions`);

    for (const kid of Object.keys(year.kids)) {
      const kept = await one<{ n: number }>('SELECT count(*)::int AS n FROM turn WHERE child_id = $1', [child(kid)]);
      const expected = year.plans[kid].flatMap((s) => s.turns).filter((t) => t.at.toISOString().slice(0, 10) >= days[0]).length;
      assert.equal(kept.n, expected, `${kid}: exactly the turns since ${days[0]}`);
    }
  });

  it('keeps what was learned from turns that are long gone', async () => {
    for (const kid of Object.keys(year.kids)) {
      const orphans = await one<{ n: number; oldest: Date }>(
        `SELECT count(*)::int AS n, min(e.observed_at) AS oldest FROM fact_evidence e JOIN fact f ON f.id = e.fact_id
         WHERE f.child_id = $1 AND NOT EXISTS (SELECT 1 FROM turn t WHERE t.id = e.turn_id)`,
        [child(kid)],
      );
      assert.ok(orphans.n > 0, `${kid}: evidence outlives its turns`);
      assert.ok(orphans.oldest < new Date('2025-11-01'), `${kid}: evidence from the first weeks is still there`);
      const episodes = await one<{ n: number; first: Date }>('SELECT count(*)::int AS n, min(started_at) AS first FROM episode WHERE child_id = $1', [child(kid)]);
      assert.ok(episodes.first < new Date('2025-10-15'), `${kid}: episodes from the first days survive`);
    }
  });

  it('summarised every sitting into one episode, except those after the last night or without consent', async () => {
    for (const kid of Object.keys(year.kids)) {
      const lastNight = (await one<{ at: Date }>('SELECT max(started_at) AS at FROM nightly_run WHERE child_id = $1', [child(kid)])).at;
      const missing = await rows<{ started_at: Date }>(
        'SELECT s.started_at FROM chat_session s WHERE s.child_id = $1 AND NOT EXISTS (SELECT 1 FROM episode e WHERE e.session_id = s.id)',
        [child(kid)],
      );
      const unexplained = missing.filter((m) => m.started_at <= lastNight && learningOn(kid, m.started_at));
      assert.deepEqual(unexplained, [], `${kid}: only sittings after the last night or while learning was off lack an episode`);
    }
  });
});

describe('who Buddy remembers', () => {
  it('keeps one card per person all year, merging names speech recognition got wrong', async () => {
    const mai = await rows<{ display_name: string; mentions: number }>("SELECT display_name, mentions FROM person WHERE child_id = $1 AND status = 'active'", [child('mai')]);
    const names = mai.map((p) => p.display_name).sort();
    for (const name of ['Mướp', 'Linh', 'cô Hoa', 'Vàng', 'Bà nội', 'Bin', 'cô Thảo', 'Khang']) assert.ok(names.includes(name), `Mai knows ${name}`);
    assert.ok(!names.includes('Mứp'), 'the misheard cat merged into Mướp');
    assert.ok(!names.includes('Bông'), 'the card the parent deleted stays deleted');
    assert.equal(mai.find((p) => p.display_name === 'Mướp')!.mentions, peopleNamed('mai', ['muop', 'mup']), 'every mention of the cat, either spelling, counted once');

    const cocoa = await one<{ mentions: number }>("SELECT mentions FROM person WHERE child_id = $1 AND display_name = 'Cocoa'", [child('lily')]);
    assert.equal(cocoa.mentions, peopleNamed('lily', ['cocoa', 'coco']), 'Coco is Cocoa');
  });

  it('follows a renamed card through the old name', async () => {
    const cards = await rows<{ display_name: string; aliases: string[]; kind: string; mentions: number }>(
      "SELECT display_name, aliases, kind, mentions FROM person WHERE child_id = $1 AND name_key LIKE '%sparkles'",
      [child('lily')],
    );
    assert.equal(cards.length, 1, 'one card for the unicorn');
    assert.equal(cards[0].display_name, 'Sir Sparkles');
    assert.deepEqual(cards[0].aliases, [nameKey('Mr. Sparkles')]);
    assert.equal(cards[0].kind, 'pretend');
    assert.equal(cards[0].mentions, peopleNamed('lily', [nameKey('Mr. Sparkles'), nameKey('Sir Sparkles')]));
  });

  it('gives a grandmother called "Bà" her own card instead of merging her into Bảo', async () => {
    const grandma = await one<{ display_name: string }>("SELECT display_name FROM person WHERE child_id = $1 AND relation = 'bà nội'", [child('minh')]);
    assert.equal(grandma?.display_name, 'Bà');
    const bao = await one<{ mentions: number }>("SELECT mentions FROM person WHERE child_id = $1 AND display_name = 'Bảo'", [child('minh')]);
    assert.equal(bao.mentions, peopleNamed('minh', ['bao']), 'Bảo counts only his own mentions');
  });
});

describe('what Buddy knows', () => {
  it('lets a correction replace the old fact, months later', async () => {
    for (const [kid, old, now] of [['mai', 'thích màu hồng', 'thích màu tím'], ['minh', 'học lớp 2', 'học lớp 3'], ['lily', 'Cocoa is a boy', 'Cocoa is a girl']]) {
      assert.equal((await fact(kid, old)).status, 'superseded', `${kid}: "${old}" is replaced`);
      assert.equal((await fact(kid, now)).status, 'active', `${kid}: "${now}" is current`);
    }
    const cocoa = await one<{ id: string }>("SELECT id FROM person WHERE child_id = $1 AND display_name = 'Cocoa'", [child('lily')]);
    assert.equal((await fact('lily', 'Cocoa is a girl')).person_id, cocoa.id, 'a fact about Cocoa hangs on her card');
  });

  it('keeps the parent\'s word, and makes it searchable overnight', async () => {
    const fixed = await fact('mai', 'thích ăn sữa chua');
    assert.equal(fixed.source, 'parent');
    assert.equal(fixed.confidence, 1);
    assert.equal(fixed.embedded, true, 'the corrected text was embedded by a later night');
    assert.equal(await fact('mai', 'thích ăn sầu riêng'), undefined, 'the misheard fact was edited in place');
    const typed = await fact('mai', 'dị ứng tôm');
    assert.equal(typed.source, 'parent');
    assert.equal(typed.embedded, true);
  });

  it('merges a year of repeats into one fact, with evidence for each turn', async () => {
    for (const [kid, statement, category, setup] of [['mai', 'thích vẽ tranh', 'passions', 1], ['minh', 'thích đá bóng', 'passions', 0], ['lily', 'loves ballet', 'passions', 0]] as const) {
      const entries = factEntries(kid, statement, category);
      const f = await fact(kid, statement);
      const copies = await one<{ n: number }>("SELECT count(*)::int AS n FROM fact WHERE child_id = $1 AND statement = $2 AND status = 'active'", [child(kid), statement]);
      assert.equal(copies.n, 1, `${kid}: one "${statement}"`);
      assert.equal(f.mentions, setup + entries.length, `${kid}: "${statement}" mentioned ${entries.length} times`);
      const evidence = await one<{ n: number }>('SELECT count(*)::int AS n FROM fact_evidence WHERE fact_id = $1', [f.id]);
      assert.equal(evidence.n, entries.length, `${kid}: one piece of evidence per turn`);
    }
  });

  it('fades every fact 3% a night once it is two weeks stale, never below 0.2', async () => {
    let checked = 0;
    for (const kid of Object.keys(year.kids)) {
      const nights = (await rows<{ at: Date }>('SELECT started_at AS at FROM nightly_run WHERE child_id = $1', [child(kid)])).map((r) => r.at.getTime());
      const facts = await rows<{ statement: string; weight: number; last_seen_at: Date }>("SELECT statement, weight, last_seen_at FROM fact WHERE child_id = $1 AND status = 'active'", [child(kid)]);
      for (const f of facts) {
        const stale = nights.filter((at) => at - 14 * DAY > f.last_seen_at.getTime()).length;
        const expected = Math.max(0.2, 0.97 ** stale);
        assert.ok(Math.abs(f.weight - expected) < 1e-3, `${kid} "${f.statement}": weight ${f.weight}, expected ${expected.toFixed(4)} after ${stale} stale nights`);
        checked += 1;
      }
    }
    assert.ok(checked > 50);
    assert.equal((await fact('mai', 'sợ bóng tối')).weight, 0.2, 'a fear last mentioned in December rests at the floor');
    assert.equal((await fact('mai', 'sợ sấm')).weight, 1, 'a fear from last week is fresh');
  });

  it('builds the child digest from strong, real, non-sensitive memories', async () => {
    const mai = (await buildDigest(year.db, child('mai')))!;
    assert.equal(mai.ageYears, 6);
    assert.equal(mai.passions[0], 'thích vẽ tranh', 'the passion she mentions most leads');
    assert.ok(mai.likes.includes('thích màu tím') && !mai.likes.includes('thích màu hồng'));
    assert.ok(mai.fears.indexOf('sợ sấm') < mai.fears.indexOf('sợ bóng tối') || !mai.fears.includes('sợ bóng tối'), 'the fresh fear outranks the faded one');
    assert.equal(mai.people[0].name, 'Mướp');

    const minh = (await buildDigest(year.db, child('minh')))!;
    assert.deepEqual(minh.passions.slice(0, 2).sort(), ['thích chơi Minecraft', 'thích đá bóng'].sort(), 'this year\'s passions lead last year\'s dinosaurs');
    for (const d of [mai, minh, (await buildDigest(year.db, child('lily')))!]) {
      const all = [...d.passions, ...d.likes, ...d.dislikes, ...d.fears, ...d.strengths];
      for (const hidden of ['sợ bố mẹ thương em Bin hơn', 'bị gãy tay trái', 'có một con rồng tên là Lửa', 'has a unicorn friend called Mr. Sparkles']) {
        assert.ok(!all.includes(hidden), `${d.name}: "${hidden}" stays out of the digest`);
      }
    }
  });
});

describe('recall after a year', () => {
  const recallFor = async (kid: string, text: string, instanceId?: string) => {
    const instance = instanceId ?? (await one<{ id: string }>("SELECT id FROM character_instance WHERE child_id = $1 AND status = 'active'", [child(kid)])).id;
    return recall({ db: year.db, gateway: year.gateway }, { childId: child(kid), instanceId: instance, text, budgetMs: 5000 });
  };

  it('finds the goldfish eight months on, by name and by meaning', async () => {
    const r = await recallFor('mai', 'Con nhớ cá Vàng quá, cá Vàng mất rồi');
    assert.equal(r.timedOut, false);
    assert.deepEqual(r.people.map((p) => p.display_name), ['Vàng']);
    assert.ok(r.memories.some((m) => m.text.includes('Vàng')), 'a memory of the goldfish comes back');
  });

  it('never recalls a sensitive fact', async () => {
    const r = await recallFor('mai', 'sợ bố mẹ thương em Bin hơn');
    assert.ok(!r.memories.some((m) => m.text === 'sợ bố mẹ thương em Bin hơn'));
  });

  it('keeps each Buddy\'s own words with that Buddy', async () => {
    const bo = (await one<{ id: string }>("SELECT i.id FROM character_instance i JOIN buddy_character c ON c.id = i.character_id WHERE i.child_id = $1 AND c.slug = 'bo'", [child('minh')])).id;
    const asPip = await recallFor('minh', 'anh thích xoài nhất');
    const asBo = await recallFor('minh', 'anh thích xoài nhất', bo);
    assert.ok(!asPip.canon.some((c) => c.text === 'anh thích xoài nhất'), 'Pip never heard Bo say it');
    assert.ok(asBo.canon.some((c) => c.text === 'anh thích xoài nhất'), 'Bo still has it');
  });

  it('returns an episode as readable words, not the stored JSON', async () => {
    const goldfish = story('mai', 'mai.goldfish').episode.points.join(' ');
    const r = await recallFor('mai', goldfish);
    const episode = r.memories.find((m) => m.kind === 'episode');
    assert.ok(episode, 'the goldfish episode is recalled');
    assert.equal(episode.text, goldfish);
  });
});

describe('promises and follow-ups over a year', () => {
  it('kept the promises Buddy could keep, and let lapse the ones it could not', async () => {
    const status = async (kid: string, content: string) => (await one<{ status: string }>("SELECT status FROM relationship_item WHERE child_id = $1 AND kind = 'promise' AND content = $2", [child(kid), content])).status;
    assert.equal(await status('mai', 'hỏi Mai xem tiên răng có đến không'), 'kept');
    assert.equal(await status('minh', 'dạy Minh một từ tiếng Anh mới'), 'kept');
    assert.equal(await status('mai', 'hỏi xem em bé tên là gì'), 'expired', 'Mai was away when it fell due');
    assert.equal(await status('lily', 'ask Lily about the airplane ride'), 'expired', 'the toy stayed home all summer');
  });

  it('asked about each upcoming day it could, and closed the rest', async () => {
    const event = async (kid: string, d: string) => (await one<{ status: string }>("SELECT status FROM child_event WHERE child_id = $1 AND description = $2", [child(kid), d])).status;
    assert.equal(await event('mai', 'sinh nhật Linh'), 'followed_up');
    assert.equal(await event('mai', 'em bé chào đời'), 'done', 'nobody asked while Mai was away, so the night closed it');
    assert.equal(await event('lily', 'trip to Vietnam to see Bà Ngoại'), 'done');
    const party = year.record.followUps.find((f) => f.text === 'sinh nhật Linh')!;
    assert.equal(localDate(party.at, 'Asia/Ho_Chi_Minh'), '2025-11-16', 'the morning after the party');
  });

  it('asks about an upcoming day only after it, for a child in Vietnam', async () => {
    await onCopy(async (copy) => {
      const day = addDays(localDate(HISTORY_END, 'Asia/Ho_Chi_Minh'), 2);
      await sayNow(copy, 'mai', 'Chủ nhật này con đi sở thú', 'Ôi vui quá, tớ muốn nghe kể lắm!', learn({ events: [{ kind: 'upcoming', description: 'đi sở thú', date: day, person: null }] }));
      year.clock.set(localToUtc(`${day} 10:00`, 'Asia/Ho_Chi_Minh'));
      assert.ok(!(await dueItems(copy.db, child('mai'))).some((d) => d.text === 'đi sở thú'), 'not on the morning of the trip');
      year.clock.set(localToUtc(`${addDays(day, 1)} 10:00`, 'Asia/Ho_Chi_Minh'));
      assert.ok((await dueItems(copy.db, child('mai'))).some((d) => d.text === 'đi sở thú'), 'the next morning');
    });
  });

  it('asks about an upcoming day only after it, for a child in California', async () => {
    const party = year.record.followUps.find((f) => f.text === "Sophie's birthday party")!;
    assert.ok(party.at >= localToUtc('2026-10-24 18:00', 'America/Los_Angeles'), `asked at ${party.at.toISOString()}, before the afternoon party`);
    await onCopy(async (copy) => {
      const day = addDays(localDate(HISTORY_END, 'America/Los_Angeles'), 2);
      await sayNow(copy, 'lily', 'We are going to the pumpkin patch on Saturday', 'How lovely! Tell me everything after.', learn({ events: [{ kind: 'upcoming', description: 'pumpkin patch', date: day, person: null }] }));
      year.clock.set(localToUtc(`${day} 10:00`, 'America/Los_Angeles'));
      assert.ok(!(await dueItems(copy.db, child('lily'))).some((d) => d.text === 'pumpkin patch'), 'not on the morning of the trip');
    });
  });
});

describe('learning switched off for the summer', () => {
  const off = () => localToUtc('2026-06-15 21:00', 'Asia/Ho_Chi_Minh');
  const on = () => localToUtc('2026-08-01 09:00', 'Asia/Ho_Chi_Minh');

  it('learned nothing about Minh while consent was withdrawn, though he kept talking', async () => {
    const talked = await one<{ n: number }>('SELECT count(*)::int AS n FROM chat_session WHERE child_id = $1 AND started_at >= $2 AND started_at < $3', [child('minh'), off(), on()]);
    assert.ok(talked.n > 5, `${talked.n} sittings in the window`);
    const facts = await one<{ n: number }>('SELECT count(*)::int AS n FROM fact WHERE child_id = $1 AND first_seen_at >= $2 AND first_seen_at < $3', [child('minh'), off(), on()]);
    const people = await one<{ n: number }>('SELECT count(*)::int AS n FROM person WHERE child_id = $1 AND first_mentioned_at >= $2 AND first_mentioned_at < $3', [child('minh'), off(), on()]);
    assert.equal(facts.n, 0);
    assert.equal(people.n, 0);
    assert.equal(await fact('minh', 'thích cắm trại'), undefined);
    assert.equal(await one("SELECT 1 FROM person WHERE child_id = $1 AND display_name = 'Khoa'", [child('minh')]), undefined, 'the camp friend was never written down');
    const updated = await one<{ n: number }>('SELECT count(*)::int AS n FROM fact WHERE child_id = $1 AND last_seen_at >= $2 AND last_seen_at < $3', [child('minh'), off(), on()]);
    assert.equal(updated.n, 0, 'known facts were not touched either');
  });

  it('writes no episode about a conversation held while learning was off, even once it is back on', async () => {
    const episodes = await one<{ n: number }>('SELECT count(*)::int AS n FROM episode WHERE child_id = $1 AND started_at >= $2 AND started_at < $3', [child('minh'), off(), on()]);
    assert.equal(episodes.n, 0);
  });
});

describe('Buddy\'s own life', () => {
  it('wrote a diary for every day after a night\'s sleep, on whichever Buddy was active', async () => {
    for (const kid of Object.keys(year.kids)) {
      const nights = await one<{ n: number }>("SELECT count(*)::int AS n FROM nightly_run WHERE child_id = $1 AND status = 'done'", [child(kid)]);
      const days = await one<{ n: number }>('SELECT count(DISTINCT d.day)::int AS n FROM diary_entry d JOIN character_instance i ON i.id = d.instance_id WHERE i.child_id = $1', [child(kid)]);
      assert.equal(days.n, nights.n, `${kid}: one diary day per night`);
    }
    const diaries = await rows<{ slug: string; first: string; last: string }>(
      `SELECT c.slug, min(d.day)::text AS first, max(d.day)::text AS last FROM diary_entry d
       JOIN character_instance i ON i.id = d.instance_id JOIN buddy_character c ON c.id = i.character_id
       WHERE i.child_id = $1 GROUP BY c.slug`,
      [child('minh')],
    );
    assert.equal(diaries.find((d) => d.slug === 'bo')!.last, '2026-01-11', 'Bo wrote his last diary the night before he was replaced');
    assert.equal(diaries.find((d) => d.slug === 'pip')!.first, '2026-01-12');
    const canon = await one<{ n: number }>("SELECT count(*)::int AS n FROM buddy_canon c JOIN character_instance i ON i.id = c.instance_id WHERE i.child_id = $1 AND c.source = 'diary'", [child('mai')]);
    assert.ok(canon.n >= 2, 'the diary added to Bo\'s canon');
  });

  it('leaves Buddy\'s mood alone while a parent pins it', async () => {
    const instance = (await one<{ id: string }>("SELECT id FROM character_instance WHERE child_id = $1 AND status = 'active'", [child('mai')])).id;
    const days = (await rows<{ day: string }>("SELECT day::text AS day FROM mood_day WHERE instance_id = $1 AND day BETWEEN '2026-03-09' AND '2026-03-22' ORDER BY day", [instance])).map((r) => r.day);
    assert.ok(days.includes('2026-03-10') && days.includes('2026-03-21'), 'computed before the pin and after it');
    assert.deepEqual(days.filter((d) => d >= '2026-03-11' && d <= '2026-03-19'), [], 'nothing written while pinned');
  });

  it('keeps the old friendship when the character changes, and the child model with the child', async () => {
    const instances = await rows<{ slug: string; status: string; stage: string; met_on: string }>(
      `SELECT c.slug, i.status, i.relationship_stage AS stage, i.met_on::text AS met_on FROM character_instance i
       JOIN buddy_character c ON c.id = i.character_id WHERE i.child_id = $1 ORDER BY i.created_at`,
      [child('minh')],
    );
    assert.deepEqual(instances, [
      { slug: 'bo', status: 'archived', stage: 'best_friends', met_on: '2025-10-04' },
      { slug: 'pip', status: 'active', stage: 'best_friends', met_on: '2026-01-11' },
    ]);
    const res = await year.call('minh', 'GET', '/children/:child/buddy');
    assert.equal(res.json().character_slug, 'pip');
    const bao = await one<{ first: Date }>("SELECT first_mentioned_at AS first FROM person WHERE child_id = $1 AND display_name = 'Bảo'", [child('minh')]);
    assert.ok(bao.first < new Date('2026-01-01'), 'Pip knows the friend Minh told Bo about');
  });
});

describe('safety over a year', () => {
  const expectedEvents = (kid: string) => year.plans[kid].flatMap((s) => s.turns).filter((t) => {
    const g = fakeClassify(t.c);
    return (t.danger ?? g.danger) !== 'none' && (t.severity ?? g.severity) !== 'none';
  });

  it('records every danger signal once, and alerts only on concern and urgent ones', async () => {
    for (const kid of Object.keys(year.kids)) {
      const events = await rows<{ severity: string; excerpt: string | null; notified: boolean; review_status: string }>(
        'SELECT severity, excerpt, parent_notified_at IS NOT NULL AS notified, review_status FROM safety_event WHERE child_id = $1',
        [child(kid)],
      );
      assert.equal(events.length, expectedEvents(kid).length, kid);
      for (const e of events) {
        const alert = e.severity === 'concern' || e.severity === 'urgent';
        assert.equal(e.notified, alert, `${kid} ${e.severity}: parent notified only for alerts`);
        assert.equal(e.excerpt !== null, alert, `${kid} ${e.severity}: words kept only for alerts`);
        assert.equal(e.review_status, e.severity === 'urgent' ? 'queued' : 'none');
      }
      const alerts = (await year.call(kid, 'GET', '/children/:child/alerts')).json().data as { severity: string; acknowledged_at: string | null }[];
      assert.equal(alerts.length, events.filter((e) => e.severity !== 'info').length);
      assert.ok(alerts.every((a) => a.acknowledged_at), `${kid}: the parent acknowledged every alert`);
    }
    const tuan = (await year.call('minh', 'GET', '/children/:child/alerts')).json().data[0];
    assert.equal(tuan.severity, 'urgent');
    assert.match(tuan.excerpt, /Tuấn/);
  });
});

describe('weekly digests', () => {
  it('sends one digest a week, Sunday to Saturday, from the first week to the last', async () => {
    for (const kid of Object.keys(year.kids)) {
      const h = history(kid);
      const tz = h.child.timeZone;
      const expected: string[] = [];
      for (let d = addDays(h.start.slice(0, 10), 1); localToUtc(`${d} 03:00`, tz) < HISTORY_END; d = addDays(d, 1)) {
        if (weekday(d) === 0) expected.push(addDays(d, -7));
      }
      const weeks = (await rows<{ week: string }>('SELECT week_start::text AS week FROM digest WHERE child_id = $1 ORDER BY week_start', [child(kid)])).map((r) => r.week);
      assert.deepEqual(weeks, expected, kid);
      const sent = await one<{ n: number }>("SELECT count(*)::int AS n FROM notification WHERE child_id = $1 AND kind = 'digest'", [child(kid)]);
      assert.equal(sent.n, weeks.length, `${kid}: the parent was told about each`);
    }
  });

  it('reports the week\'s new interests and talk time', async () => {
    const week = await one<{ content: { new_interests: string[]; turns: number } }>("SELECT content FROM digest WHERE child_id = $1 AND week_start = '2026-07-05'", [child('mai')]);
    assert.ok(week.content.new_interests.includes('thích các hành tinh'), 'the planetarium week');
    const usage = await one<{ n: number }>("SELECT coalesce(sum(turns), 0)::int AS n FROM usage_daily WHERE child_id = $1 AND day >= '2026-07-05' AND day < '2026-07-12'", [child('mai')]);
    assert.equal(week.content.turns, usage.n);
  });

  it('pages through a year of digests', async () => {
    const first = (await year.call('mai', 'GET', '/children/:child/digests')).json();
    assert.equal(first.data.length, 50);
    assert.ok(first.next_cursor);
    const second = (await year.call('mai', 'GET', `/children/:child/digests?cursor=${first.next_cursor}`)).json();
    const total = await one<{ n: number }>('SELECT count(*)::int AS n FROM digest WHERE child_id = $1', [child('mai')]);
    assert.equal(first.data.length + second.data.length, total.n);
    assert.equal(second.next_cursor, null);
    assert.ok(first.data[0].week_start > second.data[0].week_start, 'newest first');
  });
});

describe('the Parent API on a year of data', () => {
  it('pages people and facts without losing or repeating any', async () => {
    for (const kid of Object.keys(year.kids)) {
      for (const [url, table, where] of [['/children/:child/people', 'person', "status = 'active'"], ['/children/:child/facts', 'fact', "status = 'active'"]]) {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const res: { data: { id: string }[]; next_cursor: string | null } = (await year.call(kid, 'GET', `${url}?limit=4${cursor ? `&cursor=${cursor}` : ''}`)).json();
          seen.push(...res.data.map((r) => r.id));
          cursor = res.next_cursor;
        } while (cursor);
        const total = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1 AND ${where}`, [child(kid)]);
        assert.equal(new Set(seen).size, seen.length, `${kid} ${table}: no repeats`);
        assert.equal(seen.length, total.n, `${kid} ${table}: none missing`);
      }
    }
  });

  it('summarises what Buddy knows with the same counts as the database', async () => {
    const res = (await year.call('mai', 'GET', '/children/:child/memory/summary')).json();
    const db = await one<{ people: number; facts: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM person WHERE child_id = $1) AS people,
              (SELECT count(*)::int FROM fact WHERE child_id = $1 AND status = 'active') AS facts,
              (SELECT count(*)::int FROM child_event WHERE child_id = $1 AND status = 'open') AS events`,
      [child('mai')],
    );
    assert.deepEqual(res.counts, db);
    assert.equal(res.learning_enabled, true);
    const minh = (await year.call('minh', 'GET', '/children/:child/memory/summary')).json();
    assert.equal(minh.learning_enabled, true, 'consent came back in August');
  });

  it('keeps every family to its own child', async () => {
    for (const url of ['/children/:child', '/children/:child/facts', '/children/:child/people', '/children/:child/alerts', '/children/:child/digests', '/children/:child/memory/summary']) {
      const theirs = url.replace(':child', child('mai'));
      const res = await year.call('lily', 'GET', theirs);
      assert.equal(res.statusCode, 404, `Lily's parent cannot read ${url}`);
    }
    const me = (await year.call('lily', 'GET', '/me')).json();
    assert.deepEqual(me.children.map((c: { name: string }) => c.name), ['An Nhiên']);
  });

  it('shows the last 30 days of usage', async () => {
    const res = (await year.call('lily', 'GET', '/children/:child/usage')).json();
    assert.ok(res.data.length > 5 && res.data.length <= 31);
    assert.ok(res.data.every((d: { day: string }) => d.day >= addDays(HISTORY_END.toISOString().slice(0, 10), -30)));
  });
});

describe('changing the year', () => {
  it('forgets everything Mai taught Buddy, and keeps her alerts, digests, usage and toy', async () => {
    await onCopy(async (copy) => {
      const count = async (table: string, kid = 'mai') => (await copy.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1`, [child(kid)])).rows[0].n;
      const kept = { digest: await count('digest'), safety_event: await count('safety_event'), usage_daily: await count('usage_daily') };
      const others = { minh: await count('fact', 'minh'), lily: await count('fact', 'lily') };
      assert.equal((await copy.api.call('mai', 'DELETE', '/children/:child/memory')).statusCode, 204);
      for (const table of ['fact', 'person', 'episode', 'turn', 'chat_session', 'child_event', 'relationship_item']) assert.equal(await count(table), 0, table);
      const instance = (await copy.db.query<{ stage: string; canon: number; diary: number }>(
        `SELECT i.relationship_stage AS stage, (SELECT count(*)::int FROM buddy_canon WHERE instance_id = i.id) AS canon,
                (SELECT count(*)::int FROM diary_entry WHERE instance_id = i.id) AS diary
         FROM character_instance i WHERE i.child_id = $1 AND i.status = 'active'`,
        [child('mai')],
      )).rows[0];
      assert.deepEqual(instance, { stage: 'meeting', canon: 0, diary: 0 });
      assert.deepEqual({ digest: await count('digest'), safety_event: await count('safety_event'), usage_daily: await count('usage_daily') }, kept);
      assert.deepEqual({ minh: await count('fact', 'minh'), lily: await count('fact', 'lily') }, others, 'other children are untouched');
      const toy = await copy.db.query("SELECT 1 FROM device WHERE child_id = $1 AND status = 'active'", [child('mai')]);
      assert.equal(toy.rowCount, 1);
    });
  });

  it('deletes a family and a year of its data, and frees the toy', async () => {
    await onCopy(async (copy) => {
      const before = (await copy.db.query<{ n: number }>("SELECT count(*)::int AS n FROM fact WHERE child_id <> $1", [child('lily')])).rows[0].n;
      assert.equal((await copy.api.call('lily', 'DELETE', '/family')).statusCode, 204);
      for (const table of ['fact', 'person', 'episode', 'chat_session', 'safety_event', 'digest', 'usage_daily', 'nightly_run']) {
        const left = await copy.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE child_id = $1`, [child('lily')]);
        assert.equal(left.rows[0].n, 0, table);
      }
      const toy = await copy.db.query<{ status: string; family_id: string | null }>('SELECT status, family_id FROM device WHERE id = $1', [year.kids.lily.deviceId]);
      assert.deepEqual(toy.rows[0], { status: 'provisioned', family_id: null });
      const after = (await copy.db.query<{ n: number }>('SELECT count(*)::int AS n FROM fact')).rows[0].n;
      assert.equal(after, before, 'the other families keep every fact');
    });
  });

  it('learns on top of a year: a misheard name, a faded fear, a repeat', async () => {
    await onCopy(async (copy) => {
      const muop = async () => (await copy.db.query<{ mentions: number }>("SELECT mentions FROM person WHERE child_id = $1 AND display_name = 'Mướp'", [child('mai')])).rows[0].mentions;
      const dark = async () => (await copy.db.query<{ weight: number; mentions: number }>("SELECT weight, mentions FROM fact WHERE child_id = $1 AND statement = 'sợ bóng tối'", [child('mai')])).rows[0];
      const before = { muop: await muop(), dark: await dark() };
      const misheard = { name: 'Mứp', kind: 'pet' as const, relation: 'mèo', details: null, feeling: 0.8, means: 'Mướp' };
      await sayNow(copy, 'mai', 'Tối qua mất điện, con sợ bóng tối, Mứp cũng chui vào chăn', 'Ôi, tớ ở đây với cậu nè. Mướp cũng sợ hả?', learn({
        people: [misheard],
        facts: [{ category: 'fears', statement: 'sợ bóng tối', about: null, confidence: 0.9, reality: 'real', sensitivity: 'normal', corrects: null }],
      }));
      assert.equal(await muop(), before.muop + 1, 'the misheard name still lands on Mướp');
      const after = await dark();
      assert.equal(after.mentions, before.dark.mentions + 1);
      assert.equal(after.weight, 1, 'a fear mentioned again is fresh again');
      const cards = await copy.db.query("SELECT 1 FROM person WHERE child_id = $1 AND name_key = 'mup'", [child('mai')]);
      assert.equal(cards.rowCount, 0);
    });
  });
});

describe('the night after the year', () => {
  it('schedules each child\'s sleep for their own small hours', async () => {
    await onCopy(async (copy) => {
      const queued = async () => (await copy.db.query<{ child_id: string; day: string }>("SELECT payload->>'child_id' AS child_id, payload->>'day' AS day FROM job WHERE queue = 'nightly-sleep' AND status = 'ready'")).rows;
      const vietnam = localToUtc(`${addDays(localDate(HISTORY_END, 'Asia/Ho_Chi_Minh'), 1)} 03:00`, 'Asia/Ho_Chi_Minh');
      year.clock.set(vietnam);
      await scheduleTick(copy.deps, new Date());
      const vn = await queued();
      assert.deepEqual(vn.map((j) => j.child_id).sort(), [child('mai'), child('minh')].sort());
      assert.ok(vn.every((j) => j.day === localDate(HISTORY_END, 'Asia/Ho_Chi_Minh')), 'sleep closes the day that just ended');
      await createWorker(copy.deps).drain(1000);

      const california = localToUtc(`${addDays(localDate(HISTORY_END, 'America/Los_Angeles'), 1)} 03:00`, 'America/Los_Angeles');
      year.clock.set(california);
      await scheduleTick(copy.deps, new Date());
      assert.deepEqual((await queued()).map((j) => j.child_id), [child('lily')]);
      await createWorker(copy.deps).drain(1000);
      const unsummarised = await copy.db.query('SELECT 1 FROM chat_session s WHERE s.child_id = $1 AND NOT EXISTS (SELECT 1 FROM episode e WHERE e.session_id = s.id)', [child('lily')]);
      assert.equal(unsummarised.rowCount, 0, 'Lily\'s last afternoon is now an episode too');
    });
  });

  it('runs maintenance once per UTC day however often the scheduler ticks', async () => {
    await onCopy(async (copy) => {
      year.clock.set(new Date(HISTORY_END.getTime() + 3_600_000));
      await scheduleTick(copy.deps, new Date());
      await createWorker(copy.deps).drain(1000);
      year.clock.advance(5 * 60_000);
      await scheduleTick(copy.deps, new Date());
      const again = await copy.db.query("SELECT 1 FROM job WHERE queue = 'maintenance' AND status = 'ready'");
      assert.equal(again.rowCount, 0);
    });
  });
});
