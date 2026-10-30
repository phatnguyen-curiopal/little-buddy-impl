// ElevenLabs over plain fetch: batch Scribe for speech-to-text and streaming
// text-to-speech as raw 16 kHz PCM. Field choices follow what the prototype
// verified against the live API.

import type { Config } from '../config.ts';
import type { Lang } from '../domain/types.ts';
import { wrapWav } from '../audio/wav.ts';
import { GatewayError } from '../util/errors.ts';

type Fetch = typeof fetch;

export const VOICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Terms the API would reject fail the whole request, so they are dropped here.
export function cleanKeyterms(names: string[], max = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const t = n.trim();
    if (!t || t.length > 50 || /[<>{}[\]\\]/.test(t) || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

function toGatewayError(err: unknown, signal?: AbortSignal): GatewayError {
  if (err instanceof GatewayError) return err;
  if (signal?.aborted || (err as Error)?.name === 'AbortError') return new GatewayError('aborted', 'request aborted');
  return new GatewayError('upstream', `elevenlabs request failed: ${(err as Error)?.message ?? 'unknown'}`);
}

export function createElevenLabs(cfg: Config['elevenlabs'], fetchImpl: Fetch = fetch) {
  async function transcribe(input: { pcm: Buffer; language: Lang; keyterms: string[]; signal?: AbortSignal }): Promise<string> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wrapWav(input.pcm))], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model_id', cfg.sttModel);
    // Pinned per child: on a short utterance the model's own language guess is unreliable.
    form.append('language_code', input.language);
    // The field repeats once per term; a JSON array would be read as a single term.
    for (const term of cleanKeyterms(input.keyterms)) form.append('keyterms', term);
    // Omitting it turns tagging on, and a stray click once became a whole turn.
    form.append('tag_audio_events', 'false');
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.baseUrl}/v1/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': cfg.apiKey },
        body: form,
        signal: input.signal,
      });
    } catch (err) {
      throw toGatewayError(err, input.signal);
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => null);
      throw new GatewayError('upstream', `elevenlabs stt http ${res.status}`, res.status);
    }
    const body = (await res.json().catch(() => ({}))) as { text?: string };
    return String(body.text ?? '').trim();
  }

  async function* speakStream(input: { text: string; voiceId: string; language: Lang; model: string; signal?: AbortSignal }): AsyncGenerator<Buffer> {
    if (!VOICE_ID_RE.test(input.voiceId)) throw new GatewayError('invalid', 'invalid voice id');
    const params = new URLSearchParams({ output_format: 'pcm_16000' });
    let res: Response;
    try {
      res = await fetchImpl(`${cfg.baseUrl}/v1/text-to-speech/${input.voiceId}/stream?${params}`, {
        method: 'POST',
        headers: { 'xi-api-key': cfg.apiKey, 'content-type': 'application/json' },
        // Without language_code, short Vietnamese comes out with English pronunciation.
        body: JSON.stringify({ text: input.text, model_id: input.model, language_code: input.language }),
        signal: input.signal,
      });
    } catch (err) {
      throw toGatewayError(err, input.signal);
    }
    if (!res.ok || !res.body) {
      await res.arrayBuffer().catch(() => null);
      throw new GatewayError('upstream', `elevenlabs tts http ${res.status}`, res.status);
    }
    // PCM16 samples are two bytes; a chunk boundary can split one, so an odd
    // trailing byte waits for the next chunk instead of shifting every sample.
    let carry: Buffer | null = null;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        let buf = Buffer.from(chunk);
        if (carry) {
          buf = Buffer.concat([carry, buf]);
          carry = null;
        }
        if (buf.length % 2) {
          carry = buf.subarray(buf.length - 1);
          buf = buf.subarray(0, buf.length - 1);
        }
        if (buf.length) yield buf;
      }
    } catch (err) {
      throw toGatewayError(err, input.signal);
    }
  }

  return { transcribe, speakStream };
}
