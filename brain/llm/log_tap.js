// LLM_LOG_FILE: every prompt the models are sent and every answer they give,
// in one file, so "what did the model actually see" has a single answer. Both
// doors to a model write here (createLlm's generate for the reply, helper.json
// for the memory extractors and the name fix), so no caller can forget to.
//
// It holds a child's words verbatim: config refuses it in production and
// .gitignore covers it. Writes are synchronous and swallowed, so a broken
// debug path never costs a turn and entries stay in call order.

import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const context = new AsyncLocalStorage();

// Tags every model call made inside fn with the turn it serves. The learner's
// queued work is chained from inside the turn, so it carries the tag too,
// without threading ids through every memory function.
export function withLlmContext(ctx, fn) {
  return context.run(ctx, fn);
}

const RULE = '='.repeat(72);

function header(e) {
  const parts = [`${e.at} llm ${e.purpose}`];
  if (e.turn_id) parts.push(`turn=${e.turn_id}`);
  if (e.subject) parts.push(`subject=${e.subject}`);
  parts.push(`${e.provider}/${e.model}`, `${e.ms} ms`);
  if (e.finish) parts.push(`finish=${e.finish}`);
  if (e.usage) parts.push(`tokens in=${e.usage.input ?? '?'} out=${e.usage.output ?? '?'} cached=${e.usage.cached ?? 0}`);
  if (e.flagged) parts.push('moderation=flagged');
  return parts.join(' ');
}

// One readable block per call: the prompts are long multi-line text, and a
// person reads this file, so JSON lines would only hide them.
export function formatEntry(e) {
  const lines = [header(e), '--- system ---', e.system ?? '', `--- messages (${e.messages?.length ?? 0}) ---`];
  for (const m of e.messages ?? []) lines.push(`[${m.role}] ${m.content}`);
  if (e.error) {
    lines.push('--- error ---', `${e.error.name || 'Error'}${e.error.kind ? ` ${e.error.kind}` : ''}: ${e.error.message || ''}`);
  } else {
    lines.push('--- answer ---', e.answer ?? '');
  }
  lines.push(RULE, '');
  return lines.join('\n');
}

export function createLlmLog(path, { now = () => new Date() } = {}) {
  if (!path) return null;
  let ready = false;
  return {
    record(entry) {
      try {
        if (!ready) {
          mkdirSync(dirname(path), { recursive: true });
          ready = true;
        }
        appendFileSync(path, formatEntry({ at: now().toISOString(), ...context.getStore(), ...entry }));
      } catch {
        // Debug aid only.
      }
    },
  };
}
