// The one result shape every provider resolves to, and the one error type
// the turn has to reason about.
//
// LlmResult = { text, provider, model, finish: 'stop'|'length'|'refusal',
//               usage: { input, output, cached }, latency_ms,
//               moderation: null | { flagged, top } }

export const LLM_ERROR_KINDS = ['refusal', 'empty', 'timeout', 'upstream', 'aborted'];

export class LlmError extends Error {
  constructor(kind, message = kind, { status } = {}) {
    super(message);
    this.name = 'LlmError';
    this.kind = LLM_ERROR_KINDS.includes(kind) ? kind : 'upstream';
    if (status !== undefined) this.status = status;
  }
}

// Why a turn's signal fired. The turn aborts with one of these as the
// reason, so any layer can tell "the backend hung up" (nobody to answer)
// from "the deadline passed" (answer with a timeout).
export class TurnAbort extends Error {
  constructor(kind) {
    super(`turn ${kind}`);
    this.name = 'TurnAbort';
    this.kind = kind; // 'closed' | 'timeout'
  }
}

export function abortKind(signal) {
  if (!signal?.aborted) return null;
  return signal.reason instanceof TurnAbort ? signal.reason.kind : 'closed';
}

export function makeResult({ text, provider, model, finish, usage, started, moderation = null }) {
  return {
    text: String(text ?? ''),
    provider,
    model,
    finish,
    usage: {
      input: Number(usage?.input) || 0,
      output: Number(usage?.output) || 0,
      cached: Number(usage?.cached) || 0,
    },
    latency_ms: Date.now() - started,
    moderation,
  };
}

// Transport failures become one error kind per cause. An abort we caused
// ourselves reports as timeout or aborted depending on why we pulled it.
export function toLlmError(err, signal) {
  if (err instanceof LlmError) return err;
  const kind = abortKind(signal);
  if (kind) return new LlmError(kind === 'timeout' ? 'timeout' : 'aborted');
  if (err?.name === 'APIConnectionTimeoutError') return new LlmError('timeout', 'upstream timed out');
  return new LlmError('upstream', err?.message || String(err), { status: err?.status });
}
