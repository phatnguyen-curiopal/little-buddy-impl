// The add-a-Buddy wizard and the toy drawer, the parts that need no React:
// the claim code, a new child's request, the questionnaire answers the site
// derives from a parent's choices, how the characters are offered and which
// voices fit. Pure, so node --test covers it.
import { LANGUAGE_MODES, ROLES, speechLanguage } from './buddy.js';
import { age, isoDay, localTimeZone } from './format.js';

// ---------- The claim code printed on the card ----------

// Same alphabet as backend-v2's claim codes: no I, L, O, U, 0 or 1, so
// nothing on the card can be misread. backend-v2 ignores case and dashes.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const CODE_LENGTH = 8;

// What the parent typed or pasted, as a code: upper case, no dashes or
// spaces, at most eight characters.
export function cleanCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export const badCodeChar = (code) => [...code].find((c) => !CODE_ALPHABET.includes(c)) ?? null;
export const codeReady = (code) => code.length === CODE_LENGTH && !badCodeChar(code);
export const formatCode = (code) => (code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

// A claim answer that means "look at the card again": a wrong or used code
// is one 404, and a code the server cannot even read is a 400 on its field.
export function codeRejected(err) {
  if (err?.code === 'invalid_claim') return true;
  return err?.code === 'invalid_request' && (err.fields ?? []).some((f) => f.field === 'claim_code');
}

// ---------- Children ----------

// The child form's language choice and what backend-v2 stores for it.
export const CHILD_LANGUAGES = Object.freeze({ vi: ['vi'], en: ['en'], both: ['vi', 'en'] });

// Buddy is for young children; anything older is almost surely a typo.
export const MAX_CHILD_AGE = 14;

// null when the birthday is fine or left empty (it is optional).
export function birthDateProblem(value, now = new Date()) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return 'invalid';
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (day.toISOString().slice(0, 10) !== value) return 'invalid';
  if (value > isoDay(now)) return 'future';
  if (age(value, now) > MAX_CHILD_AGE) return 'too_old';
  return null;
}

// What POST /children takes. The browser's time zone goes along because
// Buddy's day (quiet hours, the mood, the weekly digest) follows the child's
// clock, which the browser knows better than a default.
export function childBody({ name, birthDate, languages }, timeZone = localTimeZone()) {
  const body = { name: String(name ?? '').trim(), languages: [...(CHILD_LANGUAGES[languages] ?? CHILD_LANGUAGES.vi)] };
  if (birthDate) body.birth_date = birthDate;
  if (timeZone) body.time_zone = timeZone;
  return body;
}

// The language a new Buddy starts with: the languages the child speaks.
export function languageModeFor(child) {
  const langs = child?.languages ?? [];
  if (langs.includes('vi') && langs.includes('en')) return 'bilingual';
  return langs.includes('en') ? 'en' : 'vi';
}

// ---------- Toys ----------

// A child has at most one awake toy, so this one decides whether the child
// can take another.
export function awakeToyOf(devices, childId) {
  return (devices ?? []).find((x) => x.child_id === childId && x.status === 'active') ?? null;
}

// The toy an unfinished setup continues on: the child's awake toy, else any
// toy the family still holds for the child.
export function toyOfChild(devices, childId) {
  return awakeToyOf(devices, childId) ?? (devices ?? []).find((x) => x.child_id === childId && x.status !== 'revoked') ?? null;
}

// ---------- The Buddy's choices ----------

export const DEFAULT_PERSONALITY = 'ENFP';
const PERSONALITY_RE = /^[EI][NS][FT][JP]$/;

// What the wizard and the drawer edit: one field per thing a parent picks.
// personality may be null (a Buddy made by the app, or after a character
// change, has none until a parent picks one).
export function draftOf(buddy) {
  return {
    personality: PERSONALITY_RE.test(buddy?.personality ?? '') ? buddy.personality : null,
    role: ROLES.includes(buddy?.role) ? buddy.role : 'friend',
    language: LANGUAGE_MODES.includes(buddy?.language_mode) ? buddy.language_mode : 'vi',
    voice_id: buddy?.voice_id ?? null,
  };
}

// A new Buddy starts as a friend speaking the child's languages.
export function newDraft(child) {
  return { personality: DEFAULT_PERSONALITY, role: 'friend', language: languageModeFor(child), voice_id: null };
}

// Only what changed, so a save never rewrites a field it did not touch (a
// personality sent again would reset dials someone tuned in the app).
export function buddyPatch(base, draft) {
  const before = draftOf(base);
  const patch = {};
  if (draft.personality !== before.personality) patch.personality = draft.personality;
  if (draft.role !== before.role) patch.role = draft.role;
  if (draft.language !== before.language) patch.language_mode = draft.language;
  if ((draft.voice_id ?? null) !== before.voice_id) patch.voice_id = draft.voice_id ?? null;
  return patch;
}

// After a stale write: keep what the parent changed in this editor, take
// everything else from the Buddy as it is now. child is the Buddy's child,
// whose first language a bilingual Buddy speaks with.
export function rebaseDraft(base, draft, fresh, voices, child) {
  const before = draftOf(base);
  const out = draftOf(fresh);
  for (const k of Object.keys(out)) {
    if (draft[k] !== before[k]) out[k] = draft[k];
  }
  if (voices) out.voice_id = fitVoice(out.voice_id, voices, out.language, child);
  return out;
}

// ---------- The questionnaire ----------

// backend-v2 matches a character from the questionnaire. The site asks for a
// personality instead of the child-facing questions, so the two answers the
// matcher requires come from its letters: E is bouncy and I calm; N is
// curious, else F gentle, else silly. Role and language are the parent's.
export function questionnaireAnswers({ personality, role, language }) {
  const code = PERSONALITY_RE.test(personality ?? '') ? personality : DEFAULT_PERSONALITY;
  return [
    { question: 'friend_energy', answer: code[0] === 'E' ? 'bouncy' : 'calm', by: 'child' },
    { question: 'friend_style', answer: code[1] === 'N' ? 'curious' : code[2] === 'F' ? 'gentle' : 'silly', by: 'child' },
    { question: 'role', answer: ROLES.includes(role) ? role : 'friend', by: 'parent' },
    { question: 'language', answer: LANGUAGE_MODES.includes(language) ? language : 'vi', by: 'parent' },
  ];
}

// Two sets of answers are the same questionnaire when this matches, so the
// match is asked for again only after a choice changed.
export const answersKey = (answers) => answers.map((a) => `${a.question}=${a.answer}`).join('&');

// ---------- Characters ----------

// The characters in the order to offer them: the best match first, then the
// matcher's alternatives, then any other released character.
export function rankCharacters(characters, result) {
  const order = [result?.match?.character?.slug, ...(result?.alternatives ?? []).map((a) => a.slug)].filter(Boolean);
  const rank = (slug) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };
  return [...(characters ?? [])].sort((a, b) => rank(a.slug) - rank(b.slug));
}

// A dictionary entry, or the backend's own text for something released
// after the dictionaries were written (t returns the key when it has none).
export function textOr(t, key, fallback) {
  const s = t(key);
  return s === key ? fallback : s;
}

// Each character introduces itself in both languages (wzWho_<slug>); a new
// character falls back to the backend's sentence, which is English.
export function characterWho(character, t) {
  const raw = String(character?.who ?? '').trim();
  const fallback = raw ? `${raw[0].toUpperCase()}${raw.slice(1)}${/[.!?]$/.test(raw) ? '' : '.'}` : '';
  return textOr(t, `wzWho_${character?.slug}`, fallback);
}

// ---------- Voices ----------

// The character's own voice per language, { vi, en } (a voice id or null
// each). A Buddy carries it as character_voices; GET /characters carries it
// as voices, from the newest pack, which is the one a new Buddy is made with,
// so the wizard reads it there (a sibling's Buddy of the same character may
// still be on an older pack).
export function ownVoicesOf(source) {
  const v = source?.character_voices ?? source?.voices ?? null;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

// A picked voice speaks one language and stays only while it is the
// language Buddy speaks out loud (speechLanguage: a bilingual Buddy speaks
// with the child's first language), as backend-v2 decides.
export function fitVoice(voiceId, voices, mode, child) {
  if (!voiceId) return null;
  const v = (voices ?? []).find((x) => x.id === voiceId);
  return v && v.language === speechLanguage(mode, child) ? voiceId : null;
}

// The picker's list: the voices of the one language Buddy speaks out loud,
// starting with the character's own voice (is_default): the listed voice
// when the character's voice is one of them, otherwise a row of its own (id
// null) so "the character's own voice" can always be chosen. sample is the
// voice whose greeting a row plays, null when there is none to play.
export function voiceGroup(voices, own, mode, child) {
  const language = speechLanguage(mode, child);
  const listed = (voices ?? [])
    .filter((v) => v.language === language)
    .map((v) => ({ ...v, label: v.name, sample: v.id, is_default: Boolean(own?.[language]) && own[language] === v.id }));
  const mine = listed.filter((v) => v.is_default);
  const others = listed.filter((v) => !v.is_default);
  const head = mine.length ? mine : [{ id: null, label: null, language, is_default: true, sample: own?.[language] ?? null }];
  return { language, voices: [...head, ...others] };
}

// The chosen row is the picked voice when it speaks the row's language,
// else the character's own (a voice of another language is never used).
export function voiceChosen(row, voiceId, voices) {
  const picked = (voices ?? []).find((v) => v.id === voiceId);
  if (picked && picked.language === row.language) return row.id === picked.id;
  return Boolean(row.is_default);
}

// What a tap stores: another voice by id, the character's own voice as null
// (null follows the character, even after a character change).
export function pickVoice(row) {
  return row?.is_default ? null : (row?.id ?? null);
}

// The voice a Buddy speaks a language with, by name: what the summaries show.
export function pickedVoice(voices, voiceId) {
  return (voices ?? []).find((v) => v.id === voiceId) ?? null;
}

// Buddy's greeting in each voice, recorded ahead of time; a voice without a
// recording simply has no file and the picker says so.
export function sampleUrl(id) {
  return `/voice-samples/${encodeURIComponent(id)}.wav`;
}

// ---------- The wizard's steps ----------

const BUDDY_PHASES = ['personality', 'role', 'language', 'character', 'voice', 'review'];

// One stepper dot per screen a parent passes through. resume continues a
// child's unfinished setup, so the toy already exists.
export function wizardPhases({ withCode = false, resume = false } = {}) {
  if (resume) return [...BUDDY_PHASES];
  return withCode ? ['code', 'child', ...BUDDY_PHASES] : ['child', ...BUDDY_PHASES];
}

const PHASE_OF = { quiz: 'personality', pick: 'personality' };
export const phaseOf = (step) => PHASE_OF[step] ?? step;

// 1-based position for the stepper; the last screens light every dot.
export function stepNumber(phases, step) {
  if (step === 'done' || step === 'existing') return phases.length;
  return Math.max(1, phases.indexOf(phaseOf(step)) + 1);
}
