// Holding a credit while a turn runs: what stops two toys of one family from
// both starting a turn on the last credit, and gives the credit back when a
// turn ends with nothing to charge.

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { balance, chargeTurn, releaseCredit, reserveCredit } from '../../src/billing/credits.ts';
import type { Db } from '../../src/db/index.ts';
import { createTestDb, testConfig } from '../helpers/db.ts';
import { createFamily, type Family } from '../helpers/fixtures.ts';

const config = testConfig();

describe('credit holds', () => {
  let db: Db;
  let fam: Family;
  const holds = async () => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM credit_hold WHERE family_id = $1', [fam.familyId])).rows[0].n;

  before(async () => {
    db = await createTestDb();
    fam = await createFamily(db, config, { credits: 1 });
  });
  after(() => db.close());

  it('holds the last credit for one turn only', async () => {
    assert.equal(await reserveCredit(db, fam.familyId, 'a1a1a1a1-0000-4000-8000-000000000001'), true);
    assert.equal(await reserveCredit(db, fam.familyId, 'a1a1a1a1-0000-4000-8000-000000000002'), false, 'a second toy cannot start on the same credit');
    assert.equal(await holds(), 1);
  });

  it('gives the credit back when that turn ends without an answer', async () => {
    await releaseCredit(db, 'a1a1a1a1-0000-4000-8000-000000000001');
    assert.equal(await holds(), 0);
    assert.equal(await reserveCredit(db, fam.familyId, 'a1a1a1a1-0000-4000-8000-000000000003'), true);
  });

  it('turns the hold into the charge, once', async () => {
    await db.tx((q) => chargeTurn(q, { familyId: fam.familyId, childId: fam.childId, turnId: 'b2b2b2b2-0000-4000-8000-000000000001', hold: 'a1a1a1a1-0000-4000-8000-000000000003' }));
    // A retried write charges nothing more.
    await db.tx((q) => chargeTurn(q, { familyId: fam.familyId, childId: fam.childId, turnId: 'b2b2b2b2-0000-4000-8000-000000000001', hold: 'a1a1a1a1-0000-4000-8000-000000000003' }));
    assert.equal(await balance(db, fam.familyId), 0);
    assert.equal(await holds(), 0);
    assert.equal(await reserveCredit(db, fam.familyId, 'a1a1a1a1-0000-4000-8000-000000000004'), false, 'nothing left to hold');
  });

  it('lets a hold nobody released lapse on its own', async () => {
    const other = await createFamily(db, config, { credits: 1 });
    await db.query("INSERT INTO credit_hold (id, family_id, expires_at) VALUES ('c3c3c3c3-0000-4000-8000-000000000001', $1, now() - interval '1 second')", [other.familyId]);
    assert.equal(await reserveCredit(db, other.familyId, 'c3c3c3c3-0000-4000-8000-000000000002'), true, 'the stale hold no longer counts');
    const left = await db.query<{ id: string }>('SELECT id FROM credit_hold WHERE family_id = $1', [other.familyId]);
    assert.deepEqual(left.rows.map((r) => r.id), ['c3c3c3c3-0000-4000-8000-000000000002'], 'and is cleared away');
  });

  it('keeps each family to its own credits', async () => {
    const rich = await createFamily(db, config, { credits: 5 });
    assert.equal(await reserveCredit(db, rich.familyId, 'd4d4d4d4-0000-4000-8000-000000000001'), true);
    assert.equal(await reserveCredit(db, fam.familyId, 'd4d4d4d4-0000-4000-8000-000000000002'), false, "another family's credits are not this one's");
  });
});
