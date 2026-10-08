// The small OpenAI JSON calls around memory, and the parsers that decide
// what of their answers may touch the store. The model is trusted to decide
// WHAT changed and never trusted about the shape of the change: ids must
// name rows that exist, words must map to known codes, text is capped.

import { textFor } from '../persona/text/index.js';
import { toCode, toWord, wordsFor } from './enums.js';
import { mentions } from './names.js';

const NAME_RE = /^[\p{L}][\p{L} .'-]{0,23}$/u;
const SUMMARY_POINT_CHARS = 120;
const NULL_FACT_RE = /^(null|không rõ|không biết|n\/a|unknown|not sure|none)$/i;

// One extracted attribute, empty-as-null so "unknown" never overwrites a
// fact learned earlier.
export function factValue(value) {
  const text = String(value ?? '').trim().slice(0, 40);
  return text && !NULL_FACT_RE.test(text) ? text : null;
}

// Only names the CHILD said may be learned: outright, or garbled in the
// transcript with `heard` naming the garble (which must really be there).
// Case-insensitive only; diacritics are what tell Vietnamese names apart.
export function parseNames(parsed, userText) {
  if (!Array.isArray(parsed?.names)) return { names: [], dropped: 0 };
  const heardIn = (heard, name) => {
    if (mentions(userText, name)) return true;
    const fragment = String(heard || '').trim().toLowerCase();
    return Boolean(fragment) && userText.toLowerCase().includes(fragment);
  };
  let dropped = 0;
  const names = parsed.names
    .map((n) => ({
      display: String(n?.name || '').trim(),
      heard: String(n?.heard || '').trim(),
      kind: toCode('nameKind', n?.kind) || 'other',
      note: String(n?.note || '').trim().slice(0, 160),
      age: factValue(n?.age),
      relation: factValue(n?.relation),
      species: factValue(n?.species),
    }))
    .filter((n) => NAME_RE.test(n.display))
    .filter((n) => {
      if (heardIn(n.heard, n.display)) return true;
      dropped += 1;
      return false;
    });
  return { names, dropped };
}

// Budget is spent in op order, so a model that drops before adding reuses
// the slot within one turn.
export function parseSummary(parsed, currentPoints, maxPoints) {
  const raw = parsed?.summary;
  if (!raw || typeof raw !== 'object') return null;
  const ids = new Set(currentPoints.map((p) => p.id));
  const point = (value) => String(value ?? '').trim().slice(0, SUMMARY_POINT_CHARS);
  let room = maxPoints - currentPoints.length;
  const ops = [];
  let overflow = 0;
  for (const op of Array.isArray(raw.ops) ? raw.ops : []) {
    if (op?.op === 'add') {
      const text = point(op.point);
      if (!text) continue;
      if (room <= 0) {
        overflow += 1;
        continue;
      }
      room -= 1;
      ops.push({ op: 'add', text });
    } else if (op?.op === 'update') {
      const text = point(op.point);
      if (text && ids.has(Number(op.id))) ops.push({ op: 'update', id: Number(op.id), text });
    } else if (op?.op === 'drop') {
      if (ids.has(Number(op.id))) {
        room += 1;
        ops.push({ op: 'drop', id: Number(op.id) });
      }
    }
  }
  // Vietnamese prompts ask for "loai", English ones for "category".
  const category = toCode('summaryCategory', raw.loai ?? raw.category);
  if (!ops.length && !category) return null;
  return { ops, category, overflow };
}

// Pure, so untouched points come out byte-identical.
export function applySummaryOps(points, nextId, ops) {
  let out = [...points];
  let id = nextId;
  for (const op of ops) {
    if (op.op === 'add') {
      out.push({ id, text: op.text });
      id += 1;
    } else if (op.op === 'update') {
      out = out.map((p) => (p.id === op.id ? { id: p.id, text: op.text } : p));
    } else if (op.op === 'drop') {
      out = out.filter((p) => p.id !== op.id);
    }
  }
  return { points: out, nextId: id };
}

export function parseProfileOps(parsed, currentRows) {
  if (!Array.isArray(parsed?.ops)) return [];
  const ids = new Set(currentRows.map((row) => Number(row.id)));
  return parsed.ops
    .map((op) => ({
      op: String(op?.op || ''),
      id: Number(op?.id),
      category: toCode('factCategory', op?.category),
      fact: String(op?.fact || '').trim().slice(0, 60),
    }))
    .filter((op) =>
      op.op === 'add'
        ? op.category && op.fact
        : ['bump', 'update', 'drop'].includes(op.op) && ids.has(op.id) && (op.op !== 'update' || op.fact),
    );
}

// Names + summary in one call: both read the same two lines, both run off
// the hot path. The halves are parsed independently, so a malformed one
// never costs the other.
export async function extractExchange(helper, { model, lang, userText, assistantText, currentPoints, config }) {
  const t = textFor(lang).extract;
  const withSummary = config.memory.summary;
  const sheet = currentPoints.length ? currentPoints.map((p) => `${p.id} | ${p.text}`).join('\n') : t.emptySummary;
  const system = withSummary
    ? t.names + t.summary({ maxPoints: config.memory.summaryPoints, categories: wordsFor('summaryCategory', lang) })
    : t.names;
  const parsed = await helper.json({
    model,
    system,
    user: t.exchange(userText, assistantText) + (withSummary ? t.summarySheet(sheet) : ''),
    purpose: withSummary ? 'memory_names_summary' : 'memory_names',
  });
  return {
    names: config.memory.names ? parseNames(parsed, userText) : { names: [], dropped: 0 },
    summary: withSummary ? parseSummary(parsed, currentPoints, config.memory.summaryPoints) : null,
  };
}

export async function extractProfile(helper, { model, lang, userText, assistantText, currentRows }) {
  const t = textFor(lang).extract;
  const sheet = currentRows.length
    ? currentRows.map((row) => t.profileRow(row.id, toWord('factCategory', lang, row.category), row.fact, row.count)).join('\n')
    : t.emptyProfile;
  const parsed = await helper.json({ model, system: t.profile, user: t.profileUser(sheet, userText, assistantText), purpose: 'memory_profile' });
  return parseProfileOps(parsed, currentRows);
}

// Only names the table already trusts may be introduced, and `from` must be
// in the raw transcript because the pair is quoted to the reply model as
// fact. A model that rewrites the sentence loses to the raw transcript.
export function parseFix(parsed, text, known) {
  const fixedText = String(parsed?.text || '').trim();
  const named = new Set(known.map((n) => n.toLowerCase()));
  const fixed = (Array.isArray(parsed?.fixed) ? parsed.fixed : [])
    .map((n) => ({ from: String(n?.from || '').trim(), to: String(n?.to || '').trim() }))
    .filter(
      (n) =>
        n.from &&
        named.has(n.to.toLowerCase()) &&
        fixedText.toLowerCase().includes(n.to.toLowerCase()) &&
        text.toLowerCase().includes(n.from.toLowerCase()),
    );
  if (!fixedText || !fixed.length) return { text, fixed: [] };
  return { text: fixedText, fixed };
}

// Never throws: a failed correction just means the raw text is used. Runs
// on the hot path beside retrieval, so it follows the reply's service tier.
export async function fixNames(helper, { model, lang, text, known, serviceTier, signal }) {
  if (!text || !known.length) return { text, fixed: [] };
  // Already says a known name properly: nothing to improve, and the round
  // trip costs a second or more.
  if (known.some((n) => mentions(text, n))) return { text, fixed: [] };
  const t = textFor(lang).extract;
  try {
    const parsed = await helper.json({ model, system: t.fix, user: t.fixUser(known, text), serviceTier, signal, purpose: 'name_fix' });
    return parseFix(parsed, text, known);
  } catch {
    return { text, fixed: [] };
  }
}
