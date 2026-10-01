// The turn metadata the backend sends (brain/docs/contract.md). Returns the
// clean meta or a list of {field, message}; the brain never guesses a value
// it was not given.

import { LANGUAGES } from '../persona/text/index.js';
import { VOICE_ID_RE } from '../speech/tts.js';
import { TEXT_MAX_CHARS } from '../turn/run_turn.js';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID_RE = new RegExp(`^${UUID}$`);
export const SUBJECT_RE = new RegExp(`^(child:${UUID}|device:${UUID}:${UUID})$`);
const ROLES = ['friend', 'daddy', 'mommy', 'teacher'];
const PERSONALITY_RE = /^[EI][SN][TF][JP]$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateMeta(input, { requireText = false } = {}) {
  const errors = [];
  const bad = (field, message) => errors.push({ field, message });
  if (!isObject(input)) return { errors: [{ field: 'meta', message: 'must be an object' }] };
  const src = input;
  const out = {};

  if (typeof src.turn_id !== 'string' || !UUID_RE.test(src.turn_id)) bad('turn_id', 'must be a uuid');
  else out.turn_id = src.turn_id;
  if (typeof src.conversation_id !== 'string' || !src.conversation_id.trim() || src.conversation_id.length > 128) {
    bad('conversation_id', 'must be a string of 1 to 128 characters');
  } else out.conversation_id = src.conversation_id;
  if (typeof src.device_id !== 'string' || !UUID_RE.test(src.device_id)) bad('device_id', 'must be a uuid');
  else out.device_id = src.device_id.toLowerCase();
  if (typeof src.subject !== 'string' || !SUBJECT_RE.test(src.subject)) {
    bad('subject', 'must be child:<uuid> or device:<uuid>:<uuid>');
  } else out.subject = src.subject.toLowerCase();

  if (src.child === null || src.child === undefined) {
    out.child = null;
  } else if (!isObject(src.child)) {
    bad('child', 'must be an object or null');
  } else {
    const name = src.child.name;
    const year = src.child.birth_year;
    if (name !== null && name !== undefined && (typeof name !== 'string' || name.length > 60)) bad('child.name', 'must be a string of at most 60 characters or null');
    if (year !== null && year !== undefined && !Number.isInteger(year)) bad('child.birth_year', 'must be an integer or null');
    // The backend stores any year in 2000..2100, so a parent's typo (a year
    // still in the future) must not fail every turn of the toy. An
    // implausible year is dropped and the prompt speaks of the child without one.
    const thisYear = new Date().getUTCFullYear();
    const plausible = Number.isInteger(year) && year >= 1990 && year <= thisYear;
    out.child = { name: typeof name === 'string' ? name.trim() : null, birth_year: plausible ? year : null };
  }

  if (!isObject(src.buddy)) {
    bad('buddy', 'must be an object');
  } else {
    const { name, role, personality } = src.buddy;
    if (typeof name !== 'string' || !name.trim() || name.length > 24) bad('buddy.name', 'must be 1 to 24 characters');
    if (!ROLES.includes(role)) bad('buddy.role', `must be one of ${ROLES.join(', ')}`);
    if (typeof personality !== 'string' || !PERSONALITY_RE.test(personality)) bad('buddy.personality', 'must be a four-letter type such as ENFP');
    out.buddy = { name: typeof name === 'string' ? name.trim() : '', role, personality };
  }

  if (!isObject(src.settings)) {
    bad('settings', 'must be an object');
  } else {
    const { language, voice_id: voiceId, learn, mood_pin: moodPin } = src.settings;
    if (!LANGUAGES.includes(language)) bad('settings.language', `must be one of ${LANGUAGES.join(', ')}`);
    if (voiceId !== null && voiceId !== undefined && (typeof voiceId !== 'string' || !VOICE_ID_RE.test(voiceId))) {
      bad('settings.voice_id', 'must be a voice id or null');
    }
    if (typeof learn !== 'boolean') bad('settings.learn', 'must be a boolean');
    if (moodPin !== null && moodPin !== undefined && (!Number.isInteger(moodPin) || moodPin < 0 || moodPin > 100)) {
      bad('settings.mood_pin', 'must be an integer 0 to 100 or null');
    }
    out.settings = {
      language,
      voice_id: voiceId ?? null,
      learn: learn === true,
      mood_pin: Number.isInteger(moodPin) ? moodPin : null,
    };
  }

  if (requireText) {
    const text = typeof src.text === 'string' ? src.text.trim() : '';
    if (!text || text.length > TEXT_MAX_CHARS) bad('text', `must be 1 to ${TEXT_MAX_CHARS} characters`);
    else out.text = text;
  }

  return errors.length ? { errors } : { meta: out };
}

// Headers are latin1, and child and Buddy names are Vietnamese, so the meta
// travels as base64url of UTF-8 JSON.
export function decodeMetaHeader(value) {
  if (typeof value !== 'string' || !value || value.length > 16384) return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
