// ElevenLabs speech-to-text, batch only: one WAV per turn to
// /v1/speech-to-text. Every field below was probed against the live API in
// the prototype and defaulted on what was observed.

import { SpeechError, toSpeechError } from './errors.js';
import { wrapWav } from './wav.js';

// The batch endpoint's own ceilings. Past 100 keyterms every request bills a
// minimum of 20 seconds, which is why STT_KEYTERMS_MAX exists at all.
const KEYTERM_LIMITS = { max: 1000, maxChars: 50 };

// Names the API would reject ("Some keyword contains invalid characters")
// fail the whole request, so they are dropped here rather than costing the
// transcript.
export function keytermsFor(names, { enabled, max }) {
  if (!enabled) return [];
  return names
    .filter((n) => n && n.length <= KEYTERM_LIMITS.maxChars && !/[<>{}[\]\\]/.test(n))
    .slice(0, Math.min(max, KEYTERM_LIMITS.max));
}

export function createStt(config) {
  const speech = config.speech;
  const base = config.seams.elevenlabsBaseUrl;

  async function transcribe({ pcm, languageCode, keyterms = [], signal }) {
    const form = new FormData();
    form.append('file', new Blob([wrapWav(pcm)], { type: 'audio/wav' }), 'utterance.wav');
    form.append('model_id', speech.sttModel);
    // Pinned per toy: on a short utterance the model's own language guess is
    // unreliable.
    if (languageCode) form.append('language_code', languageCode);
    // The field repeats, one entry per term; a JSON array is read as one term.
    for (const term of keytermsFor(keyterms, { enabled: speech.keyterms, max: speech.keytermsMax })) {
      form.append('keyterms', term);
    }
    // Explicit false, because omitting it turns tagging ON, and a mouse click
    // once became a "[tiếng click chuột]" turn in the prototype's logs.
    form.append('tag_audio_events', String(speech.audioEvents));
    if (speech.noVerbatim) form.append('no_verbatim', 'true');

    // enable_logging is a query parameter, not a form field; in the wrong
    // place it is silently ignored. Zero-retention needs an enterprise tier.
    const url = `${base}/v1/speech-to-text${speech.logging ? '' : '?enable_logging=false'}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal,
        headers: { 'xi-api-key': config.keys.elevenlabs },
        body: form,
      });
    } catch (err) {
      throw toSpeechError(err, signal);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new SpeechError('upstream', `stt http ${res.status}`, { status: res.status });
    return String(body.text || '').trim();
  }

  return { transcribe };
}
