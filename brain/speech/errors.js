import { abortKind } from '../llm/result.js';

export class SpeechError extends Error {
  constructor(kind, message = kind, { status } = {}) {
    super(message);
    this.name = 'SpeechError';
    this.kind = kind; // 'timeout' | 'upstream' | 'aborted'
    if (status !== undefined) this.status = status;
  }
}

export function toSpeechError(err, signal) {
  if (err instanceof SpeechError) return err;
  const kind = abortKind(signal);
  if (kind) return new SpeechError(kind === 'timeout' ? 'timeout' : 'aborted');
  return new SpeechError('upstream', err?.message || String(err));
}
