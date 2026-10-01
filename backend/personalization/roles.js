import { badRequest } from '../lib/http_error.js';

// How Buddy relates to the child. Codes and the parent-facing label only:
// the brain service owns every word of the prompt, including how each role
// speaks and addresses the child in each language.
export const ROLES = Object.freeze({
  friend: Object.freeze({ label: 'bạn thân' }),
  daddy: Object.freeze({ label: 'bố' }),
  mommy: Object.freeze({ label: 'mẹ' }),
  teacher: Object.freeze({ label: 'cô giáo' }),
});

export const PERSONALITY_RE = /^[EI][SN][TF][JP]$/;
export const SOURCES = Object.freeze(['quiz', 'picked', 'default']);
export const LANGUAGES = Object.freeze(['vi', 'en']);
export const VOICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const NAME_MAX = 24;
export const MOOD_MIN = 0;
export const MOOD_MAX = 100;

// Conversation settings every claim starts from, so a new owner never
// inherits the previous family's. learn is off until a parent opts in.
export const DEFAULT_SETTINGS = Object.freeze({ language: 'vi', voice_id: null, learn: false, mood_pin: null });

// The prototype's default persona: a best friend with an ENFP temperament.
export const DEFAULT_PROFILE = Object.freeze({
  name: 'Buddy',
  role: 'friend',
  personality: 'ENFP',
  personality_source: 'default',
  ...DEFAULT_SETTINGS,
});

// Returns a clean profile (or, with partial, only the fields given) or
// throws one 400 listing every bad field, so a form can mark them all.
// A full profile fills missing settings with the defaults. In a partial one
// a field that is present counts even when null: voice_id null means "back
// to the default voice" and mood_pin null means "unpin".
export function validateProfile(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  const errors = [];
  const has = (key) => Object.hasOwn(src, key) && src[key] !== undefined;

  if (has('name') || !partial) {
    const name = typeof src.name === 'string' ? src.name.trim().replace(/\s+/g, ' ') : '';
    // Control characters would reach the speech engine as noise; anything
    // printable is fine, since families name toys in every script.
    if (!name || name.length > NAME_MAX || /\p{Cc}/u.test(name)) errors.push({ field: 'name', message: `must be 1 to ${NAME_MAX} characters` });
    else out.name = name;
  }
  if (has('role') || !partial) {
    if (!Object.hasOwn(ROLES, src.role)) errors.push({ field: 'role', message: `must be one of ${Object.keys(ROLES).join(', ')}` });
    else out.role = src.role;
  }
  if (has('personality') || !partial) {
    const code = typeof src.personality === 'string' ? src.personality.toUpperCase() : '';
    if (!PERSONALITY_RE.test(code)) errors.push({ field: 'personality', message: 'must be a four-letter type such as ENFP' });
    else out.personality = code;
  }
  if (has('personality_source')) {
    if (!SOURCES.includes(src.personality_source)) errors.push({ field: 'personality_source', message: `must be one of ${SOURCES.join(', ')}` });
    else out.personality_source = src.personality_source;
  } else if (!partial) {
    out.personality_source = 'picked';
  }

  if (has('language')) {
    if (!LANGUAGES.includes(src.language)) errors.push({ field: 'language', message: `must be one of ${LANGUAGES.join(', ')}` });
    else out.language = src.language;
  }
  if (has('voice_id')) {
    if (src.voice_id !== null && !(typeof src.voice_id === 'string' && VOICE_ID_RE.test(src.voice_id))) {
      errors.push({ field: 'voice_id', message: 'must be a voice id or null' });
    } else {
      out.voice_id = src.voice_id;
    }
  }
  if (has('learn')) {
    if (typeof src.learn !== 'boolean') errors.push({ field: 'learn', message: 'must be true or false' });
    else out.learn = src.learn;
  }
  if (has('mood_pin')) {
    const pin = src.mood_pin;
    if (pin !== null && !(Number.isInteger(pin) && pin >= MOOD_MIN && pin <= MOOD_MAX)) {
      errors.push({ field: 'mood_pin', message: `must be an integer ${MOOD_MIN} to ${MOOD_MAX}, or null` });
    } else {
      out.mood_pin = pin;
    }
  }

  if (errors.length) throw badRequest('validation_error', 'invalid profile', { details: errors });
  if (partial && Object.keys(out).length === 0) throw badRequest('validation_error', 'nothing to update', { details: [{ field: 'profile', message: 'give at least one field' }] });
  return partial ? out : { ...DEFAULT_SETTINGS, ...out };
}

// A voice_id that passed the shape check but names no row fails the
// foreign key; the caller turns that into the same 400 shape as above.
export function unknownVoice() {
  return badRequest('validation_error', 'invalid profile', { details: [{ field: 'voice_id', message: 'unknown voice' }] });
}

export function isVoiceFkError(err) {
  return err?.code === '23503' && /voice/.test(err.constraint ?? '');
}
