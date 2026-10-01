// The ask gate: the per-turn decision of whether the toy gets an answer.
// Pure, so it can be tested without a database; the caller supplies the
// fresh device row, the family balance and the number of turns in flight.
//
// Two rules from the spec shape what the toy hears. The child path never
// errors: a refusal is an emotion and a kind sentence, never a code. And a
// child can never tell "out of credits" from "time for a break": every
// break-like refusal is the same payload, and no money word exists here.

export const REASONS = Object.freeze(['not_claimed', 'disabled', 'no_credits', 'daily_limit', 'quiet_hours']);

// The toy speaks its conversation language (the profile's), so every
// canned line exists once per language. An unknown language falls back to
// Vietnamese, the product's default.
export const LANGUAGES = Object.freeze(['vi', 'en']);
export const DEFAULT_LANGUAGE = 'vi';

function denials({ notClaimed, pause }) {
  const BREAK = Object.freeze({ emotion: 'sleepy', say: pause });
  return Object.freeze({
    not_claimed: Object.freeze({ emotion: 'confused', say: notClaimed }),
    disabled: BREAK,
    no_credits: BREAK,
    daily_limit: BREAK,
    quiet_hours: BREAK,
  });
}

export const DENIALS = Object.freeze({
  vi: denials({
    notClaimed: 'Mình cần một người lớn cài đặt giúp trước đã nhé.',
    pause: 'Mình nghỉ một chút nhé. Lát nữa mình chơi tiếp!',
  }),
  en: denials({
    notClaimed: "Let's ask a grown-up to set me up first.",
    pause: "Time for a little break. Let's play again later!",
  }),
});

// Spoken when the brain fails mid-turn. Not a denial: the turn was
// admitted, and it ends as failed without charging.
export const FAILED_ANSWERS = Object.freeze({
  vi: Object.freeze({ emotion: 'confused', say: 'Ơ, mình nghĩ mãi chưa ra. Lát nữa mình thử lại nhé!' }),
  en: Object.freeze({ emotion: 'confused', say: "Hmm, let's try that again in a little while." }),
});

export function languageOf(value) {
  return LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

const deny = (reason) => ({ ok: false, reason });

export function checkTurn({ device, balance = 0, inflight = 0 }) {
  if (!device || device.status === 'provisioned' || !device.family_id) return deny('not_claimed');
  if (device.status !== 'active') return deny('disabled');
  // Accepted turns that have not closed yet each hold one credit, so the
  // family's last credit cannot be promised to two toys at once.
  if (balance - inflight < 1) return deny('no_credits');
  // daily limit: reserved for the per-family settings step
  // quiet hours: reserved for the per-family settings step
  return { ok: true };
}

export function denialFor(reason, language = DEFAULT_LANGUAGE) {
  return DENIALS[languageOf(language)][reason];
}

export function failedAnswer(language = DEFAULT_LANGUAGE) {
  return FAILED_ANSWERS[languageOf(language)];
}
