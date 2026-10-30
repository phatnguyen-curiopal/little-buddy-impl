import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { LANGUAGE_MODES, ROLES, speechLanguage, spokenLanguages, toyActions, toyView, voicesForBuddy } from '../src/lib/buddy.js';

const backendV2 = (path) => readFile(new URL(`../../backend-v2/${path}`, import.meta.url), 'utf8');

test("roles and language modes are backend-v2's", () => {
  assert.deepEqual(ROLES, ['friend', 'sibling', 'parent_figure', 'teacher']);
  assert.deepEqual(LANGUAGE_MODES, ['vi', 'en', 'bilingual']);
});

const children = [{ id: 'c1', name: 'An' }, { id: 'c2', name: 'Bin' }];
const luna = { id: 'b1', character_slug: 'luna', character_name: 'Luna', role: 'friend', language_mode: 'vi', voice_id: null, character_voices: { vi: 'hong', en: 'elf' } };
const buddies = { c1: luna, c2: null };
const toy = (over = {}) => ({ id: 'd1', serial: 'LB-1', hardware_rev: 'web', status: 'active', disabled_by: null, child_id: 'c1', ...over });

test("a toy shows its child's Buddy: the character's name", () => {
  const v = toyView(toy(), children, buddies);
  assert.equal(v.child.name, 'An');
  assert.equal(v.buddy, luna);
  assert.equal(v.name, 'Luna');
  assert.equal(v.web, true);
});

test('a toy whose child has no Buddy yet is a plain Buddy', () => {
  const v = toyView(toy({ child_id: 'c2', hardware_rev: 'rev-b' }), children, buddies);
  assert.equal(v.child.name, 'Bin');
  assert.equal(v.buddy, null);
  assert.equal(v.name, 'Buddy');
  assert.equal(v.web, false);
  assert.equal(toyView(toy({ child_id: 'c2' }), children, {}).buddy, null, 'Buddies not loaded yet');
});

test('a toy without a child has no child and no Buddy', () => {
  for (const childId of [null, 'gone']) {
    const v = toyView(toy({ child_id: childId }), children, buddies);
    assert.equal(v.child, null);
    assert.equal(v.buddy, null);
    assert.equal(v.name, 'Buddy');
  }
});

test('only an awake web Buddy whose child has a Buddy can talk on the site', () => {
  const can = (over, webToy = true, b = buddies) => toyActions(toyView(toy(over), children, b), webToy);
  assert.equal(can({}).talk, true);
  assert.equal(can({}, false).talk, false, 'the web toy is off');
  assert.equal(can({ hardware_rev: 'rev-b' }).talk, false, "a physical toy's secret never leaves it");
  assert.equal(can({ status: 'disabled', disabled_by: 'parent' }).talk, false);
  assert.equal(can({ child_id: 'c2' }).talk, false, 'no Buddy yet');
});

test('a toy offers to finish the setup, pause and wake as its state allows', () => {
  const can = (over) => toyActions(toyView(toy(over), children, buddies), true);
  assert.deepEqual(can({}), { talk: true, setup: false, pause: true, wake: false });
  assert.equal(can({ child_id: 'c2' }).setup, true);
  assert.equal(can({ child_id: null }).setup, false, 'without a child there is nobody to set up');
  assert.deepEqual(can({ status: 'disabled', disabled_by: 'parent' }), { talk: false, setup: false, pause: false, wake: true });
  assert.equal(can({ status: 'disabled', disabled_by: 'staff' }).wake, false, 'staff holds it');
  assert.equal(can({ status: 'revoked', child_id: 'c2' }).setup, false);
});

test('a bilingual Buddy speaks both languages; anything else one', () => {
  assert.deepEqual(spokenLanguages('vi'), ['vi']);
  assert.deepEqual(spokenLanguages('en'), ['en']);
  assert.deepEqual(spokenLanguages('bilingual'), ['vi', 'en']);
  assert.deepEqual(spokenLanguages(undefined), ['vi']);
});

// backend-v2's speechLanguage (src/voice/turn.ts): the voice a turn speaks
// with, which is also the only language a picked voice may have.
test("out loud, a bilingual Buddy speaks the child's first language", () => {
  assert.equal(speechLanguage('vi', { languages: ['en'] }), 'vi', "a one-language Buddy speaks its own, whatever the child's");
  assert.equal(speechLanguage('en', { languages: ['vi'] }), 'en');
  assert.equal(speechLanguage('bilingual', { languages: ['vi', 'en'] }), 'vi');
  assert.equal(speechLanguage('bilingual', { languages: ['en', 'vi'] }), 'en');
  assert.equal(speechLanguage('bilingual', null), 'vi');
  assert.equal(speechLanguage('bilingual', { languages: [] }), 'vi');
});

// As GET /voices sends them: grouped by language, in display order.
const VOICES = [
  { id: 'dude', name: 'Little Dude II', language: 'en' },
  { id: 'elf', name: 'The Elf', language: 'en' },
  { id: 'anh', name: 'Phan Anh', language: 'vi' },
  { id: 'hong', name: 'Cam Hong', language: 'vi' },
];

test("the character's own voice in each language is the default", () => {
  const out = voicesForBuddy(VOICES, luna);
  assert.deepEqual(out.map((v) => v.id), ['dude', 'elf', 'anh', 'hong'], 'order kept');
  assert.deepEqual(out.filter((v) => v.is_default).map((v) => v.id), ['elf', 'hong']);
  assert.deepEqual(out.map((v) => v.label), ['Little Dude II', 'The Elf', 'Phan Anh', 'Cam Hong']);
  assert.equal(VOICES[0].label, undefined, 'the list from the API is not changed');
});

test('without a Buddy no voice is the default, and no list is an empty one', () => {
  assert.ok(voicesForBuddy(VOICES, null).every((v) => v.is_default === false));
  assert.deepEqual(voicesForBuddy(undefined, luna), []);
});

test('every voice backend-v2 seeds has its sample checked in', async () => {
  const sql = await backendV2('migrations/007_web.sql');
  const ids = [...sql.matchAll(/\('([A-Za-z0-9_-]{20})', '[^']+', '(?:vi|en)'/g)].map((m) => m[1]);
  assert.equal(ids.length, 5);
  for (const id of ids) await access(new URL(`../public/voice-samples/${id}.wav`, import.meta.url));
});

// The voice picker shows a character's own voice as one of GET /voices' rows,
// tagged and with its sample, only while each pack speaks with seeded voices.
test("every character backend-v2 seeds speaks with a seeded voice of each language", async () => {
  const [packs, sql] = await Promise.all([backendV2('src/character/packs.ts'), backendV2('migrations/007_web.sql')]);
  const seeded = new Map([...sql.matchAll(/\('([A-Za-z0-9_-]{20})', '[^']+', '(vi|en)'/g)].map((m) => [m[1], m[2]]));
  const cast = [...packs.matchAll(/voices: \{ vi: \{ voice_id: '([^']+)' \}, en: \{ voice_id: '([^']+)' \} \}/g)];
  assert.ok(cast.length >= 3, `found ${cast.length} characters' voices, the scan is probably broken`);
  for (const [, vi, en] of cast) {
    assert.equal(seeded.get(vi), 'vi', `${vi} is a seeded Vietnamese voice`);
    assert.equal(seeded.get(en), 'en', `${en} is a seeded English voice`);
  }
});
