import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileBrief } from '../../src/character/compiler.ts';
import { clarifyPlan, decide } from '../../src/character/director.ts';
import { SEED_CAST } from '../../src/character/packs.ts';
import type { Classification } from '../../src/domain/types.ts';
import { classifyUser } from '../../src/gateway/live.ts';
import { inUse, speechHabits, speechTerms, type LexiconRow } from '../../src/memory/speech.ts';

const row = (kind: LexiconRow['kind'], heard: string, meant: string, source: LexiconRow['source'], seen: number): LexiconRow => ({ id: heard, kind, heard, meant, source, seen });
const plain: Classification = { intent: 'share', feeling: 'neutral', danger: 'none', severity: 'none', clarity: 'clear' };
const base = { firstTurnOfSession: false, dueCount: 0, energy: 'normal' as const, minutesLeft: null, questionStreak: 0, ageYears: 5 };

describe('a child\'s speech habits', () => {
  it('count a learned mishearing from its second time, a parent\'s and a term at once', () => {
    assert.equal(inUse(row('misheard', 'đau lăn', 'đau răng', 'learned', 1)), false);
    assert.equal(inUse(row('misheard', 'đau lăn', 'đau răng', 'learned', 2)), true);
    assert.equal(inUse(row('misheard', 'cái chăn', 'cái trăng', 'parent', 1)), true);
    assert.equal(inUse(row('term', 'Pikachu', 'Pikachu', 'learned', 1)), true);
    const rows = [row('misheard', 'đau lăn', 'đau răng', 'learned', 3), row('term', 'Pikachu', 'Pikachu', 'learned', 1), row('misheard', 'x', 'y', 'learned', 1)];
    assert.deepEqual(speechHabits(rows), [['đau lăn', 'đau răng']]);
    assert.deepEqual(speechTerms(rows), ['Pikachu']);
  });
});

describe('repairing like a friend', () => {
  it('asks again when nothing could be made out, but never twice in a row', () => {
    const unclear = { ...plain, clarity: 'unclear' as const };
    const ask = decide({ ...base, classification: unclear });
    assert.deepEqual([ask.type, ask.allowQuestion, ask.sentenceLimit, ask.confirm], ['clarify', true, 2, false]);
    const again = decide({ ...base, classification: unclear, clarifiedLastTurn: true });
    assert.deepEqual([again.type, again.confirm], ['answer', true], 'a second miss gets a best guess, checked');
    assert.deepEqual([clarifyPlan().type, clarifyPlan().callback], ['clarify', false]);
  });

  it('checks a guess that matters, and puts danger and feelings first', () => {
    assert.equal(decide({ ...base, classification: { ...plain, clarity: 'unsure' } }).confirm, true);
    assert.equal(decide({ ...base, classification: plain }).confirm, false);
    const hurt = decide({ ...base, classification: { ...plain, clarity: 'unclear', danger: 'hurt', severity: 'urgent' } });
    assert.deepEqual([hurt.type, hurt.escalate], ['comfort', true]);
    assert.equal(decide({ ...base, classification: { ...plain, clarity: 'unclear', feeling: 'sad' } }).type, 'comfort');
  });
});

describe('what Buddy and the classifier are told', () => {
  it('gives the classifier what Buddy just said and the child\'s habits', () => {
    const user = classifyUser('con thấy cái chăn', 'vi', [], 'Tối qua cậu nhìn thấy gì trên trời?', [['cái chăn', 'cái trăng']]);
    assert.deepEqual(user.split('\n'), [
      'Language: vi',
      'The toy said just before: Tối qua cậu nhìn thấy gì trên trời?',
      'This child\'s speech habits (heard, then meant): "cái chăn" for "cái trăng"',
      'The child said: con thấy cái chăn',
    ]);
  });

  it('tells Buddy how to listen, what the child most likely said, and to check the guess', () => {
    const cast = SEED_CAST[0];
    const pack = { slug: cast.slug, name: cast.name, version: 1, bible: cast.bible, lifeRules: cast.life_rules, voices: cast.voices } as unknown as Parameters<typeof compileBrief>[0]['pack'];
    const instance = { id: 'i', role: 'friend', language_mode: 'vi', relationship_stage: 'buddies', energy: 60, playfulness: 60, curiosity: 60, warmth: 70, structure: 40 } as unknown as Parameters<typeof compileBrief>[0]['instance'];
    const brief = (classification: Classification, extra: Partial<Parameters<typeof compileBrief>[0]>) =>
      compileBrief({
        pack, instance, classification, plan: decide({ ...base, classification }), transcript: 'Bo ơi con bị đau lăn quá', audioTags: false, history: [], nudges: [],
        digest: { name: 'Na', nickname: null, ageYears: 5, passions: [], likes: [], dislikes: [], fears: [], strengths: [], people: [], topicsToAvoid: [] },
        today: { date: '2026-10-30', weekday: 'Friday', mood: 60, energy: 'normal', diary: [] },
        recall: { memories: [], canon: [], people: [], due: [] },
        ...extra,
      }).map((m) => m.content).join('\n');
    const unsure = brief({ ...plain, clarity: 'unsure' }, { meant: 'Bo ơi con bị đau răng quá', habits: [['cái chăn', 'cái trăng']] });
    for (const part of ['HOW YOU LISTEN', 'never correct how they speak', 'HOW THEY SPEAK', '"cái chăn" for "cái trăng"', 'WHAT THEY MOST LIKELY SAID: "Bo ơi con bị đau răng quá"', 'check your best guess']) {
      assert.ok(unsure.includes(part), `brief has ${part}`);
    }
    const clear = brief(plain, {});
    assert.ok(!clear.includes('WHAT THEY MOST LIKELY SAID') && !clear.includes('check your best guess') && !clear.includes('HOW THEY SPEAK'));
    assert.ok(brief({ ...plain, clarity: 'unclear' }, {}).includes('You could not make out what they said'));
  });
});
