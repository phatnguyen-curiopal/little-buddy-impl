// ElevenLabs Scribe realtime over a WebSocket: audio streams up while the
// child talks, partial transcripts stream back, and a manual commit at the end
// of the turn returns the final text in a fraction of a second. Any failure
// falls back to batch Scribe on the audio buffered here, so a turn never
// depends on the stream alone.

import WebSocket from 'ws';

import type { Config } from '../config.ts';
import { GatewayError } from '../util/errors.ts';
import { cleanKeyterms } from './elevenlabs.ts';
import type { SttStream, SttStreamOptions } from './types.ts';

const SAMPLE_RATE = 16_000;
// About 100 ms per message: small enough for live partials, large enough to
// keep the message rate (and base64 overhead per message) low.
const CHUNK_BYTES = 3200;
const FINISH_TIMEOUT_MS = 4000;
const ERROR_TYPES = /error|exceeded|throttled|limited|overflow|exhausted|unaccepted|insufficient/;

export function createRealtimeStt(
  cfg: Config['elevenlabs'],
  batch: (pcm: Buffer, opts: SttStreamOptions) => Promise<string>,
  onFallback: (reason: string) => void = () => {},
) {
  return function open(opts: SttStreamOptions): SttStream {
    const params = new URLSearchParams({
      model_id: cfg.sttRealtimeModel,
      audio_format: 'pcm_16000',
      language_code: opts.language,
      commit_strategy: 'manual',
    });
    // An array parameter repeats, like the batch endpoint's keyterms field.
    for (const term of cleanKeyterms(opts.keyterms)) params.append('keyterms', term);
    const url = `${cfg.baseUrl.replace(/^http/, 'ws')}/v1/speech-to-text/realtime?${params}`;

    const all: Buffer[] = [];
    let pending: Buffer[] = [];
    let pendingBytes = 0;
    const committed: string[] = [];
    let partial = '';
    let ready = false;
    let failed: string | null = null;
    let commitSent = false;
    let firstSent = false;
    let closed = false;
    let settle: ((text: string | null) => void) | null = null;

    const ws = new WebSocket(url, { headers: { 'xi-api-key': cfg.apiKey } });
    const text = () => [...committed, partial].join(' ').replace(/\s+/g, ' ').trim();

    const fail = (reason: string) => {
      if (failed) return;
      failed = reason;
      settle?.(null);
    };

    // What Buddy just said rides on the first chunk only (the API refuses it
    // later), so recognition expects an answer to that question.
    const sendChunk = (audio: Buffer, commit: boolean) => {
      const context = !firstSent && opts.previousText ? { previous_text: opts.previousText.slice(0, 300) } : {};
      firstSent = true;
      ws.send(JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: audio.toString('base64'), commit, sample_rate: SAMPLE_RATE, ...context }));
    };

    const flush = () => {
      if (!ready || !pendingBytes) return;
      const audio = Buffer.concat(pending);
      pending = [];
      pendingBytes = 0;
      // Audio buffered while the socket opened goes up in the same small pieces.
      for (let i = 0; i < audio.length; i += CHUNK_BYTES) sendChunk(audio.subarray(i, i + CHUNK_BYTES), false);
    };

    ws.on('message', (data) => {
      if (closed) return;
      let m: { message_type?: string; text?: string; error?: string };
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      switch (m.message_type) {
        case 'session_started':
          ready = true;
          flush();
          if (settle && !commitSent) {
            commitSent = true;
            sendChunk(Buffer.alloc(0), true);
          }
          return;
        case 'partial_transcript':
          partial = m.text ?? '';
          opts.onPartial?.(text());
          return;
        case 'committed_transcript':
          committed.push(m.text ?? '');
          partial = '';
          if (commitSent) settle?.(text());
          return;
        case 'insufficient_audio_activity':
          // The child tapped but said nothing: an empty turn, not a failure.
          if (commitSent) settle?.('');
          else fail(m.message_type);
          return;
        default:
          if (m.message_type && ERROR_TYPES.test(m.message_type)) fail(m.message_type);
      }
    });
    ws.on('error', () => fail('socket error'));
    // Remembered even before finish(), so a session the server dropped early
    // goes straight to the fallback instead of waiting for a commit.
    ws.on('close', () => {
      if (!closed) fail('socket closed');
    });
    opts.signal?.addEventListener('abort', () => stream.close(), { once: true });

    const stream: SttStream = {
      write(pcm) {
        if (closed) return;
        all.push(pcm);
        pending.push(pcm);
        pendingBytes += pcm.length;
        if (pendingBytes >= CHUNK_BYTES) flush();
      },

      async finish() {
        if (opts.signal?.aborted) throw new GatewayError('aborted', 'turn aborted');
        const audio = Buffer.concat(all);
        let result: string | null = null;
        if (!failed && ws.readyState !== WebSocket.CLOSED) {
          result = await new Promise<string | null>((resolve) => {
            const timer = setTimeout(() => resolve(null), FINISH_TIMEOUT_MS);
            settle = (value) => {
              clearTimeout(timer);
              settle = null;
              resolve(value);
            };
            if (ready) {
              flush();
              commitSent = true;
              sendChunk(Buffer.alloc(0), true);
            }
            // Not ready yet: session_started sends the commit when it arrives.
          });
        }
        closed = true;
        ws.close();
        if (result !== null) return result;
        if (opts.signal?.aborted) throw new GatewayError('aborted', 'turn aborted');
        onFallback(failed ?? 'timeout');
        // The last partial is close to final and costs nothing; batch only when there is none.
        const latest = text();
        if (latest) return latest;
        return batch(audio, opts);
      },

      // Batch Scribe on everything this stream was given, for a turn where
      // the stream heard little or nothing.
      async recheck() {
        if (opts.signal?.aborted) throw new GatewayError('aborted', 'turn aborted');
        return batch(Buffer.concat(all), opts);
      },

      close() {
        if (closed) return;
        closed = true;
        settle?.(null);
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.terminate();
      },
    };
    return stream;
  };
}

// The same interface over one batch request at the end, for when streaming is
// switched off: audio is buffered and transcribed on finish().
export function bufferedStt(batch: (pcm: Buffer, opts: SttStreamOptions) => Promise<string>) {
  return function open(opts: SttStreamOptions): SttStream {
    const all: Buffer[] = [];
    let closed = false;
    let heard: Promise<string> | null = null;
    return {
      write(pcm) {
        if (!closed) all.push(pcm);
      },
      async finish() {
        closed = true;
        heard = batch(Buffer.concat(all), opts);
        return heard;
      },
      // finish() already was the batch opinion.
      async recheck() {
        return heard ?? batch(Buffer.concat(all), opts);
      },
      close() {
        closed = true;
      },
    };
  };
}
