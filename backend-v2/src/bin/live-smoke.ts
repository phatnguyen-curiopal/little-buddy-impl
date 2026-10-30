// Calls every gateway function once against the real OpenAI and ElevenLabs
// APIs, with synthetic sentences only (never a child's words), and prints the
// timings that matter for the latency budget. Costs a few cents.
//   GATEWAY=live npm run smoke:live

import { compileBrief } from '../character/compiler.ts';
import { decide } from '../character/director.ts';
import { SEED_CAST, type CharacterPack, type Instance } from '../character/packs.ts';
import { ReplyParser } from '../character/parser.ts';
import { configFromProcess } from '../config.ts';
import { LEARN_SCHEMA, type LearnResult } from '../gateway/schemas.ts';
import { createLiveGateway } from '../gateway/live.ts';
import { createLogger } from '../log.ts';

const config = configFromProcess();
if (config.gateway !== 'live') throw new Error('set GATEWAY=live');
const log = createLogger('warn');
const gw = createLiveGateway(config, log);
const ms = (t: number) => `${Math.round(performance.now() - t)} ms`;
const line = (label: string, value: string) => process.stdout.write(`${label.padEnd(28)} ${value}\n`);

const seed = SEED_CAST[0];
const pack: CharacterPack = {
  characterId: 'smoke', slug: seed.slug, name: seed.name, packVersionId: 'smoke', version: 1,
  bible: seed.bible, lifeRules: seed.life_rules, dialRanges: seed.dial_ranges, voices: seed.voices,
};
const instance: Instance = {
  id: 'smoke', child_id: 'smoke', character_id: 'smoke', pack_version_id: 'smoke', role: 'friend', language_mode: 'vi',
  relationship_stage: 'buddies', met_on: '2026-10-01', ...seed.profile.dials,
};

let t = performance.now();
const classification = await gw.classify({ text: 'Hôm nay không ai chơi với con ở trường', language: 'vi' });
line('classify (fast model)', `${ms(t)}  ${JSON.stringify(classification)}`);

const plan = decide({ classification, firstTurnOfSession: false, dueCount: 0, energy: 'normal', minutesLeft: null, questionStreak: 0, ageYears: 6 });
const messages = compileBrief({
  pack, instance,
  digest: { name: 'Bông', nickname: null, ageYears: 6, passions: ['vẽ tranh'], likes: ['xoài'], dislikes: [], fears: [], strengths: [], people: [{ name: 'Mochi', kind: 'pet', relation: 'chó' }], topicsToAvoid: [] },
  today: { date: '2026-10-30', weekday: 'Friday', mood: 72, energy: 'normal', diary: ['ngắm mưa rơi bên cửa sổ'] },
  history: [], recall: { memories: [], canon: [], people: [], due: [] }, nudges: [], plan, classification,
  transcript: 'Hôm nay không ai chơi với con ở trường', audioTags: config.elevenlabs.audioTags,
});

t = performance.now();
let firstToken = '';
let text = '';
const parser = new ReplyParser({ audioTags: config.elevenlabs.audioTags });
const sentences: { spoken: string; clean: string }[] = [];
let face = '';
for await (const delta of gw.reply({ messages, cacheKey: 'buddy:smoke' })) {
  if (!firstToken) firstToken = ms(t);
  text += delta;
  for (const e of parser.push(delta)) e.type === 'face' ? (face = e.emotion) : sentences.push(e);
}
for (const e of parser.end()) e.type === 'face' ? (face = e.emotion) : sentences.push(e);
line('reply (reply model)', `first token ${firstToken}, done ${ms(t)}, face ${face}, ${sentences.length} sentence(s)`);
line('reply text', text.replace(/\s+/g, ' ').slice(0, 300));

t = performance.now();
let firstAudio = '';
const audio: Buffer[] = [];
for await (const chunk of gw.speak({ text: sentences[0]?.spoken ?? 'Xin chào!', voiceId: pack.voices.vi.voice_id, language: 'vi' })) {
  if (!firstAudio) firstAudio = ms(t);
  audio.push(chunk);
}
const pcm = Buffer.concat(audio);
line('speak (first sentence)', `first audio ${firstAudio}, done ${ms(t)}, ${(pcm.length / 32000).toFixed(1)} s of audio`);

t = performance.now();
const heard = await gw.transcribe({ pcm, language: 'vi', keyterms: ['Bông', 'Mochi', 'Bo'] });
line('transcribe (round trip)', `${ms(t)}  "${heard.slice(0, 120)}"`);

t = performance.now();
const vecs = await gw.embed(['thích xoài', 'loves mangoes']);
const dot = vecs[0].reduce((s, v, i) => s + v * vecs[1][i], 0);
line('embed', `${ms(t)}  ${vecs[0].length} dims, cosine(vi, en) ${dot.toFixed(2)}`);

t = performance.now();
const mod = await gw.moderate('Con muốn kể về con chó Mochi của con');
line('moderate', `${ms(t)}  flagged ${mod.flagged}`);

t = performance.now();
const learned = await gw.structured<LearnResult>({
  tier: 'fast', name: 'learn', schema: LEARN_SCHEMA,
  system: 'Extract memory items from this exchange between a child and a toy friend. Return only the JSON.',
  user: 'Today: 2026-10-30\nKnown people: none\nKnown facts: none\nChild said: My dog Mochi is white and I love mangoes\nBuddy replied: Wowee! My favourite song is the rain song.',
});
line('learn (structured)', `${ms(t)}  people ${learned.people.length}, facts ${learned.facts.length}, canon ${learned.canon.length}`);
