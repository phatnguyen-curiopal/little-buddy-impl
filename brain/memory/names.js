// Pure helpers over one subject's familiar-names rows.

// Does this text actually SAY that name? Substring matching fails on short
// names ("hôm nay" contains "na"), and \b is no use because JS word
// boundaries treat "ô" as a non-word character, so the lookarounds spell out
// letter-or-mark.
export function mentions(text, name) {
  if (!text || !name) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{M}])${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{M}])`,
    'iu',
  ).test(text);
}

// A name heard once is a hypothesis: STT mishears "Bôm" as "Pôm" and the
// extractor stores it. Only names heard in MEMORY_NAME_TRUST separate
// exchanges may act on other text (keyterms, correction, the names block),
// because a trusted mishearing teaches every one of them the mistake.
export function trustedNames(rows, trust) {
  return rows.filter((row) => (row.count || 0) >= trust);
}

// Newest first, capped; a second note from the same conversation replaces
// the first, since the latest note of a sitting is the fullest.
export function mergeContexts(existing, { note, conversationId, at, max }) {
  if (!note || !conversationId) return Array.isArray(existing) ? existing : [];
  const rest = (Array.isArray(existing) ? existing : []).filter((c) => c.conv !== conversationId);
  return [{ conv: conversationId, at, note }, ...rest].slice(0, max);
}
