// One JSON line per event. Logs carry ids only: a child's words, a parent's
// email, and every credential are personal or secret, so the denylist below
// scrubs them even when a caller forgets. It is a guardrail, not permission
// to log such fields in the first place.
import config from '../config.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const REDACT = new Set([
  'email', 'password', 'password_hash', 'secret', 'secret_hex', 'secret_enc',
  'token', 'access_token', 'refresh_token', 'claim_code', 'sig', 'nonce',
  'authorization', 'text', 'transcript', 'audio',
]);

// Mutable on purpose: tests swap the sink and level to capture output.
export const logOptions = {
  level: config.logLevel,
  write: (line) => process.stdout.write(line + '\n'),
};

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

function emit(level) {
  return (event, fields = {}) => {
    const threshold = LEVELS[logOptions.level] ?? LEVELS.info;
    if (LEVELS[level] < threshold) return;
    logOptions.write(JSON.stringify({
      t: new Date().toISOString(),
      level,
      event,
      ...redact(fields),
    }));
  };
}

export const log = {
  debug: emit('debug'),
  info: emit('info'),
  warn: emit('warn'),
  error: emit('error'),
};

export default log;
