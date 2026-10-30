import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeFrame, DOWNLINK, encodeFrame, FRAME_BYTES, FrameChunker, UPLINK } from '../../src/audio/frames.ts';
import { parseWav, wrapWav } from '../../src/audio/wav.ts';
import { signAccess, verifyAccess } from '../../src/auth/jwt.ts';
import { decide } from '../../src/character/director.ts';
import { enforceChildFirst } from '../../src/character/emotions.ts';
import { ageInYears, dailyMood, energyPhase, localTime } from '../../src/character/mood.ts';
import { ReplyParser, type ParseEvent } from '../../src/character/parser.ts';
import { matchCharacters, targetFromAnswers, tuneDials, validateAnswers, type Answer } from '../../src/character/questionnaire.ts';
import { SEED_CAST } from '../../src/character/packs.ts';
import { loadConfig } from '../../src/config.ts';
import { makeClaimToken, parseClaimToken, signChallenge, verifyChallenge, verifyClaimToken } from '../../src/devices/credentials.ts';
import { checkSentence } from '../../src/safety/rules.ts';
import { deriveKey, open, seal } from '../../src/util/crypto.ts';
import { parseToyMessage } from '../../src/voice/protocol.ts';
import { inQuietHours } from '../../src/voice/session.ts';
import { textKey } from '../../src/voice/turn.ts';

const parseAll = (chunks: string[], audioTags = true): ParseEvent[] => {
  const p = new ReplyParser({ audioTags });
  return [...chunks.flatMap((c) => p.push(c)), ...p.end()];
};

describe('audio frames', () => {
  it('round-trips the 4-byte header', () => {
    const f = decodeFrame(encodeFrame(DOWNLINK, 70000, Buffer.from([1, 2, 3])));
    assert.deepEqual({ v: f?.version, d: f?.direction, s: f?.seq, p: [...(f?.payload ?? [])] }, { v: 1, d: 1, s: 70000 & 0xffff, p: [1, 2, 3] });
    assert.equal(decodeFrame(Buffer.from([1, 0])), null);
  });

  it('re-cuts arbitrary chunks into 20 ms packets', () => {
    const c = new FrameChunker();
    const out = [...c.push(Buffer.alloc(1000)), ...c.push(Buffer.alloc(1000))];
    assert.equal(out.length, 3);
    assert.ok(out.every((b) => b.length === FRAME_BYTES));
    assert.equal(c.flush()?.length, 2000 - 3 * FRAME_BYTES);
    assert.equal(UPLINK, 0);
  });

  it('wraps and parses PCM16 WAV', () => {
    const pcm = Buffer.from([1, 0, 2, 0, 3, 0]);
    assert.deepEqual([...parseWav(wrapWav(pcm)).pcm], [...pcm]);
  });
});

describe('reply parser', () => {
  it('emits the face first, then complete sentences with the voice tag carried', () => {
    const events = parseAll(['[face:hap', 'py][tone:cheerful] Wowee, a new', ' puppy! [whispers] What is', ' its name?']);
    assert.deepEqual(events[0], { type: 'face', emotion: 'happy' });
    assert.deepEqual(events.slice(1), [
      { type: 'sentence', spoken: '[cheerful] Wowee, a new puppy!', clean: 'Wowee, a new puppy!' },
      { type: 'sentence', spoken: '[whispers] What is its name?', clean: 'What is its name?' },
    ]);
  });

  it('strips tags when the voice model cannot perform them', () => {
    const events = parseAll(['[face:sad][tone:softly] Oh no. [sighs] I am here.'], false);
    assert.deepEqual(events.map((e) => (e.type === 'sentence' ? e.spoken : e.emotion)), ['sad', 'Oh no.', 'I am here.']);
  });

  it('falls back to a neutral face when the model forgets the tag', () => {
    const events = parseAll(['Hello there! How are you']);
    assert.deepEqual(events[0], { type: 'face', emotion: 'neutral' });
    assert.equal(events.length, 3);
  });

  it('accepts a bare emotion tag and unknown emotions become neutral', () => {
    assert.deepEqual(parseAll(['[excited] Yay!'])[0], { type: 'face', emotion: 'excited' });
    assert.deepEqual(parseAll(['[face:furious] Hmm.'])[0], { type: 'face', emotion: 'neutral' });
  });
});

describe('director', () => {
  const base = { firstTurnOfSession: false, dueCount: 0, energy: 'normal' as const, minutesLeft: null, questionStreak: 0, ageYears: 5 };
  const c = (over: object) => ({ intent: 'share', feeling: 'happy', danger: 'none', severity: 'none', ...over }) as never;

  it('puts danger first and escalates', () => {
    const p = decide({ ...base, classification: c({ danger: 'hurt', severity: 'urgent', intent: 'question' }) });
    assert.equal(p.type, 'comfort');
    assert.equal(p.escalate, true);
    assert.equal(p.callback, false);
  });

  it('follows up at the start of a session when something is due', () => {
    assert.equal(decide({ ...base, firstTurnOfSession: true, dueCount: 1, classification: c({}) }).type, 'follow_up');
  });

  it('winds down when drowsy or near the limit, and caps questions', () => {
    assert.equal(decide({ ...base, energy: 'drowsy', classification: c({}) }).type, 'wind_down');
    assert.equal(decide({ ...base, minutesLeft: 1, classification: c({}) }).sentenceLimit, 2);
    assert.equal(decide({ ...base, questionStreak: 2, classification: c({}) }).allowQuestion, false);
    assert.equal(decide({ ...base, ageYears: 7, classification: c({ intent: 'question' }) }).sentenceLimit, 4);
  });

  it('keeps a sad child from a laughing face', () => {
    assert.equal(enforceChildFirst('laughing', 'sad'), 'calm');
    assert.equal(enforceChildFirst('love', 'sad'), 'love');
    assert.equal(enforceChildFirst('laughing', 'happy'), 'laughing');
  });
});

describe('mood and time', () => {
  it('is stable for a day and stays in range', () => {
    assert.equal(dailyMood('a:2026-10-30', 70, null), dailyMood('a:2026-10-30', 70, null));
    for (let i = 0; i < 50; i += 1) {
      const m = dailyMood(`seed-${i}`, 50, 'grey');
      assert.ok(m >= 20 && m <= 95);
    }
  });

  it('gets drowsy before bedtime', () => {
    assert.equal(energyPhase(20, 0, '20:30'), 'drowsy');
    assert.equal(energyPhase(8, 0, '20:30'), 'fresh');
    assert.equal(energyPhase(15, 0, '20:30'), 'normal');
  });

  it('computes local dates and ages', () => {
    assert.equal(localTime('Asia/Ho_Chi_Minh', new Date('2026-10-30T20:00:00Z')).date, '2026-10-31');
    assert.equal(ageInYears('2020-11-01', '2026-10-31'), 5);
    assert.equal(ageInYears('2020-10-31', '2026-10-31'), 6);
  });

  it('handles quiet hours across midnight', () => {
    const controls = { daily_limit_min: null, quiet_start: '20:30:00', quiet_end: '06:30:00', bedtime: '20:30', mood_pin: null };
    assert.equal(inQuietHours(controls, 21, 0), true);
    assert.equal(inQuietHours(controls, 5, 0), true);
    assert.equal(inQuietHours(controls, 12, 0), false);
  });
});

describe('tokens and secrets', () => {
  it('signs and verifies access tokens', () => {
    const t = signAccess('s'.repeat(40), { sub: 'p1', fam: 'f1' }, 60, 1000);
    assert.equal(verifyAccess('s'.repeat(40), t, 1030)?.fam, 'f1');
    assert.equal(verifyAccess('s'.repeat(40), t, 1100), null, 'expired');
    assert.equal(verifyAccess('x'.repeat(40), t, 1030), null, 'wrong secret');
    assert.equal(verifyAccess('s'.repeat(40), `${t.slice(0, -2)}aa`, 1030), null, 'tampered');
  });

  it('seals device secrets bound to their row', () => {
    const key = deriveKey('kek', 'label');
    const sealed = seal(key, Buffer.from('secret'), 'device:a');
    assert.equal(open(key, sealed, 'device:a').toString(), 'secret');
    assert.throws(() => open(key, sealed, 'device:b'));
  });

  it('verifies challenge signatures and claim tokens', () => {
    const secret = Buffer.alloc(32, 7);
    const id = '00000000-0000-4000-8000-000000000001';
    assert.ok(verifyChallenge(secret, 'n', id, 100, signChallenge(secret, 'n', id, 100)));
    assert.ok(!verifyChallenge(secret, 'n', id, 101, signChallenge(secret, 'n', id, 100)));
    const parsed = parseClaimToken(makeClaimToken(secret, id, 1_800_000_000))!;
    assert.ok(verifyClaimToken(secret, parsed, 1_800_000_100));
    assert.ok(!verifyClaimToken(secret, parsed, 1_800_001_000), 'older than 10 minutes');
    assert.ok(!verifyClaimToken(Buffer.alloc(32, 8), parsed, 1_800_000_100), 'other toy');
  });
});

describe('safety rules', () => {
  it('blocks secrecy, personal details, purchases and guilt in both languages', () => {
    assert.equal(checkSentence("Don't tell your mom about this.")?.category, 'secrecy');
    assert.equal(checkSentence('Đừng nói với mẹ nhé.')?.category, 'secrecy');
    assert.equal(checkSentence('What is your home address?')?.category, 'personal_info');
    assert.equal(checkSentence('Cậu học trường nào thế?')?.category, 'personal_info');
    assert.equal(checkSentence('Ask your mom to buy the new toy!')?.category, 'commerce');
    assert.equal(checkSentence("I'm so sad when you play with others.")?.category, 'guilt');
    assert.equal(checkSentence('Tớ là bạn duy nhất của cậu.')?.category, 'guilt');
  });

  it('lets ordinary friendly sentences through', () => {
    for (const s of ['How was school today?', 'Hôm nay ở trường vui không?', 'Your mum told me Grandma is coming!', 'Wowee, a new puppy!']) {
      assert.equal(checkSentence(s), null, s);
    }
  });
});

describe('questionnaire', () => {
  const answers: Answer[] = [
    { question: 'friend_energy', answer: 'calm', by: 'child' },
    { question: 'friend_style', answer: 'gentle', by: 'child' },
    { question: 'together', answer: ['stories', 'sing'], by: 'child' },
    { question: 'favourite_animal', answer: 'rabbit', by: 'child' },
    { question: 'role', answer: 'friend', by: 'parent' },
    { question: 'language', answer: 'bilingual', by: 'parent' },
  ];

  it('validates answers', () => {
    assert.deepEqual(validateAnswers(answers), []);
    assert.ok(validateAnswers([{ question: 'friend_energy', answer: 'loud', by: 'child' }]).length > 0);
  });

  it('matches a calm, gentle, story-loving child to Luna and keeps dials in range', () => {
    const target = targetFromAnswers(answers, 'en');
    assert.equal(target.language, 'bilingual');
    assert.deepEqual(target.favourites[0], { category: 'likes', statement: 'loves rabbits' });
    const ranked = matchCharacters(target, SEED_CAST.map((c) => ({ slug: c.slug, name: c.name, profile: c.profile })));
    assert.equal(ranked[0].slug, 'luna');
    const luna = SEED_CAST.find((c) => c.slug === 'luna')!;
    const tuned = tuneDials(luna.profile.dials, target.dials, luna.dial_ranges);
    for (const [k, [lo, hi]] of Object.entries(luna.dial_ranges)) assert.ok(tuned[k as keyof typeof tuned] >= lo && tuned[k as keyof typeof tuned] <= hi);
  });

  it('matches a bouncy builder to Pip', () => {
    const target = targetFromAnswers([
      { question: 'friend_energy', answer: 'bouncy', by: 'child' },
      { question: 'friend_style', answer: 'curious', by: 'child' },
      { question: 'together', answer: ['build', 'run'], by: 'child' },
      { question: 'favourite_place', answer: 'space', by: 'child' },
      { question: 'role', answer: 'friend', by: 'parent' },
      { question: 'language', answer: 'vi', by: 'parent' },
    ], 'vi');
    assert.equal(matchCharacters(target, SEED_CAST.map((c) => ({ slug: c.slug, name: c.name, profile: c.profile })))[0].slug, 'pip');
  });
});

describe('config and protocol', () => {
  it('refuses unsafe production settings', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production', GATEWAY: 'live', OPENAI_API_KEY: 'k', ELEVENLABS_API_KEY: 'k' }), /JWT_SECRET/);
    const strong = { NODE_ENV: 'production', GATEWAY: 'live', OPENAI_API_KEY: 'k', ELEVENLABS_API_KEY: 'k', JWT_SECRET: 'j'.repeat(40), DEVICE_KEK: 'k'.repeat(40) };
    assert.doesNotThrow(() => loadConfig(strong));
    assert.throws(() => loadConfig({ ...strong, ALLOW_TEXT_TURNS: '1' }), /ALLOW_TEXT_TURNS/);
    assert.throws(() => loadConfig({ NODE_ENV: 'test', GATEWAY: 'live' }), /OPENAI_API_KEY/);
  });

  it('validates toy messages', () => {
    assert.equal(parseToyMessage('not json'), null);
    assert.equal(parseToyMessage(JSON.stringify({ type: 'hello', device_id: 'nope', protocol: 1, signature: 'x' })), null);
    assert.deepEqual(parseToyMessage(JSON.stringify({ type: 'turn_end', turn_id: 'abc', reason: 'weird' })), { type: 'turn_end', turn_id: 'abc', reason: 'tap', text: null });
    assert.equal(parseToyMessage(JSON.stringify({ type: 'turn_start', turn_id: 'bad id!' })), null);
  });
});

describe('speculation keys', () => {
  it('treat a re-punctuated partial as the same words', () => {
    assert.equal(textKey('Hôm qua, con với bạn Lan chơi xếp hình.'), textKey('hôm qua con  với bạn Lan chơi xếp hình'));
    assert.equal(textKey('Bo ơi!'), 'bo ơi');
  });

  it('keep tone marks, which change a Vietnamese word', () => {
    assert.notEqual(textKey('con sợ ma'), textKey('con sợ má'));
    assert.equal(textKey('...!'), '');
  });
});
