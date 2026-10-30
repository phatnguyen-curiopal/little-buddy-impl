import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { Db } from '../../src/db/index.ts';
import { createFakeGateway } from '../../src/gateway/fake.ts';
import type { LearnResult } from '../../src/gateway/schemas.ts';
import type { StructuredRequest } from '../../src/gateway/types.ts';
import { silentLogger } from '../../src/log.ts';
import { learnFromTurn } from '../../src/memory/learner.ts';
import { nameKey } from '../../src/memory/names.ts';
import { recall } from '../../src/memory/recall.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

async function addTurn(db: Db, fam: Family, childText: string): Promise<string> {
  await db.query('SELECT ensure_turn_partition($1::date)', [new Date().toISOString().slice(0, 10)]);
  const sid = (await db.query<{ id: string }>(
    'INSERT INTO chat_session (child_id, instance_id) VALUES ($1, $2) RETURNING id',
    [fam.childId, fam.instanceId],
  )).rows[0].id;
  return (await db.query<{ id: string }>(
    "INSERT INTO turn (session_id, child_id, child_text, reply_text, face, turn_type, language) VALUES ($1, $2, $3, 'Wowee!', 'happy', 'answer', 'vi') RETURNING id",
    [sid, fam.childId, childText],
  )).rows[0].id;
}

async function addCard(db: Db, fam: Family, name: string, kind: string, relation: string | null = null): Promise<string> {
  return (await db.query<{ id: string }>(
    'INSERT INTO person (child_id, display_name, name_key, kind, relation) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [fam.childId, name, nameKey(name), kind, relation],
  )).rows[0].id;
}

// A learner that answers like the live model: people link to the roster by
// ref, read from the prompt's "p1: Name (" lines.
function scriptedLearner(answer: (refOf: (name: string) => string | null) => Partial<LearnResult>) {
  const g = createFakeGateway();
  const prompts: string[] = [];
  g.structured = (async (req: StructuredRequest) => {
    prompts.push(req.user);
    const refOf = (name: string) => new RegExp(`^(p\\d+): ${name} \\(`, 'm').exec(req.user)?.[1] ?? null;
    return { people: [], facts: [], events: [], promises: [], relationship: [], canon: [], ...answer(refOf) };
  }) as typeof g.structured;
  return { gateway: g, prompts };
}

const person = (name: string, kind: LearnResult['people'][number]['kind'], extra: Partial<LearnResult['people'][number]> = {}) => ({
  name, kind, relation: null, details: null, feeling: 0.5, ...extra,
});

describe('names in memory', () => {
  let db: Db;
  before(async () => {
    db = await createTestDb();
  });
  after(() => db.close());

  // Sorted here by name and kind: cards written in one test share a timestamp.
  const cards = async (fam: Family) =>
    (await db.query<{ display_name: string; kind: string; mentions: number; cues: string[]; also_word: string | null }>(
      'SELECT display_name, kind, mentions, cues, also_word FROM person WHERE child_id = $1',
      [fam.childId],
    )).rows.sort((x, y) => (`${x.display_name} ${x.kind}` < `${y.display_name} ${y.kind}` ? -1 : 1));

  it('links by ref, never across kinds, and remembers how the child says a name', async () => {
    const fam = await createFamily(db, config);
    await addCard(db, fam, 'Sam', 'friend');
    await addCard(db, fam, 'Mướp', 'pet', 'cat');
    const { gateway, prompts } = scriptedLearner((refOf) => ({
      people: [
        // A misheard name the model links to the cat.
        person('Mứp', 'pet', { relation: 'cat', ref: refOf('Mướp'), called: 'con mèo Mứp' }),
        // A dog called Sam is not the friend Sam, even with the friend's ref.
        person('Sam', 'pet', { relation: 'dog', ref: refOf('Sam'), called: 'con chó Sam', also_word: 'horseshoe crab' }),
      ],
      facts: [{ category: 'likes', statement: 'thích chơi với Sam', about: refOf('Sam'), confidence: 0.8, reality: 'real', sensitivity: 'normal', corrects: null }],
    }));
    await learnFromTurn({ db, gateway, log: silentLogger }, await addTurn(db, fam, 'Con mèo Mứp với con chó Sam chơi với nhau'));

    assert.match(prompts[0], /^p\d: Sam \(friend; also the word "sam": horseshoe crab\)$/m);
    assert.match(prompts[0], /^p\d: Mướp \(pet, cat; also the word "mướp": loofah\)$/m);
    assert.deepEqual(await cards(fam), [
      { display_name: 'Mướp', kind: 'pet', mentions: 2, cues: [], also_word: null },
      { display_name: 'Sam', kind: 'friend', mentions: 1, cues: [], also_word: null },
      { display_name: 'Sam', kind: 'pet', mentions: 1, cues: ['con chó sam'], also_word: 'horseshoe crab' },
    ]);
    const fact = await db.query<{ kind: string }>(
      "SELECT p.kind FROM fact f JOIN person p ON p.id = f.person_id WHERE f.child_id = $1 AND f.statement = 'thích chơi với Sam'",
      [fam.childId],
    );
    assert.deepEqual(fact.rows, [{ kind: 'friend' }], 'the fact goes to the card its ref names');
  });

  it('keeps grandma apart from Bảo and never stores a school name', async () => {
    const fam = await createFamily(db, config);
    await addCard(db, fam, 'Bảo', 'classmate');
    const { gateway } = scriptedLearner(() => ({
      people: [
        person('Bà', 'family', { relation: 'grandmother', called: 'bà' }),
        person('Hoa Sen', 'place', { relation: 'school' }),
        person('Đà Lạt', 'place', { relation: 'holiday place', called: 'đi Đà Lạt' }),
      ],
    }));
    await learnFromTurn({ db, gateway, log: silentLogger }, await addTurn(db, fam, 'Bà đưa con từ trường Hoa Sen về, mai cả nhà đi Đà Lạt'));
    assert.deepEqual((await cards(fam)).map((c) => [c.display_name, c.kind, c.cues]), [
      ['Bà', 'family', []],
      ['Bảo', 'classmate', []],
      ['Đà Lạt', 'place', ['đi đà lạt']],
    ]);
  });

  it('accepts toys and places as kinds of card', async () => {
    const fam = await createFamily(db, config);
    await addCard(db, fam, 'Bông', 'toy', 'teddy bear');
    await addCard(db, fam, 'Huế', 'place', 'hometown');
    assert.deepEqual((await cards(fam)).map((c) => c.kind), ['toy', 'place']);
  });

  it('recalls a friend when meant, not when the name is just fruit', async () => {
    const fam = await createFamily(db, config);
    const mit = await addCard(db, fam, 'Mít', 'friend', 'best friend');
    const gateway = createFakeGateway();
    const ask = (text: string) => recall({ db, gateway }, { childId: fam.childId, instanceId: fam.instanceId, text, budgetMs: 5000 });
    assert.deepEqual((await ask('Con thích ăn mít lắm')).people, []);
    assert.deepEqual((await ask('Hôm nay con chơi với bạn Mít')).people.map((p) => p.id), [mit]);
  });
});
