// Records one sample per voice for the parent site's voice picker
// (frontend/public/voice-samples/<id>.wav): Buddy's greeting in the voice's
// language, through the same createTts call a turn makes, so a parent hears
// the model, audio format and pronunciation their toy will really have.
//
//   npm run voice-samples -- mgBpvrNosWzExdPuRbXP:vi fBD19tfE58bkETeiwUoC:en
//   npm run voice-samples -- --out <dir> <id>:<lang> ...
//
// Every run spends ElevenLabs characters (about 60 per voice) and overwrites
// the files it writes.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadConfig } from '../config.js';
import { LANGUAGES, textFor } from '../persona/text/index.js';
import { VOICE_ID_RE, createTts } from '../speech/tts.js';

export const SAMPLE_LINES = Object.freeze({
  vi: 'Chào bạn! Mình là Buddy nè. Hôm nay bạn muốn chơi trò gì?',
  en: "Hi there! I'm Buddy. What would you like to play today?",
});

const DEFAULT_OUT = fileURLToPath(new URL('../../frontend/public/voice-samples/', import.meta.url));

// Ids go into a file name and a URL path, so they are held to the TTS id
// shape before anything is spent.
export function parseVoiceArgs(args) {
  const out = { dir: DEFAULT_OUT, voices: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      out.dir = path.resolve(String(args[++i] || ''));
      continue;
    }
    const [id, lang] = String(args[i]).split(':');
    if (!VOICE_ID_RE.test(id || '')) throw new Error(`"${args[i]}": not a voice id`);
    if (!LANGUAGES.includes(lang)) throw new Error(`"${args[i]}": language must be one of ${LANGUAGES.join(', ')}`);
    out.voices.push({ id, lang });
  }
  if (!out.voices.length) throw new Error('give at least one <voice id>:<vi|en>');
  return out;
}

// The toy plays raw PCM16 mono; a WAV header around the same bytes lets any
// browser play exactly that.
export function wavFromPcm(pcm, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const { dir, voices } = parseVoiceArgs(process.argv.slice(2));
    const tts = createTts(loadConfig());
    await mkdir(dir, { recursive: true });
    for (const { id, lang } of voices) {
      try {
        const { pcm, rate } = await tts.synthesize({ text: SAMPLE_LINES[lang], voiceId: id, languageCode: textFor(lang).languageCode });
        const file = path.join(dir, `${id}.wav`);
        await writeFile(file, wavFromPcm(pcm, rate));
        console.log(`[voice-samples] ${id} (${lang}): ${(pcm.length / (rate * 2)).toFixed(1)} s -> ${file}`);
      } catch (err) {
        // One bad id (a voice removed from the library) must not cost the rest.
        console.error(`[voice-samples] ${id} (${lang}) failed: ${err.message}`);
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error(`[voice-samples] ${err.message}`);
    process.exitCode = 1;
  }
}
