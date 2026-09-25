import { badRequest } from '../lib/http_error.js';

// How Buddy addresses the child. label and pronouns are the prototype's
// builtin personas (LittleBuddy/app-b/llm/config.js), kept word for word
// because the prompt will read them; the prototype found the friend role
// drifting from "cậu" to "con" in serious turns when pronouns were left out.
export const ROLES = Object.freeze({
  friend: Object.freeze({ label: 'bạn thân', pronouns: 'Xưng "tớ", gọi bạn nhỏ là "cậu". Tiếng Anh: vui nhộn, từ dễ, như bạn cùng tuổi.' }),
  daddy: Object.freeze({ label: 'bố', pronouns: 'Xưng "bố", gọi bạn nhỏ là "con". Tiếng Anh: câu đơn giản, chậm rãi, kiểu ông bố kiên nhẫn.' }),
  mommy: Object.freeze({ label: 'mẹ', pronouns: 'Xưng "mẹ", gọi bạn nhỏ là "con". Tiếng Anh: nhẹ nhàng, vỗ về, từ ngữ ấm áp.' }),
  teacher: Object.freeze({ label: 'cô giáo', pronouns: 'Xưng "cô", gọi bạn nhỏ là "con". Tiếng Anh: rõ ràng, đúng mực, kiểu lớp học vui.' }),
});

export const PERSONALITY_RE = /^[EI][SN][TF][JP]$/;
export const SOURCES = Object.freeze(['quiz', 'picked', 'default']);
export const NAME_MAX = 24;

// The prototype's default persona: a best friend with an ENFP temperament.
export const DEFAULT_PROFILE = Object.freeze({ name: 'Buddy', role: 'friend', personality: 'ENFP', personality_source: 'default' });

// Returns a clean profile (or, with partial, only the fields given) or
// throws one 400 listing every bad field, so a form can mark them all.
export function validateProfile(input, { partial = false } = {}) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  const errors = [];

  if (src.name !== undefined || !partial) {
    const name = typeof src.name === 'string' ? src.name.trim().replace(/\s+/g, ' ') : '';
    // Control characters would reach the speech engine as noise; anything
    // printable is fine, since families name toys in every script.
    if (!name || name.length > NAME_MAX || /\p{Cc}/u.test(name)) errors.push({ field: 'name', message: `must be 1 to ${NAME_MAX} characters` });
    else out.name = name;
  }
  if (src.role !== undefined || !partial) {
    if (!Object.hasOwn(ROLES, src.role)) errors.push({ field: 'role', message: `must be one of ${Object.keys(ROLES).join(', ')}` });
    else out.role = src.role;
  }
  if (src.personality !== undefined || !partial) {
    const code = typeof src.personality === 'string' ? src.personality.toUpperCase() : '';
    if (!PERSONALITY_RE.test(code)) errors.push({ field: 'personality', message: 'must be a four-letter type such as ENFP' });
    else out.personality = code;
  }
  if (src.personality_source !== undefined) {
    if (!SOURCES.includes(src.personality_source)) errors.push({ field: 'personality_source', message: `must be one of ${SOURCES.join(', ')}` });
    else out.personality_source = src.personality_source;
  } else if (!partial) {
    out.personality_source = 'picked';
  }

  if (errors.length) throw badRequest('validation_error', 'invalid profile', { details: errors });
  if (partial && Object.keys(out).length === 0) throw badRequest('validation_error', 'nothing to update', { details: [{ field: 'profile', message: 'give at least one field' }] });
  return out;
}
