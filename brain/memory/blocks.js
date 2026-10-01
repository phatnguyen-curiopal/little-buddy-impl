// Pure renderers for the per-turn context blocks, in the conversation's
// language. Each returns '' when it has nothing to say, so the prompt looks
// exactly as it would without the feature.

import { textFor } from '../persona/text/index.js';
import { toWord } from './enums.js';
import { mentions, trustedNames } from './names.js';

const NAMES_TOP = 20;
const PROFILE_MAX_CHARS = 600;

const isoDay = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export function namesBlock(rows, { trust, lang }) {
  const top = trustedNames(rows, trust).slice(0, NAMES_TOP);
  if (!top.length) return '';
  const t = textFor(lang).blocks;
  return `${t.names}\n${top.map((row) => `${row.display} (${toWord('nameKind', lang, row.kind)})`).join(', ')}`;
}

export function nameFixBlock(fixes, { lang }) {
  if (!fixes?.length) return '';
  const t = textFor(lang).blocks;
  return `${t.nameFix}\n${fixes.map((f) => t.nameFixLine(f.from, f.to)).join('\n')}`;
}

// Notes only for the names this sentence mentions; facts alone are worth
// showing ("Mực (pet: dog, 8 months)" answers "what is Mực?").
export function nameContextBlock(rows, text, { lang }) {
  if (!text) return '';
  const lines = [];
  for (const row of rows) {
    const hasFacts = Boolean(row.species || row.age || row.relation);
    const contexts = Array.isArray(row.contexts) ? row.contexts : [];
    if (!contexts.length && !hasFacts) continue;
    if (!mentions(text, row.display)) continue;
    const facts = [row.species, row.age, row.relation].filter(Boolean).join(', ');
    lines.push(`  ${row.display} (${toWord('nameKind', lang, row.kind)}${facts ? `: ${facts}` : ''}):`);
    for (const c of contexts) lines.push(`    [${String(c.at).slice(0, 10)}] ${c.note}`);
  }
  if (!lines.length) return '';
  return `${textFor(lang).blocks.nameContext}\n${lines.join('\n')}`;
}

export function profileBlock(rows, { lang }) {
  if (!rows?.length) return '';
  const t = textFor(lang).blocks;
  const lines = [];
  for (const category of ['likes', 'dislikes', 'fears', 'family']) {
    const facts = rows.filter((row) => row.category === category).map((row) => row.fact);
    if (facts.length) lines.push(`- ${t.profileLabels[category]}: ${facts.join(', ')}`);
  }
  const kept = [];
  let size = t.profile.length;
  for (const line of lines) {
    if (size + line.length > PROFILE_MAX_CHARS) break;
    kept.push(line);
    size += line.length + 1;
  }
  return kept.length ? [t.profile, ...kept].join('\n') : '';
}

// Points usually end in a full stop already; strip it, then supply one.
export function renderSummary(row) {
  return (row?.points || [])
    .map((p) => String(p.text).trim().replace(/[.\s]+$/, ''))
    .filter(Boolean)
    .join('. ');
}

function summaryLine(row, lang) {
  const label = row.category ? ` [${toWord('summaryCategory', lang, row.category)}]` : '';
  return `- ${isoDay(row.updated_at)}${label}: ${renderSummary(row)}`;
}

// Three claims, three headers: what is being said now, what happened lately
// (by time, so it answers to MEMORY_SUMMARY, not MEMORY_RETRIEVAL), and what
// an older conversation was about (by similarity, minus anything the recent
// part or the verbatim block already shows).
export function summaryBlock({ current = null, recent = [], past = [], exclude = [], retrieval, verbatim, lang }) {
  const t = textFor(lang).blocks;
  const parts = [];
  const now = retrieval ? renderSummary(current) : '';
  if (now) parts.push(`${t.summaryCurrent}\n- ${now}`);
  if (recent.length) parts.push(`${t.summaryRecent}\n${recent.map((row) => summaryLine(row, lang)).join('\n')}`);
  const skip = new Set([...exclude, ...recent.map((row) => row.conversation_id)]);
  const rows = retrieval ? past.filter((row) => !skip.has(row.conversation_id)) : [];
  if (rows.length) {
    const header = verbatim ? t.summaryPastWithVerbatim : t.summaryPastOnly;
    parts.push(`${header}\n${rows.map((row) => summaryLine(row, lang)).join('\n')}`);
  }
  return parts.join('\n\n');
}

// Groups are conversations (newest on top), exchanges inside in speech
// order; a lone exchange renders on one line.
export function memoryBlock(groups, { lang }) {
  if (!groups?.length) return '';
  const t = textFor(lang).blocks;
  const lines = groups.flatMap((group) =>
    group.length === 1
      ? [`- [${isoDay(group[0].created_at)}] ${t.pair(group[0].user_text, group[0].assistant_text)}`]
      : [
          `- [${isoDay(group[0].created_at)}] ${t.conversation}`,
          ...group.map((row) => `    ${t.pair(row.user_text, row.assistant_text)}`),
        ],
  );
  return [t.memoryHeader, ...lines].join('\n');
}
