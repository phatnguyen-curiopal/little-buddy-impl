// One JSON line per event, ids only. The brain handles more of a child's
// words than any other service, so the denylist below scrubs every field
// that could carry them even when a caller forgets. It is a guardrail, not
// permission to log such fields.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const REDACT = new Set([
  'text', 'transcript', 'heard', 'reply', 'say', 'spoken', 'prompt', 'system',
  'messages', 'content', 'audio', 'audio_b64', 'story', 'fact', 'note', 'name',
  'display', 'points', 'authorization', 'token', 'secret', 'key', 'api_key',
]);

export function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = REDACT.has(key) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

export function createLog({ level = 'info', write = (line) => process.stdout.write(line + '\n') } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl) => (event, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    write(JSON.stringify({ t: new Date().toISOString(), level: lvl, event, ...redact(fields) }));
  };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}

// Error messages from upstream SDKs can quote request content back; only the
// class name and status travel into the log.
export function errorFields(err) {
  if (!err) return {};
  return {
    err_name: err.name || 'Error',
    err_kind: err.kind,
    err_status: err.status ?? err.statusCode,
    err_code: typeof err.code === 'string' ? err.code : undefined,
  };
}
