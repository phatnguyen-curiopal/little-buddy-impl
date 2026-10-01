// Pure prompt assembly. Section order is the prototype's, most important
// first, and the prompt tells the model that the order is the tie-break:
// AN TOÀN, CÁCH NÓI, VAI + TÍNH CÁCH, ĐỜI SỐNG, KÝ ỨC. The emotion-tag rule
// closes the static part, and the per-turn context blocks come after it so
// the static prefix stays cache-friendly.

import { textFor } from './text/index.js';

export const DEFAULT_BUDDY_NAME = 'Buddy';

export function personaBlock({ lang, role, personality }) {
  const t = textFor(lang);
  const roleText = t.roles[role] || t.roles.friend;
  const vibe = t.vibes[personality] || t.vibes.ENFP;
  const code = t.vibes[personality] ? personality : 'ENFP';
  return [
    t.roleLine(roleText.label),
    roleText.pronouns,
    t.personalityLine(code),
    ...vibe
      .split('\n')
      .map((fact) => fact.trim())
      .filter(Boolean)
      .map((fact) => `- ${fact}`),
  ].join('\n');
}

// `override` is LLM_SYSTEM_PROMPT: it replaces the persona verbatim, but the
// language and tag rules still ride along: without them the toy could answer
// in a language its STT and TTS are not set for, and every reply would wear
// the neutral face.
export function buildSystemPrompt({ lang, buddy, child = null, life = '', override = '' }) {
  const t = textFor(lang);
  const tag = [...t.replyLanguage, '', ...t.emotionTag].join('\n');
  if (override) return `${override}\n\n${tag}`;

  const name = String(buddy?.name || '').trim() || DEFAULT_BUDDY_NAME;
  return [
    ...t.intro({ name, who: t.who(child) }),
    '',
    ...t.safety({ name }),
    '',
    ...t.speech,
    '',
    personaBlock({ lang, role: buddy?.role, personality: buddy?.personality }),
    '',
    ...(life ? [life, ''] : []),
    ...t.memoryRules,
    '',
    tag,
  ].join('\n');
}

// The per-turn blocks ride after the static prompt, weakest claim first:
// names (how to read the transcript), the corrector's conclusion, name
// notes and the child profile (machine summaries), summaries, then the
// verbatim memories everything above defers to.
export function withContext(system, blocks) {
  const context = blocks.filter(Boolean).join('\n\n');
  return context ? `${system}\n\n${context}` : system;
}
