// Short-term conversation history, in process only, as the prototype kept
// it in RAM. Keyed by subject and conversation id together, so a
// conversation id can never surface under another subject. With learning
// off, this is the only place a child's words exist, and it forgets them
// after the TTL or a restart.

const DEFAULT_TTL_MS = 30 * 60_000;

export function createHistory({ maxTurns = 12, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
  const entries = new Map();
  const keyOf = (subject, conversationId) => `${subject}\n${conversationId}`;

  function sweep() {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of entries) if (entry.touched < cutoff) entries.delete(key);
  }

  function get(subject, conversationId) {
    sweep();
    const entry = entries.get(keyOf(subject, conversationId));
    return entry ? entry.messages.map((m) => ({ ...m })) : [];
  }

  function append(subject, conversationId, userText, assistantText) {
    const key = keyOf(subject, conversationId);
    const entry = entries.get(key) || { subject, messages: [], touched: 0 };
    entry.messages.push({ role: 'user', content: userText }, { role: 'assistant', content: assistantText });
    const max = maxTurns * 2;
    if (entry.messages.length > max) entry.messages = max > 0 ? entry.messages.slice(-max) : [];
    // A window that opens on an assistant turn is not a valid conversation.
    while (entry.messages.length && entry.messages[0].role !== 'user') entry.messages.shift();
    entry.touched = now();
    entries.set(key, entry);
  }

  function wipeSubject(subject) {
    for (const [key, entry] of entries) if (entry.subject === subject) entries.delete(key);
  }

  // Swept on access too; this only bounds memory for conversations nobody
  // touches again.
  const timer = setInterval(sweep, Math.min(ttlMs, 60_000));
  timer.unref();

  return { get, append, wipeSubject, size: () => entries.size, close: () => clearInterval(timer) };
}
