// ElevenLabs text-to-speech, batch only: the whole reply goes up as one POST
// and the response body is raw PCM16 (pcm_* output format, no container).

import { SpeechError, toSpeechError } from './errors.js';

// Voice ids go into the URL path.
export const VOICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function createTts(config) {
  const speech = config.speech;
  const base = config.seams.elevenlabsBaseUrl;

  async function synthesize({ text, voiceId, languageCode, signal }) {
    if (!VOICE_ID_RE.test(String(voiceId || ''))) throw new SpeechError('upstream', 'invalid voice id');
    const params = new URLSearchParams({ output_format: speech.ttsOutputFormat });
    let res;
    try {
      res = await fetch(`${base}/v1/text-to-speech/${voiceId}?${params}`, {
        method: 'POST',
        signal,
        headers: { 'xi-api-key': config.keys.elevenlabs, 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: speech.ttsModel,
          // Without it the model guesses per request, and short Vietnamese
          // comes out with English pronunciation.
          ...(languageCode && { language_code: languageCode }),
        }),
      });
      if (!res.ok) {
        await res.arrayBuffer().catch(() => null);
        throw new SpeechError('upstream', `tts http ${res.status}`, { status: res.status });
      }
      const pcm = Buffer.from(await res.arrayBuffer());
      // PCM16 frames are two bytes; a stray odd byte would shift every sample.
      return { pcm: pcm.length % 2 ? pcm.subarray(0, pcm.length - 1) : pcm, rate: speech.ttsSampleRate };
    } catch (err) {
      throw toSpeechError(err, signal);
    }
  }

  return { synthesize };
}
