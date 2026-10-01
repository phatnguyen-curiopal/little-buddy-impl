import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// LLM_LOG_FILE: the one place that answers "what did the model actually
// see". It holds a child's words verbatim, which is why config refuses it in
// production and .gitignore covers it. Writes are synchronous and swallowed:
// a broken debug path must never cost a turn.
export function createDebugFile(path) {
  if (!path) return null;
  let ready = false;
  return {
    write(text) {
      try {
        if (!ready) {
          mkdirSync(dirname(path), { recursive: true });
          ready = true;
        }
        appendFileSync(path, `${new Date().toISOString()} ${text}\n`);
      } catch {
        // Debug aid only.
      }
    },
  };
}
