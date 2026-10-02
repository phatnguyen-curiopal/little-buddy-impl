// Per-toy conversation settings stored with Buddy's profile. Pure, so the
// defaults and the mood rules are tested with node --test.
//
// language  vi | en, what Buddy speaks and listens in (independent of the
//           website's own language)
// voice_id  null means the default voice, so a later change of the default
//           reaches every toy that never picked one
// learn     off by default: nothing the child says is kept unless a parent
//           turns this on
// mood_pin  null means Buddy's mood follows its own day; 0..100 pins it
//           until the parent clears it

export const LANGUAGES = ['vi', 'en'];
export const SETTINGS_DEFAULTS = Object.freeze({ language: 'vi', voice_id: null, learn: false, mood_pin: null });
export const MOOD_START = 70;

export function settingsOf(profile) {
  const p = profile ?? {};
  return {
    language: LANGUAGES.includes(p.language) ? p.language : SETTINGS_DEFAULTS.language,
    voice_id: typeof p.voice_id === 'string' && p.voice_id ? p.voice_id : null,
    learn: p.learn === true,
    mood_pin: Number.isInteger(p.mood_pin) && p.mood_pin >= 0 && p.mood_pin <= 100 ? p.mood_pin : null,
  };
}

export function clampMood(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MOOD_START;
  return Math.max(0, Math.min(100, n));
}

// The option the voice picker shows for "no choice": the default voice's
// label when the backend marks one.
export function defaultVoice(voices) {
  return (voices ?? []).find((v) => v.is_default) ?? null;
}
