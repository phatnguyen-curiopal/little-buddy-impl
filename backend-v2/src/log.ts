// JSON lines with ids only. The redaction list is a guardrail, not
// permission: callers pass ids and counts, never a child's words.

export type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACT = new Set([
  'text', 'transcript', 'child_text', 'reply_text', 'statement', 'content', 'excerpt',
  'email', 'token', 'secret', 'password', 'signature', 'code', 'authorization',
]);

export interface Logger {
  debug(msg: string, fields?: Fields): void;
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

function scrub(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT.has(k.toLowerCase())) out[k] = '[redacted]';
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

export function createLogger(level: Level = 'info', base: Fields = {}, sink: (line: string) => void = (l) => process.stdout.write(`${l}\n`)): Logger {
  const min = ORDER[level];
  const emit = (lvl: Level, msg: string, fields?: Fields) => {
    if (ORDER[lvl] < min) return;
    sink(JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...scrub({ ...base, ...fields }) }));
  };
  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (fields) => createLogger(level, { ...base, ...fields }, sink),
  };
}

export const silentLogger: Logger = createLogger('error', {}, () => {});
