// A simulated toy for local testing:
//   npm run toy -- --manifest manifests/dev-123.json --text "My dog Mochi fell in a puddle"
//   npm run toy -- --manifest manifests/dev-123.json --wav hello.wav
//   npm run toy -- --manifest manifests/dev-123.json --claim   (prints a claim token for the app)

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { parseWav, wrapWav } from '../audio/wav.ts';
import { configFromProcess } from '../config.ts';
import { ToyClient } from '../sim/toy-client.ts';

const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    index: { type: 'string', default: '0' },
    url: { type: 'string' },
    text: { type: 'string' },
    wav: { type: 'string' },
    claim: { type: 'boolean', default: false },
    out: { type: 'string', default: 'reply.wav' },
  },
});
if (!values.manifest) throw new Error('--manifest is required');
const manifest = JSON.parse(await readFile(values.manifest, 'utf8')) as { devices: { device_id: string; secret: string; serial: string }[] };
const device = manifest.devices[Number(values.index)];
if (!device) throw new Error('no device at that index');
const toy = new ToyClient(device.device_id, device.secret);

if (values.claim) {
  process.stdout.write(`${toy.claimToken()}\n`);
  process.exit(0);
}

const config = configFromProcess();
const url = values.url ?? `ws://${config.host}:${config.voicePort}/v1/device`;
const ready = await toy.connect(url);
process.stdout.write(`ready: ${JSON.stringify(ready)}\n`);
const pcm = values.wav ? parseWav(await readFile(values.wav)).pcm : undefined;
const result = await toy.turn({ pcm, text: values.text, timeoutMs: 60_000 });
process.stdout.write(`result: ${result.result}; faces: ${result.faces.join(' -> ')}; clips: ${result.clips.join(', ') || 'none'}; audio: ${(result.audio.length / 32000).toFixed(1)} s\n`);
if (result.audio.length) {
  await writeFile(values.out, wrapWav(result.audio));
  process.stdout.write(`reply audio written to ${values.out}\n`);
}
toy.close();
