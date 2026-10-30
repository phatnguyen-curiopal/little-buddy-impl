import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runScenario, zoneForHour } from '../../eval/harness.ts';
import { SCENARIOS } from '../../eval/scenarios.ts';
import { QUALITIES, type RunView } from '../../eval/types.ts';
import { localTime } from '../../src/character/mood.ts';
import { silentLogger } from '../../src/log.ts';
import { testConfig } from '../helpers/db.ts';

const EMPTY_STATE: RunView['state'] = { facts: [], people: [], events: [], relationship: [], canon: [], safety: [], notifications: [], nudges: [], episodes: [] };

describe('quality eval scenarios', () => {
  it('has 50 scenarios with unique ids, covering every quality', () => {
    assert.equal(SCENARIOS.length, 50);
    assert.equal(new Set(SCENARIOS.map((s) => s.id)).size, 50);
    for (const q of QUALITIES) assert.ok(SCENARIOS.filter((s) => s.quality === q).length >= 4, `at least 4 scenarios test ${q} first`);
    for (const s of SCENARIOS) {
      assert.ok(s.expect.length > 0, `${s.id} has criteria`);
      assert.ok(s.sessions.every((x) => x.turns.length > 0), `${s.id} has turns in every session`);
      assert.ok(!/—/.test(JSON.stringify(s)), `${s.id} has no em dash`);
    }
  });

  it('checks only turns a scenario has', () => {
    for (const s of SCENARIOS) {
      const turns = s.sessions.flatMap((x, si) => x.turns.map((child, ti) => ({
        ref: `${si + 1}.${ti + 1}`, session: si + 1, child, result: 'answered', reply: '', raw: '', spoken: [], face: null, turnType: null,
        classification: null, firstAudioMs: null, brief: null,
      })));
      for (const c of s.checks ?? []) assert.ok(!c.run({ turns, state: EMPTY_STATE }).detail.startsWith('no turn'), `${s.id}: ${c.label}`);
    }
  });

  it('puts the child at any hour a scenario asks for', () => {
    for (let h = 0; h < 24; h += 1) assert.equal(localTime(zoneForHour(h)).hour, h);
  });

  it('runs a scenario through the voice service, the learner, the nightly sleep and days passing', async () => {
    const scenario = SCENARIOS.find((s) => s.id === 'MEM-01')!;
    const run = await runScenario(scenario, { config: testConfig(), log: silentLogger });
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.turns.map((t) => [t.ref, t.result]), [['1.1', 'answered'], ['1.2', 'answered'], ['2.1', 'answered'], ['2.2', 'answered']]);
    assert.ok(run.turns.every((t) => t.raw.startsWith('[face:') && t.spoken.length > 0 && t.brief !== null), 'raw reply, speech and brief are captured');
    assert.ok(run.state.people.some((p) => p.name === 'Mochi' && p.kind === 'pet'), 'the learner wrote the person card');
    assert.equal(run.state.episodes.length, 1, 'the nightly sleep closed the first session into an episode');
    assert.deepEqual(run.between, ['after session 1: Buddy slept (episodes, diary and mood for tomorrow)', 'after session 1: 1 day(s) passed']);
    const checks = Object.fromEntries(run.checks.map((c) => [c.label, c.pass]));
    assert.equal(checks['every turn was answered'], true);
    assert.equal(checks['has a person card matching /mochi/i (pet)'], true);
  });
});
