import { test } from 'node:test';
import assert from 'node:assert/strict';
import vi from '../src/i18n/vi.js';
import en from '../src/i18n/en.js';
import { LANGUAGE_MODES, ROLES } from '../src/lib/buddy.js';
import {
  CHILD_LANGUAGES, CODE_ALPHABET, answersKey, awakeToyOf, badCodeChar, birthDateProblem, buddyPatch, characterWho, childBody,
  cleanCode, codeReady, codeRejected, draftOf, fitVoice, formatCode, languageModeFor, newDraft, ownVoicesOf, pickVoice,
  questionnaireAnswers, rankCharacters, rebaseDraft, sampleUrl, stepNumber, textOr, toyOfChild, voiceChosen, voiceGroup,
  wizardPhases,
} from '../src/lib/wizard.js';

const VOICES = [
  { id: 'phan', name: 'Phan Anh', language: 'vi' },
  { id: 'cam', name: 'Cam Hong', language: 'vi' },
  { id: 'dude', name: 'Little Dude II', language: 'en' },
  { id: 'ziggy', name: 'Ziggy', language: 'en' },
];
const LUNA = { vi: 'cam', en: 'ziggy' };
// A bilingual Buddy speaks out loud in the child's first language.
const VI_FIRST = { name: 'An', languages: ['vi', 'en'] };
const EN_FIRST = { name: 'Bo', languages: ['en', 'vi'] };
const answer = (answers, question) => answers.find((a) => a.question === question);

test('the claim code: typed or pasted any way, kept to the card alphabet', () => {
  assert.equal(cleanCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(cleanCode(' ab cd ef gh jk '), 'ABCDEFGH', 'at most eight characters');
  assert.equal(formatCode('ABCD'), 'ABCD');
  assert.equal(formatCode('ABCDE'), 'ABCD-E');
  assert.ok(codeReady('ABCDEFGH'));
  assert.ok(!codeReady('ABCDEFG'), 'seven characters is not a code');
  assert.equal(badCodeChar('ABCDEFG1'), '1');
  assert.ok(!codeReady('ABCDEFGO'), 'O is never on a card');
  for (const c of 'ILOU01') assert.ok(!CODE_ALPHABET.includes(c), `${c} is easy to misread`);
});

test('a wrong code and an unreadable code both send the parent back to the card', () => {
  assert.ok(codeRejected({ code: 'invalid_claim' }));
  assert.ok(codeRejected({ code: 'invalid_request', fields: [{ field: 'claim_code', code: 'maxLength' }] }));
  assert.ok(!codeRejected({ code: 'invalid_request', fields: [{ field: 'child_id', code: 'format' }] }));
  assert.ok(!codeRejected({ code: 'child_has_toy' }));
});

test('a new child: trimmed name, its languages, the browser time zone, an optional birthday', () => {
  assert.deepEqual(childBody({ name: '  An ', birthDate: '', languages: 'both' }, 'Asia/Ho_Chi_Minh'),
    { name: 'An', languages: ['vi', 'en'], time_zone: 'Asia/Ho_Chi_Minh' });
  assert.deepEqual(childBody({ name: 'Bi', birthDate: '2020-05-01', languages: 'en' }, null),
    { name: 'Bi', languages: ['en'], birth_date: '2020-05-01' });
  assert.deepEqual(childBody({ name: 'Na', languages: 'klingon' }, null).languages, ['vi'], 'an unknown choice speaks Vietnamese');
});

test('a birthday is optional, but not in the future or far too long ago', () => {
  const now = new Date(2026, 9, 30);
  assert.equal(birthDateProblem('', now), null);
  assert.equal(birthDateProblem('2020-02-29', now), null);
  assert.equal(birthDateProblem('2026-10-31', now), 'future');
  assert.equal(birthDateProblem('1990-01-01', now), 'too_old');
  assert.equal(birthDateProblem('2021-02-30', now), 'invalid');
  assert.equal(birthDateProblem('30/10/2020', now), 'invalid');
});

test("a new Buddy starts in the child's languages, as a friend", () => {
  assert.equal(languageModeFor({ languages: ['vi'] }), 'vi');
  assert.equal(languageModeFor({ languages: ['en'] }), 'en');
  assert.equal(languageModeFor({ languages: ['en', 'vi'] }), 'bilingual');
  assert.equal(languageModeFor(null), 'vi');
  assert.deepEqual(newDraft({ languages: ['vi', 'en'] }), { personality: 'ENFP', role: 'friend', language: 'bilingual', voice_id: null });
});

test("a child's toys: one awake at most, and setup continues on the toy still held", () => {
  const devices = [
    { id: 'a', child_id: 'k1', status: 'disabled', disabled_by: 'parent' },
    { id: 'b', child_id: 'k2', status: 'active' },
    { id: 'c', child_id: 'k1', status: 'revoked' },
  ];
  assert.equal(awakeToyOf(devices, 'k1'), null);
  assert.equal(awakeToyOf(devices, 'k2').id, 'b');
  assert.equal(toyOfChild(devices, 'k1').id, 'a', 'a paused toy still belongs to the child');
  assert.equal(toyOfChild(devices, 'k3'), null);
});

test('the questionnaire answers come from the personality letters, the role and the language', () => {
  const enfp = questionnaireAnswers({ personality: 'ENFP', role: 'teacher', language: 'bilingual' });
  assert.deepEqual(enfp, [
    { question: 'friend_energy', answer: 'bouncy', by: 'child' },
    { question: 'friend_style', answer: 'curious', by: 'child' },
    { question: 'role', answer: 'teacher', by: 'parent' },
    { question: 'language', answer: 'bilingual', by: 'parent' },
  ]);
  const style = (code) => answer(questionnaireAnswers({ personality: code, role: 'friend', language: 'vi' }), 'friend_style').answer;
  assert.equal(style('INTJ'), 'curious', 'N wins over everything');
  assert.equal(style('ISFJ'), 'gentle', 'F when not N');
  assert.equal(style('ESTP'), 'silly', 'otherwise silly');
  assert.equal(answer(questionnaireAnswers({ personality: 'ISTJ' }), 'friend_energy').answer, 'calm');
  const fallback = questionnaireAnswers({ personality: null, role: 'boss', language: 'fr' });
  assert.equal(answer(fallback, 'friend_energy').answer, 'bouncy', 'no personality reads as the default ENFP');
  assert.equal(answer(fallback, 'role').answer, 'friend');
  assert.equal(answer(fallback, 'language').answer, 'vi');
  for (const r of ROLES) assert.equal(answer(questionnaireAnswers({ role: r }), 'role').answer, r);
});

test('the match is asked again only when an answer changed', () => {
  const a = questionnaireAnswers({ personality: 'ENFP', role: 'friend', language: 'vi' });
  const b = questionnaireAnswers({ personality: 'ENTP', role: 'friend', language: 'vi' });
  const c = questionnaireAnswers({ personality: 'INFP', role: 'friend', language: 'vi' });
  assert.equal(answersKey(a), answersKey(b), 'ENFP and ENTP answer the same');
  assert.notEqual(answersKey(a), answersKey(c));
});

test('characters are offered best match first, then the alternatives, then the rest', () => {
  const cast = [{ slug: 'bo' }, { slug: 'luna' }, { slug: 'pip' }, { slug: 'zed' }];
  const result = { match: { character: { slug: 'pip' } }, alternatives: [{ slug: 'luna' }, { slug: 'bo' }] };
  assert.deepEqual(rankCharacters(cast, result).map((c) => c.slug), ['pip', 'luna', 'bo', 'zed']);
  assert.deepEqual(rankCharacters(cast, null).map((c) => c.slug), ['bo', 'luna', 'pip', 'zed'], 'no result keeps the list order');
});

test("a character's introduction: the dictionary's, else the backend's sentence", () => {
  const t = (key) => (key === 'wzWho_bo' ? 'Một chú mây nhỏ.' : key);
  assert.equal(characterWho({ slug: 'bo', who: 'a small cloud sprite' }, t), 'Một chú mây nhỏ.');
  assert.equal(characterWho({ slug: 'zed', who: 'a brave little comet' }, t), 'A brave little comet.');
  assert.equal(characterWho({ slug: 'zed', who: '' }, t), '');
  assert.equal(textOr(t, 'pack_mega', 'Mega'), 'Mega');
});

test("the voice picker lists the voices of the language Buddy speaks out loud, the character's own first", () => {
  const viGroup = voiceGroup(VOICES, LUNA, 'vi', VI_FIRST);
  assert.equal(viGroup.language, 'vi');
  assert.deepEqual(viGroup.voices.map((v) => [v.id, v.is_default]), [['cam', true], ['phan', false]]);
  assert.deepEqual(voiceGroup(VOICES, LUNA, 'en', VI_FIRST).voices.map((v) => v.label), ['Ziggy', 'Little Dude II']);
  assert.equal(voiceGroup(VOICES, LUNA, 'bilingual', VI_FIRST).language, 'vi', "bilingual speaks with the child's first language");
  assert.equal(voiceGroup(VOICES, LUNA, 'bilingual', EN_FIRST).language, 'en');
  assert.equal(voiceGroup(VOICES, LUNA, 'bilingual', null).language, 'vi', 'no child: Vietnamese, as backend-v2 defaults');
});

test("without the character's voices, its own voice is a row of its own", () => {
  const group = voiceGroup(VOICES, null, 'vi');
  assert.equal(group.voices[0].id, null);
  assert.equal(group.voices[0].is_default, true);
  assert.equal(group.voices[0].sample, null, 'nothing to play');
  assert.deepEqual(group.voices.slice(1).map((v) => [v.id, v.sample]), [['phan', 'phan'], ['cam', 'cam']]);
  const unlisted = voiceGroup(VOICES, { vi: 'secret' }, 'vi').voices[0];
  assert.deepEqual([unlisted.id, unlisted.sample], [null, 'secret'], 'a voice not offered can still be heard');
  const noVi = voiceGroup(VOICES, { vi: null, en: 'ziggy' }, 'vi').voices;
  assert.deepEqual(noVi.map((v) => v.id), [null, 'phan', 'cam'], 'a language the character has no voice for');
  assert.equal(ownVoicesOf({ character_voices: LUNA }), LUNA);
  assert.equal(ownVoicesOf({ voices: LUNA }), LUNA);
  assert.equal(ownVoicesOf({ voices: [] }), null);
  assert.equal(ownVoicesOf(null), null);
});

// GET /voices and GET /characters as backend-v2 answers them: the seeded
// voices (migrations/007_web.sql, ordered by language) and the released cast
// with each character's own voice per language (src/character/packs.ts).
const VOICES_RESPONSE = {
  data: [
    { id: 'fBD19tfE58bkETeiwUoC', name: 'Little Dude II', language: 'en' },
    { id: '87n4zM8Wuy87vFILuKvE', name: 'Ziggy', language: 'en' },
    { id: 'e79twtVS2278lVZZQiAD', name: 'The Elf', language: 'en' },
    { id: 'mgBpvrNosWzExdPuRbXP', name: 'Phan Anh', language: 'vi' },
    { id: 'x4KAhuXs2G8TfK9Zr7Q4', name: 'Cam Hong', language: 'vi' },
  ],
};
const CHARACTERS_RESPONSE = {
  data: [
    { slug: 'bo', name: 'Bo', who: 'a small cloud sprite who floated down into the toy to find a best friend',
      themes: ['nature', 'stories', 'sky', 'words', 'drawing'], voices: { vi: 'mgBpvrNosWzExdPuRbXP', en: 'fBD19tfE58bkETeiwUoC' } },
    { slug: 'luna', name: 'Luna', who: 'a gentle moon rabbit who came down a moonbeam into the toy',
      themes: ['stories', 'music', 'animals', 'sea', 'drawing'], voices: { vi: 'x4KAhuXs2G8TfK9Zr7Q4', en: 'e79twtVS2278lVZZQiAD' } },
    { slug: 'pip', name: 'Pip', who: 'a tiny star who tumbled into the toy and loves building things',
      themes: ['building', 'space', 'numbers', 'running'], voices: { vi: 'mgBpvrNosWzExdPuRbXP', en: '87n4zM8Wuy87vFILuKvE' } },
  ],
};

test("a family's first Buddy: the voice step plays and tags the character's own voice, listed once", () => {
  const voices = VOICES_RESPONSE.data;
  // What the wizard holds: data.jsx keeps each response's data, and the
  // voice step finds the chosen character there (no Buddy exists yet).
  for (const character of CHARACTERS_RESPONSE.data) {
    const own = ownVoicesOf(character);
    assert.deepEqual(own, character.voices, character.slug);
    for (const [mode, child, language] of [['vi', VI_FIRST, 'vi'], ['en', VI_FIRST, 'en'], ['bilingual', VI_FIRST, 'vi'], ['bilingual', EN_FIRST, 'en']]) {
      const group = voiceGroup(voices, own, mode, child);
      const what = `${character.slug} ${mode} ${child.languages[0]}`;
      const [first, ...rest] = group.voices;
      assert.equal(first.id, character.voices[language], `${what}: the own voice comes first, as the listed voice`);
      assert.equal(first.is_default, true, `${what}: tagged as the character's voice`);
      assert.equal(first.sample, character.voices[language], `${what}: with its sample to play, like any other voice`);
      assert.equal(pickVoice(first), null, `${what}: choosing it follows the character`);
      assert.ok(!rest.some((v) => v.id === first.id || v.is_default), `${what}: not listed again`);
      assert.deepEqual(rest.map((v) => v.language), rest.map(() => language), `${what}: only voices of that language`);
      assert.equal(group.voices.length, voices.filter((v) => v.language === language).length, `${what}: every voice of it, once`);
      assert.deepEqual(group.voices.filter((row) => voiceChosen(row, null, voices)), [first], `${what}: no pick shows the own voice chosen`);
    }
  }
  assert.equal(voiceGroup(voices, ownVoicesOf(CHARACTERS_RESPONSE.data[0]), 'vi', VI_FIRST).voices[0].label, 'Phan Anh', "Bo's own voice by its name");
});

test('one stored voice: the chosen row, and what a tap stores', () => {
  const group = voiceGroup(VOICES, LUNA, 'bilingual', VI_FIRST);
  const chosen = (voiceId) => group.voices.filter((row) => voiceChosen(row, voiceId, VOICES)).map((row) => row.id);
  assert.deepEqual(chosen(null), ['cam'], "no pick: the character's own voice");
  assert.deepEqual(chosen('phan'), ['phan']);
  assert.deepEqual(chosen('dude'), ['cam'], 'a voice of another language is never used, so the own voice shows');
  const row = (id) => group.voices.find((v) => v.id === id);
  assert.equal(pickVoice(row('phan')), 'phan');
  assert.equal(pickVoice(row('cam')), null, "the character's own voice is stored as null");
  assert.equal(pickVoice(voiceGroup(VOICES, null, 'vi').voices[0]), null, 'so is the own-voice row of its own');
});

test('a picked voice stays only while Buddy speaks out loud in its language', () => {
  assert.equal(fitVoice('dude', VOICES, 'vi'), null);
  assert.equal(fitVoice('dude', VOICES, 'bilingual', VI_FIRST), null, "bilingual speaks with the child's first language");
  assert.equal(fitVoice('dude', VOICES, 'bilingual', EN_FIRST), 'dude');
  assert.equal(fitVoice('phan', VOICES, 'bilingual', VI_FIRST), 'phan');
  assert.equal(fitVoice('phan', VOICES, 'vi'), 'phan');
  assert.equal(fitVoice('gone', VOICES, 'vi'), null);
  assert.equal(fitVoice(null, VOICES, 'vi'), null);
  assert.equal(sampleUrl('a b'), '/voice-samples/a%20b.wav');
});

test('a save sends only what changed', () => {
  const buddy = { role: 'friend', language_mode: 'vi', personality: null, voice_id: null };
  assert.deepEqual(buddyPatch(buddy, draftOf(buddy)), {});
  assert.deepEqual(buddyPatch(buddy, { personality: 'ISFJ', role: 'friend', language: 'en', voice_id: 'dude' }),
    { personality: 'ISFJ', language_mode: 'en', voice_id: 'dude' });
  assert.deepEqual(buddyPatch({ ...buddy, voice_id: 'phan' }, { ...draftOf(buddy), voice_id: null }), { voice_id: null });
});

test("after a stale write the parent's edits survive and the rest is the newest Buddy", () => {
  const base = { role: 'friend', language_mode: 'vi', personality: 'ENFP', voice_id: 'phan' };
  const draft = { ...draftOf(base), role: 'teacher' };
  const fresh = { role: 'sibling', language_mode: 'en', personality: 'ISTJ', voice_id: null };
  assert.deepEqual(rebaseDraft(base, draft, fresh, VOICES), { personality: 'ISTJ', role: 'teacher', language: 'en', voice_id: null });
  const voiceDraft = { ...draftOf(base), voice_id: 'cam' };
  assert.equal(rebaseDraft(base, voiceDraft, fresh, VOICES).voice_id, null, 'a Vietnamese voice does not fit an English Buddy');
  assert.equal(rebaseDraft(base, voiceDraft, { ...fresh, language_mode: 'vi' }, VOICES).voice_id, 'cam');
  const bilingual = { ...fresh, language_mode: 'bilingual' };
  assert.equal(rebaseDraft(base, voiceDraft, bilingual, VOICES, VI_FIRST).voice_id, 'cam', "a bilingual Buddy keeps a voice of the child's first language");
  assert.equal(rebaseDraft(base, voiceDraft, bilingual, VOICES, EN_FIRST).voice_id, null);
});

test('the stepper: a dot per screen, code first when there is a card', () => {
  assert.deepEqual(wizardPhases({ withCode: true }), ['code', 'child', 'personality', 'role', 'language', 'character', 'voice', 'review']);
  assert.deepEqual(wizardPhases({ withCode: false })[0], 'child');
  assert.deepEqual(wizardPhases({ withCode: true, resume: true })[0], 'personality', 'resuming skips the toy');
  const phases = wizardPhases({});
  assert.equal(stepNumber(phases, 'child'), 1);
  assert.equal(stepNumber(phases, 'quiz'), 2, 'the quiz is the personality step');
  assert.equal(stepNumber(phases, 'done'), phases.length);
  assert.equal(stepNumber(phases, 'existing'), phases.length);
});

test('every key the wizard builds at runtime is in both dictionaries', () => {
  const keys = [
    ...LANGUAGE_MODES.flatMap((m) => [`wzMode_${m}`, `wzModeSays_${m}`]),
    ...['vi', 'en'].map((l) => `wzVoiceBilingual_${l}`),
    ...Object.keys(CHILD_LANGUAGES).map((l) => `wzChildLang_${l}`),
    ...['bo', 'pip', 'luna'].map((s) => `wzWho_${s}`),
    ...['invalid', 'future', 'too_old'].map((p) => `wzBirth_${p}`),
  ];
  const missing = keys.filter((k) => !(k in vi) || !(k in en));
  assert.deepEqual(missing, []);
});
