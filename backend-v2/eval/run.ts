// Runs the quality scenarios and writes a report:
//   npm run eval                              all 50, judged (needs GATEWAY=live and OPENAI_API_KEY)
//   npm run eval -- --only EMO,MEM-02         by id or prefix
//   npm run eval -- --no-judge                deterministic checks only
//   GATEWAY=fake npm run eval -- --no-judge   the harness itself, free and offline
// A full live run makes a few hundred OpenAI calls (replies, classifier,
// learner, nightly, judge) and takes several minutes.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { loadConfig, loadEnvFile } from '../src/config.ts';
import { createLogger } from '../src/log.ts';
import { runScenario } from './harness.ts';
import { createJudge } from './judge.ts';
import { renderReport, verdict, type ScenarioResult } from './report.ts';
import { SCENARIOS } from './scenarios.ts';

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    'no-judge': { type: 'boolean', default: false },
    'recall-budget': { type: 'string', default: '2500' },
    'real-tts': { type: 'boolean', default: false },
    out: { type: 'string', default: 'eval/reports' },
  },
});

loadEnvFile();
const realTts = values['real-tts'];
const recallBudgetMs = Number(values['recall-budget']);
const config = loadConfig({
  ...process.env,
  NODE_ENV: 'test',
  ALLOW_TEXT_TURNS: '1',
  // Quality first: production's 300 ms budget is measured with speculation
  // running during speech, which typed turns do not have.
  RECALL_BUDGET_MS: String(recallBudgetMs),
  // The voice is recorded as text unless --real-tts, so no ElevenLabs key is needed.
  ...(!realTts && !process.env.ELEVENLABS_API_KEY ? { ELEVENLABS_API_KEY: 'unused-voice-is-recorded' } : {}),
});
const judged = !values['no-judge'];
if (judged && config.gateway !== 'live') throw new Error('the judge needs GATEWAY=live; pass --no-judge to run checks only');

const wanted = values.only?.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const scenarios = wanted ? SCENARIOS.filter((s) => wanted.some((w) => s.id.startsWith(w))) : SCENARIOS;
if (!scenarios.length) throw new Error(`no scenario matches ${values.only}`);

const startedAt = new Date();
const outDir = join(values.out!, startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19));
await mkdir(outDir, { recursive: true });
// Ids only, like every log in this codebase; kept beside the report.
const logLines: string[] = [];
const log = createLogger('warn', { component: 'eval' }, (l) => logLines.push(l));
const judge = judged ? createJudge(config) : null;

async function one(scenario: (typeof SCENARIOS)[number]): Promise<ScenarioResult> {
  try {
    const run = await runScenario(scenario, { config, log, realTts });
    let judgement = null;
    let error: string | null = null;
    if (judge) {
      try {
        judgement = await judge.judge(run);
      } catch (err) {
        error = `judge failed: ${(err as Error).message}`;
      }
    }
    return { scenario, run, judgement, error, pass: !error && verdict(run, judgement, judged) };
  } catch (err) {
    return { scenario, run: null, judgement: null, error: (err as Error).message, pass: false };
  }
}

const results: ScenarioResult[] = new Array(scenarios.length);
let next = 0;
let done = 0;
async function worker(): Promise<void> {
  while (next < scenarios.length) {
    const i = next++;
    const r = await one(scenarios[i]);
    results[i] = r;
    done += 1;
    const misses = [
      ...(r.run?.checks.filter((c) => !c.pass).map((c) => c.label) ?? []),
      ...(r.judgement?.criteria.filter((c) => !c.pass).map((c) => c.id) ?? []),
      ...(r.error ? [r.error] : []),
    ];
    process.stdout.write(`${String(done).padStart(2)}/${scenarios.length} ${r.pass ? 'PASS' : 'FAIL'} ${r.scenario.id} ${r.scenario.title}${misses.length ? `  [${misses.join('; ')}]` : ''}\n`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));

const meta = {
  startedAt,
  gateway: config.gateway,
  models: config.gateway === 'live' ? `reply ${config.openai.replyModel}, fast ${config.openai.fastModel}, background ${config.openai.backgroundModel}, embeddings ${config.openai.embeddingModel}` : 'deterministic fake',
  judge: judge ? `${judge.model}, effort ${judge.effort}` : null,
  recallBudgetMs,
  audioTags: config.elevenlabs.audioTags,
};
await writeFile(join(outDir, 'report.md'), renderReport(results, meta));
await writeFile(join(outDir, 'results.json'), JSON.stringify({ meta, results }, null, 2));
await writeFile(join(outDir, 'log.jsonl'), logLines.join('\n'));
const passed = results.filter((r) => r.pass).length;
process.stdout.write(`\n${passed} of ${results.length} scenarios pass. Report: ${join(outDir, 'report.md')}\n`);
