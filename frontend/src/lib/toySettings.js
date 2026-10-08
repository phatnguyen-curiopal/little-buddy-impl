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

// Each voice speaks one conversation language, and a toy is only offered the
// voices of its own (the backend already sends them in display order).
export function voicesFor(voices, language) {
  return (voices ?? []).filter((v) => v.language === language);
}

// The voice a toy without a choice speaks with: its language's default, or
// that language's first voice if none is marked, as the backend resolves it.
export function defaultVoice(voices, language) {
  const own = voicesFor(voices, language);
  return own.find((v) => v.is_default) ?? own[0] ?? null;
}

// The voice the picker shows as selected: the toy's own choice while it
// speaks this language, otherwise the default it really speaks with.
export function chosenVoice(voices, language, voiceId) {
  return voicesFor(voices, language).find((v) => v.id === voiceId) ?? defaultVoice(voices, language);
}

// Buddy's greeting in each voice, recorded by brain/scripts/voice_samples.js.
// A voice added without running it has no file; the picker says so.
export function sampleUrl(id) {
  return `/voice-samples/${encodeURIComponent(id)}.wav`;
}
