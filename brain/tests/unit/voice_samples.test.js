import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { SAMPLE_LINES, parseVoiceArgs, wavFromPcm } from '../../scripts/voice_samples.js';

test('voice arguments are <id>:<language>, checked before anything is spent', () => {
  const out = parseVoiceArgs(['mgBpvrNosWzExdPuRbXP:vi', 'fBD19tfE58bkETeiwUoC:en']);
  assert.deepEqual(out.voices, [{ id: 'mgBpvrNosWzExdPuRbXP', lang: 'vi' }, { id: 'fBD19tfE58bkETeiwUoC', lang: 'en' }]);
  assert.match(out.dir.replaceAll('\\', '/'), /frontend\/public\/voice-samples\/?$/);
  assert.equal(parseVoiceArgs(['--out', 'x', 'abc:en']).dir, path.resolve('x'));
  assert.throws(() => parseVoiceArgs([]), /at least one/);
  assert.throws(() => parseVoiceArgs(['abc:fr']), /language/);
  assert.throws(() => parseVoiceArgs(['../etc:vi']), /not a voice id/);
  assert.throws(() => parseVoiceArgs(['abc']), /language/);
});

test('a sample line exists for every conversation language', () => {
  assert.deepEqual(Object.keys(SAMPLE_LINES).sort(), ['en', 'vi']);
});

test('the WAV header describes the PCM16 mono bytes the toy plays', () => {
  const pcm = Buffer.alloc(32000);
  const wav = wavFromPcm(pcm, 16000);
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(22), 1, 'mono');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt32LE(28), 32000, 'byte rate');
  assert.equal(wav.readUInt16LE(34), 16, 'bits per sample');
  assert.equal(wav.readUInt32LE(40), pcm.length);
});
