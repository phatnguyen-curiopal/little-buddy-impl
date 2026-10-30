// Turns scenario results into a Markdown report: the verdict, a score per
// quality, the spoken-style rules across every turn, each failure with its
// evidence, and every transcript. The report quotes synthetic children only:
// scenarios never contain a real child's words.

import { spokenStyle, styleProblems, type StyleReport } from './checks.ts';
import type { ScenarioRun } from './harness.ts';
import type { Judgement } from './judge.ts';
import { QUALITIES, QUALITY_LABEL, type Quality, type Scenario } from './types.ts';

export interface ScenarioResult {
  scenario: Scenario;
  run: ScenarioRun | null;
  judgement: Judgement | null;
  error: string | null;
  pass: boolean;
}

export interface ReportMeta {
  startedAt: Date;
  gateway: string;
  models: string;
  judge: string | null;
  recallBudgetMs: number;
  audioTags: boolean;
}

export function verdict(run: ScenarioRun | null, judgement: Judgement | null, judged: boolean): boolean {
  if (!run || run.errors.length) return false;
  if (!run.checks.every((c) => c.pass)) return false;
  return judged ? Boolean(judgement?.criteria.every((c) => c.pass)) : true;
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function styles(r: ScenarioResult, audioTags: boolean): { ref: string; style: StyleReport }[] {
  if (!r.run) return [];
  return r.run.turns.flatMap((t) => {
    const style = spokenStyle(t, r.run!.world.ageYears, audioTags);
    return style ? [{ ref: t.ref, style }] : [];
  });
}

function learned(r: ScenarioRun): string[] {
  const before = new Set([
    ...r.seeded.facts.map((f) => `fact:${f.statement}:${f.status}`),
    ...r.seeded.people.map((p) => `person:${p.name}`),
    ...r.seeded.events.map((e) => `event:${e.description}:${e.status}`),
    ...r.seeded.relationship.map((x) => `rel:${x.content}:${x.status}`),
    ...r.seeded.canon.map((c) => `canon:${c.statement}`),
  ]);
  const out: string[] = [];
  for (const f of r.state.facts) if (!before.has(`fact:${f.statement}:${f.status}`)) out.push(`fact (${f.status}, ${f.category}, ${f.reality}, confidence ${f.confidence}${f.about ? `, about ${f.about}` : ''}): ${f.statement}`);
  for (const p of r.state.people) if (!before.has(`person:${p.name}`)) out.push(`person: ${p.name} (${p.kind}${p.relation ? `, ${p.relation}` : ''})`);
  for (const e of r.state.events) if (!before.has(`event:${e.description}:${e.status}`)) out.push(`event (${e.kind}, ${e.status}): ${e.description}`);
  for (const x of r.state.relationship) if (!before.has(`rel:${x.content}:${x.status}`)) out.push(`${x.kind} (${x.status}): ${x.content}`);
  for (const c of r.state.canon) if (!before.has(`canon:${c.statement}`)) out.push(`canon (${c.source}): ${c.statement}`);
  for (const e of r.state.episodes) out.push(`episode: ${e.points.join('; ')}`);
  return out;
}

export function renderReport(results: ScenarioResult[], meta: ReportMeta): string {
  const judged = meta.judge !== null;
  const passed = results.filter((r) => r.pass).length;
  const lines: string[] = [
    '# Little Buddy quality eval',
    '',
    `Run ${meta.startedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. Gateway ${meta.gateway} (${meta.models}). ${judged ? `Judge ${meta.judge}.` : 'No judge: deterministic checks only.'} Recall budget ${meta.recallBudgetMs} ms.`,
    '',
    `**${passed} of ${results.length} scenarios pass.** A scenario passes when every deterministic check${judged ? ' and every judged criterion' : ''} passes.`,
    '',
    '## By quality',
    '',
    `| Quality | Scenarios | Pass |${judged ? ' Judge score (1 to 5) |' : ''}`,
    `| --- | --- | --- |${judged ? ' --- |' : ''}`,
  ];
  for (const q of QUALITIES) {
    const mine = results.filter((r) => r.scenario.quality === q);
    const scores = results.map((r) => r.judgement?.scores[q]?.score ?? 0).filter((s) => s > 0);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'n/a';
    lines.push(`| ${QUALITY_LABEL[q]} | ${mine.length} | ${mine.filter((r) => r.pass).length} |${judged ? ` ${avg} (${scores.length} scenarios) |` : ''}`);
  }
  if (judged) lines.push('', 'The judge score for a quality averages every scenario where the judge saw evidence of it, not only the scenarios that test it first.');

  const all = results.flatMap((r) => styles(r, meta.audioTags));
  const count = (f: (s: StyleReport) => boolean) => all.filter((x) => f(x.style)).length;
  const firstAudio = results.flatMap((r) => r.run?.turns.map((t) => t.firstAudioMs).filter((x): x is number => x !== null) ?? []);
  const moments = results.flatMap((r) => r.judgement?.chatbotMoments ?? []);
  const kinds = new Map<string, number>();
  for (const m of moments) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1);
  lines.push(
    '',
    `## Spoken style across ${all.length} turns`,
    '',
    '| Rule (spec section 7) | Turns breaking it |',
    '| --- | --- |',
    `| Over the sentence limit (3, or 4 from age 6, +2 for a story) | ${count((s) => s.sentences > s.sentenceLimit)} (${pct(count((s) => s.sentences > s.sentenceLimit), all.length)}) |`,
    `| More than one question | ${count((s) => s.questions > 1)} (${pct(count((s) => s.questions > 1), all.length)}) |`,
    `| Over about 15 s of speech | ${count((s) => s.words > s.wordLimit)} (${pct(count((s) => s.words > s.wordLimit), all.length)}) |`,
    `| No face tag | ${count((s) => !s.faceTag)} |`,
    `| No tone tag | ${count((s) => !s.toneTag)} |`,
    `| Markup or emoji | ${count((s) => s.markup)} |`,
    `| Cut off by the output guard | ${count((s) => s.cut)} |`,
    '',
  );
  if (judged) {
    const kindList = [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.replace('_', ' ')} ${n}`).join(', ');
    lines.push(`Chatbot moments found by the judge: ${moments.length} in ${all.length} turns, ${all.length ? ((100 * moments.length) / all.length).toFixed(1) : 'n/a'} per 100 turns (spec target: fewer than 2)${kindList ? `. By kind: ${kindList}` : ''}.`, '');
  }
  const p50 = quantile(firstAudio, 0.5);
  const p95 = quantile(firstAudio, 0.95);
  if (p50 !== null) lines.push(`Time from the end of the child's words to Buddy's first audio: median ${p50} ms, 95th percentile ${p95} ms. Typed turns skip speech recognition and the voice is recorded rather than synthesised, so this is the time to Buddy's first sentence, not the full latency.`, '');

  const failures = results.filter((r) => !r.pass);
  lines.push('## Failures', '');
  if (!failures.length) lines.push('None.', '');
  for (const r of failures) {
    lines.push(`### ${r.scenario.id} ${r.scenario.title}`, '');
    if (r.error) lines.push(`- run failed: ${r.error}`);
    for (const e of r.run?.errors ?? []) lines.push(`- pipeline error: ${e}`);
    for (const c of r.run?.checks.filter((x) => !x.pass) ?? []) lines.push(`- check failed: ${c.label}. ${c.detail}`);
    for (const c of r.judgement?.criteria.filter((x) => !x.pass) ?? []) lines.push(`- ${c.id} ${c.kind === 'must' ? 'missed' : 'broken'}: ${c.text} Judge: ${c.evidence}`);
    lines.push('');
  }

  lines.push('## Scenarios', '', '| ID | Title | Quality | Result | Checks | Criteria |', '| --- | --- | --- | --- | --- | --- |');
  for (const r of results) {
    const checks = r.run ? `${r.run.checks.filter((c) => c.pass).length}/${r.run.checks.length}` : '-';
    const crit = r.judgement ? `${r.judgement.criteria.filter((c) => c.pass).length}/${r.judgement.criteria.length}` : '-';
    lines.push(`| ${r.scenario.id} | ${cell(r.scenario.title)} | ${QUALITY_LABEL[r.scenario.quality]} | ${r.pass ? 'pass' : 'FAIL'} | ${checks} | ${crit} |`);
  }

  lines.push('', '## Transcripts', '');
  for (const r of results) {
    lines.push(`### ${r.scenario.id} ${r.scenario.title}`, '', `Spec: ${r.scenario.spec}.`, '');
    if (!r.run) {
      lines.push(`No transcript: ${r.error}`, '');
      continue;
    }
    const style = new Map(styles(r, meta.audioTags).map((x) => [x.ref, styleProblems(x.style)]));
    for (const [i] of r.scenario.sessions.entries()) {
      lines.push(`Session ${i + 1}`, '');
      for (const t of r.run.turns.filter((x) => x.session === i + 1)) {
        lines.push(`- **${t.ref} Child:** ${t.child}`);
        const said = t.result === 'answered' ? t.raw.trim().replace(/^\[face:[^\]]*\]\s*/i, '').replace(/\s+/g, ' ') : `(no answer: ${t.result})`;
        const problems = style.get(t.ref) ?? [];
        lines.push(`- **Buddy** (${t.face ?? '-'}, ${t.turnType ?? '-'}${t.classification ? `, heard ${t.classification.feeling}/${t.classification.intent}` : ''}): ${said}${problems.length ? ` *(style: ${problems.join(', ')})*` : ''}`);
      }
      for (const b of r.run.between.filter((x) => x.startsWith(`after session ${i + 1}:`))) lines.push(`- *${b.split(': ')[1]}*`);
      lines.push('');
    }
    const memo = learned(r.run);
    if (memo.length) lines.push('Stored after the run:', '', ...memo.map((m) => `- ${m}`), '');
    if (r.judgement) {
      const scored = (Object.entries(r.judgement.scores) as [Quality, { score: number; reason: string }][]).filter(([, s]) => s.score > 0);
      lines.push(`Judge: ${r.judgement.summary}`, '', `Scores: ${scored.map(([q, s]) => `${QUALITY_LABEL[q]} ${s.score}`).join(', ') || 'none'}.`, '');
    }
  }
  return lines.join('\n');
}
