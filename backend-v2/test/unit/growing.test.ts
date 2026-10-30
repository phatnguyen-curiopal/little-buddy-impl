import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileBrief } from '../../src/character/compiler.ts';
import { decide, greetPlan } from '../../src/character/director.ts';
import { SEED_CAST } from '../../src/character/packs.ts';
import { GAMES, pickGame, wantsToPlay, type GameContext } from '../../src/character/play.ts';
import type { Classification } from '../../src/domain/types.ts';
import { isUsable, startlesWelcome, traitGuidance, type TraitRow } from '../../src/memory/traits.ts';
import { foldBaseline, judgeTone, ToneMeter, type ToneReading, type VoiceBaseline } from '../../src/voice/tone.ts';

const happy: Classification = { intent: 'share', feeling: 'happy', danger: 'none', severity: 'none' };
const ctx = (extra: Partial<GameContext> = {}): GameContext => ({
  ageYears: 6, energy: 'normal', feeling: 'happy', surpriseAllowed: true, bilingual: false, playfulness: 70, played: [], worked: {}, seed: 's', ...extra,
});
const game = (id: string) => GAMES.find((g) => g.id === id)!;

describe('games', () => {
  it('keeps startle games for a cheerful child who may have them, never when drowsy', () => {
    const allowed = (extra: Partial<GameContext>) => {
      const c = ctx({ worked: { hu: 1, ua: 1 }, ...extra });
      return pickGame(c)?.surprise ?? false;
    };
    assert.equal(allowed({}), true, 'a happy, playful child gets the startle game that worked before');
    assert.equal(allowed({ surpriseAllowed: false }), false);
    assert.equal(allowed({ feeling: 'neutral' }), false);
    assert.equal(allowed({ playfulness: 30 }), false);
    assert.equal(allowed({ energy: 'drowsy' }), false);
    assert.equal(pickGame(ctx({ energy: 'drowsy' }))?.lively, false, 'only calm games near bedtime');
  });

  it('offers language games only in bilingual play, and nothing played twice', () => {
    assert.ok(GAMES.filter((g) => g.bilingual).every((g) => pickGame(ctx({ played: GAMES.filter((x) => x.id !== g.id).map((x) => x.id) })) === null));
    assert.equal(pickGame(ctx({ bilingual: true, played: GAMES.filter((g) => !g.bilingual).map((g) => g.id) }))?.bilingual, true);
    assert.equal(pickGame(ctx({ played: GAMES.map((g) => g.id) })), null);
    assert.equal(pickGame(ctx({ ageYears: 4, worked: { tongue_twister: 1 } }))?.id === 'tongue_twister', false, 'too young for tongue twisters');
  });

  it('starts a game unasked now and then, never twice within four turns', () => {
    assert.equal(wantsToPlay(100, 2, 'x'), false);
    const rolls = Array.from({ length: 400 }, (_, i) => wantsToPlay(100, 5, `seed-${i}`)).filter(Boolean).length;
    assert.ok(rolls > 60 && rolls < 140, `about one in four at full playfulness (${rolls} of 400)`);
    assert.equal(Array.from({ length: 200 }, (_, i) => wantsToPlay(0, 9, `s${i}`)).some(Boolean), false);
  });

  it('offers a startle first, plays it after the yes, and drops it for an upset child', () => {
    const base = { firstTurnOfSession: false, dueCount: 0, energy: 'normal' as const, minutesLeft: null, questionStreak: 0, ageYears: 6 };
    const offer = decide({ ...base, classification: { ...happy, intent: 'play' }, candidateGame: game('hu') });
    assert.deepEqual([offer.type, offer.game?.id, offer.gameStep, offer.gameContinues], ['play', 'hu', 'offer', false]);
    const yes = decide({ ...base, classification: { ...happy, intent: 'other' }, activeGame: game('hu') });
    assert.deepEqual([yes.type, yes.gameStep, yes.gameContinues], ['play', 'play', true]);
    const upset = decide({ ...base, classification: { ...happy, feeling: 'scared' }, activeGame: game('hu') });
    assert.deepEqual([upset.type, upset.game], ['comfort', null]);
    const unasked = decide({ ...base, classification: happy, candidateGame: game('riddle'), wantsToPlay: true });
    assert.deepEqual([unasked.type, unasked.gameStep], ['play', 'play'], 'a calm game starts at once');
    assert.equal(decide({ ...base, classification: happy, candidateGame: game('riddle') }).type, 'answer');
    assert.deepEqual([greetPlan().type, greetPlan().allowQuestion], ['greet', false]);
  });
});

describe('traits', () => {
  const day = 86_400_000;
  const trait = (name: string, value: number, observations: number, days: number): TraitRow => ({
    name, value, observations, confidence: 0.5, first_observed_at: new Date(Date.now() - days * day), last_observed_at: new Date(),
  });

  it('need three nights across two weeks pointing the same way', () => {
    assert.equal(isUsable(trait('outgoing', -0.7, 3, 14)), true);
    assert.equal(isUsable(trait('outgoing', -0.7, 2, 20)), false, 'two nights are not enough');
    assert.equal(isUsable(trait('outgoing', -0.7, 5, 6)), false, 'one week is not enough');
    assert.equal(isUsable(trait('outgoing', 0.1, 6, 30)), false, 'mixed evidence is no trait');
  });

  it('become guidance, never a label, and keep startles from a cautious child', () => {
    assert.deepEqual(traitGuidance([trait('outgoing', -0.7, 3, 14), trait('persistent', 0.6, 1, 0)]), [
      'They warm up slowly: give them time, ask easy questions and never push.',
    ]);
    assert.equal(startlesWelcome([trait('cautious', 0.6, 4, 20)]), false);
    assert.equal(startlesWelcome([trait('cautious', 0.6, 2, 20)]), true, 'not yet a trait');
    assert.equal(startlesWelcome([trait('cautious', -0.5, 4, 20)]), true, 'a bold child');
  });
});

describe('tone of voice', () => {
  const tone = (hz: number, amplitude: number, seconds: number) => {
    const n = Math.round(16_000 * seconds);
    const buf = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / 16_000) * amplitude * 32767), i * 2);
    return buf;
  };

  it('measures loudness and pitch, and ignores silence', () => {
    const m = new ToneMeter();
    for (let i = 0; i < 50; i += 1) m.push(tone(300, 0.3, 0.02));
    const r = m.read(4)!;
    assert.ok(Math.abs(r.pitch! - 300) < 10, `pitch ${r.pitch}`);
    assert.ok(Math.abs(r.loudness - 20 * Math.log10(0.3 / Math.SQRT2)) < 1, `loudness ${r.loudness}`);
    assert.equal(r.pace, 4);
    const quiet = new ToneMeter();
    quiet.push(Buffer.alloc(32_000));
    assert.equal(quiet.read(3), null);
  });

  it('judges a turn only against the child\'s own usual voice', () => {
    let b: VoiceBaseline | null = null;
    const usual: ToneReading[] = [-20, -21, -19, -20, -22, -18].map((loudness, i) => ({ loudness, pitch: 300 + i * 4, pace: 2 + (i % 2) * 0.2, voicedSeconds: 2 }));
    for (const r of usual.slice(0, 4)) b = foldBaseline(b, r);
    assert.equal(judgeTone({ loudness: -40, pitch: 250, pace: 1, voicedSeconds: 2 }, b), null, 'too few turns to judge');
    for (const r of usual.slice(4)) b = foldBaseline(b, r);
    assert.equal(judgeTone({ loudness: -26, pitch: 290, pace: 1.4, voicedSeconds: 2 }, b)?.low, true, 'quieter and slower');
    assert.equal(judgeTone({ loudness: -14, pitch: 360, pace: 2.1, voicedSeconds: 2 }, b)?.low, false, 'louder and higher');
    assert.equal(judgeTone(usual[1], b), null, 'an ordinary turn says nothing');
  });
});

describe('the brief for growing up together', () => {
  it('carries the game, growth, goal, words, voice and traits, and no label', () => {
    const cast = SEED_CAST[0];
    const pack = { slug: cast.slug, name: cast.name, version: 1, bible: cast.bible, lifeRules: cast.life_rules, voices: cast.voices } as unknown as Parameters<typeof compileBrief>[0]['pack'];
    const instance = { id: 'i', role: 'friend', language_mode: 'bilingual', relationship_stage: 'best_friends', energy: 60, playfulness: 80, curiosity: 60, warmth: 70, structure: 40 } as unknown as Parameters<typeof compileBrief>[0]['instance'];
    const plan = decide({ classification: { ...happy, intent: 'play' }, firstTurnOfSession: false, dueCount: 0, energy: 'normal', minutesLeft: null, questionStreak: 0, ageYears: 6, candidateGame: game('hu') });
    const text = compileBrief({
      pack, instance, plan, classification: happy, transcript: 'Chơi với tớ đi!', audioTags: true, history: [], nudges: [],
      digest: { name: 'Bông', nickname: null, ageYears: 6, passions: [], likes: [], dislikes: [], fears: [], strengths: [], people: [], topicsToAvoid: [] },
      today: { date: '2026-10-30', weekday: 'Friday', mood: 60, energy: 'normal', diary: [] },
      recall: { memories: [], canon: [], people: [], due: [] },
      traits: ['They warm up slowly: give them time, ask easy questions and never push.'],
      growth: 'learning to ride a bike without training wheels',
      goal: 'They are learning English words: teach one word that fits what they said, as a game.',
      words: [['cat', 'con mèo']],
      voice: 'Quieter and slower than usual: they may be tired or a little low. Check in gently.',
    }).map((m) => m.content).join('\n');
    for (const part of ['Offer to play "Hù!"', 'do not do the surprise yet', 'GROWTH YOU NOTICED', 'A GENTLE FOCUS', 'cat (con mèo)', 'THEIR VOICE', 'HOW TO BE WITH THEM', 'never shout', 'playful startle game']) {
      assert.ok(text.includes(part), `brief has ${part}`);
    }
  });
});
