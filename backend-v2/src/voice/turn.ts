// One turn, from the child's final transcript to Buddy's voice. Most of the
// work starts earlier, while the child is still talking: the session streams
// audio to recognition, preloads the day, and speculatively classifies and
// recalls on the partial transcript. Here those results are reused when the
// final transcript matches, so the reply can start almost at once. Every
// external call shares the turn's AbortSignal, so a cancel or a dropped
// socket stops all of them.

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import type { ChatMessage, Classification, Emotion, Lang, TurnType } from '../domain/types.ts';
import type { ModelGateway, NameQuestion, Usage } from '../gateway/types.ts';
import type { JobQueue } from '../jobs/queue.ts';
import type { Logger } from '../log.ts';
import { compileBrief, type Today } from '../character/compiler.ts';
import { clarifyPlan, decide, greetPlan } from '../character/director.ts';
import { enforceChildFirst } from '../character/emotions.ts';
import { ageInYears, dailyMood, energyPhase, localTime, seededUnit, type EnergyPhase } from '../character/mood.ts';
import { pickGame, type Game } from '../character/play.ts';
import type { CharacterPack, Instance } from '../character/packs.ts';
import { ReplyParser } from '../character/parser.ts';
import type { DigestCache } from '../memory/digest.ts';
import { alsoWord, exactForm, findMentions, type Mentions, type PersonCard } from '../memory/names.ts';
import { dueItems, recall } from '../memory/recall.ts';
import { loadTraits, startlesWelcome, traitGuidance, type TraitRow } from '../memory/traits.ts';
import { EMPTY_RECALL, type ChildDigest, type DueItem, type RecallResult } from '../memory/types.ts';
import { recordSafetyEvent } from '../safety/events.ts';
import { checkSentence } from '../safety/rules.ts';
import { GatewayError } from '../util/errors.ts';
import { judgeTone, type ToneMeter, type ToneReading, type VoiceBaseline } from './tone.ts';

export interface VoiceDeps {
  db: Db;
  gateway: ModelGateway;
  config: Config;
  log: Logger;
  queue: JobQueue;
  digests: DigestCache;
}

export interface ChildRow {
  id: string;
  name: string;
  nickname: string | null;
  birth_date: string | null;
  languages: string[];
  time_zone: string;
  learning_enabled: boolean;
}

export interface Controls {
  daily_limit_min: number | null;
  quiet_start: string | null;
  quiet_end: string | null;
  bedtime: string;
  mood_pin: number | null;
  surprise_play: boolean;
  speak_first: boolean;
}

// What growing up together needs about the child, loaded at the tap.
export interface ChildExtras {
  traits: TraitRow[];
  goals: string[];
  // Second-language words due for review: [word, meaning].
  dueWords: [string, string | null][];
  voice: VoiceBaseline | null;
  // Share of past times each game kept the child playing, by game id.
  worked: Record<string, number>;
}

const NO_EXTRAS: ChildExtras = { traits: [], goals: [], dueWords: [], voice: null, worked: {} };

export interface Prefetch {
  today: Promise<Today>;
  digest: Promise<ChildDigest | null>;
  nudges: Promise<{ id: string; content: string }[]>;
  extras: Promise<ChildExtras>;
}

export interface Speculation {
  key: string;
  startedAt: number;
  mentions: Mentions<PersonCard>;
  // The unsure cards put to the classifier, as refs n1, n2... in this order.
  asked: PersonCard[];
  classification: Promise<Classification>;
  recall: Promise<RecallResult>;
}

// Who the child meant, once the classifier has answered the name questions.
export interface NameReading {
  people: PersonCard[];
  // Known names the child used as a plain word ("ăn mít"): their facts stay
  // out of the reply, and the brief says so.
  notMeant: { name: string; who: string; word: string }[];
  // Several cards with one name and nothing to tell them apart.
  sameName: { name: string; who: string[] }[];
  excluded: Set<string>;
}

// Milliseconds measured from the moment the toy reported the end of speech.
export interface TurnTiming {
  endAt: number;
  sttMs?: number;
  contextMs?: number;
  firstTokenMs?: number;
  firstAudioMs?: number;
  reused?: boolean;
  // How long before turn_end the reused speculation started.
  specLeadMs?: number;
}

export interface TurnContext {
  deps: VoiceDeps;
  child: ChildRow;
  buddy: { instance: Instance; pack: CharacterPack };
  controls: Controls;
  usedSeconds: number;
  sessionId: string;
  firstTurn: boolean;
  history: ChatMessage[];
  questionStreak: number;
  serverTurnId: string;
  // The child's people, pets, toys and places, loaded at the tap.
  cards: PersonCard[];
  // Games this session: one in progress, a playful roll to start one, the
  // games already played, and a seed for choosing.
  play: { active: Game | null; wantsToPlay: boolean; played: string[]; seed: string };
  // Once-a-session moments the session still allows; clarify is false right
  // after Buddy asked the child to say it again.
  allow: { goal: boolean; words: boolean; growth: boolean; clarify: boolean };
  // What Buddy said just before, and this child's speech habits, so a
  // young child's words are read as they were meant.
  before: string | null;
  habits: [string, string][];
  // Loudness, pitch and pace of the child's voice this turn; null for typed turns.
  tone: ToneMeter | null;
  // Buddy speaks first: no words from the child.
  greet?: boolean;
  // Settles once the recogniser commits the final words.
  transcript: Promise<string>;
  speculation: Speculation | null;
  prefetch: Prefetch;
  timing: TurnTiming;
  signal: AbortSignal;
  send: (msg: Record<string, unknown>) => void;
  sendAudio: (pcm: Buffer) => void;
}

export interface TurnOutcome {
  result: 'answered' | 'no_speech' | 'failed' | 'cancelled';
  childText: string;
  replyText: string;
  face: Emotion;
  turnType: TurnType | 'none';
  replyBytes: number;
  ttsChars: number;
  usage: Usage;
  dueHandled: DueItem | null;
  nudgeIds: string[];
  language: Lang;
  game: { id: string; step: 'offer' | 'play'; continues: boolean } | null;
  goalShown: boolean;
  wordsShown: boolean;
  mirroredFactId: string | null;
  tone: ToneReading | null;
  // Buddy asked the child to say it again.
  clarified: boolean;
}

const CHEERFUL = new Set(['happy', 'excited']);
const UPSET = new Set(['sad', 'scared', 'angry']);

const GOALS: Record<string, string> = {
  english_words: 'They are learning English words: teach one word that fits what they said, as a game.',
  sharing: 'They are learning to share: if friends, toys or turns come up, notice kindness and celebrate it.',
  bedtime_routine: 'They are building a bedtime routine: near bedtime, cheer them on to brush their teeth and get ready for bed.',
};

// One of the parent's goals for this session, or none when it would not fit.
function goalLine(goals: string[], energy: EnergyPhase, seed: string): string | null {
  const fitting = goals.filter((g) => g !== 'bedtime_routine' || energy === 'drowsy');
  if (!fitting.length) return null;
  const g = fitting[Math.floor(seededUnit(seed) * fitting.length)];
  return GOALS[g] ?? `They are working on: ${g}. Help gently, as a friend would.`;
}

async function loadExtras(db: Db, childId: string): Promise<ChildExtras> {
  const [traits, goals, words, voice, worked] = await Promise.all([
    loadTraits(db, childId),
    db.query<{ focus: string }>('SELECT focus FROM goal WHERE child_id = $1 AND active ORDER BY created_at', [childId]),
    db.query<{ word: string; meaning: string | null }>(
      'SELECT word, meaning FROM word_bank WHERE child_id = $1 AND next_review_at <= now() ORDER BY next_review_at LIMIT 3',
      [childId],
    ),
    db.query<VoiceBaseline>('SELECT turns, loudness_mean, loudness_m2, pitch_mean, pitch_m2, pace_mean, pace_m2 FROM voice_baseline WHERE child_id = $1', [childId]),
    db.query<{ key: string; attempts: number; successes: number }>("SELECT key, attempts, successes FROM what_works WHERE child_id = $1 AND key LIKE 'play:%'", [childId]),
  ]);
  return {
    traits,
    goals: goals.rows.map((g) => g.focus),
    dueWords: words.rows.map((w) => [w.word, w.meaning]),
    voice: voice.rows[0] ?? null,
    // A game carried on for several turns counts more than once; cap at 1.
    worked: Object.fromEntries(worked.rows.filter((w) => w.attempts > 0).map((w) => [w.key.slice(5), Math.min(1, w.successes / w.attempts)])),
  };
}

const FALLBACK: Record<Lang, string> = {
  vi: 'Mình nói chuyện khác nhé! Cậu có muốn chơi đố vui không?',
  en: "Let's talk about something else! Do you want a riddle?",
};

const NEUTRAL: Classification = { intent: 'other', feeling: 'neutral', danger: 'none', severity: 'none' };

export function speechLanguage(child: ChildRow, instance: Instance): Lang {
  if (instance.language_mode === 'vi' || instance.language_mode === 'en') return instance.language_mode;
  return child.languages[0] === 'en' ? 'en' : 'vi';
}

function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

const since = (t: number) => Math.round(performance.now() - t);

// What counts as "the same words": case, spacing and punctuation aside. Tone
// marks stay, because in Vietnamese they change the word (ma, má, mà).
export function textKey(text: string): string {
  return exactForm(text);
}

export function speculate(
  deps: VoiceDeps,
  who: { childId: string; instanceId: string; cards: PersonCard[]; before?: string | null; habits?: [string, string][] },
  text: string,
  language: Lang,
  signal: AbortSignal,
): Speculation {
  const { db, gateway, config, log } = deps;
  const mentions = findMentions(who.cards, text);
  // The classifier runs on every turn anyway, so unclear names ride along
  // at no extra latency.
  const asked = mentions.unsure.slice(0, 4);
  const names: NameQuestion[] = asked.map((c, i) => ({ ref: `n${i + 1}`, name: c.display_name, who: c.relation ?? c.kind, word: alsoWord(c) }));
  return {
    key: textKey(text),
    startedAt: performance.now(),
    mentions,
    asked,
    // Both promises settle to a value: an abandoned speculation must never
    // surface as an unhandled rejection.
    classification: gateway.classify({
      text, language, names: names.length ? names : undefined, before: who.before ?? null, habits: who.habits ?? [], signal: withTimeout(signal, 4_000),
    }).catch((err) => {
      if (!signal.aborted) log.warn('classifier failed, using neutral', { kind: (err as GatewayError).kind });
      return NEUTRAL;
    }),
    recall: recall({ db, gateway }, { childId: who.childId, instanceId: who.instanceId, text, budgetMs: config.voice.recallBudgetMs, signal, mentions }).catch(() => EMPTY_RECALL),
  };
}

// An unsure name with no answer (the classifier failed) is left out: missing
// a mention costs less than talking about the wrong person.
export function readNames(spec: Pick<Speculation, 'mentions' | 'asked'>, answers: Classification['names']): NameReading {
  const meant = new Set((answers ?? []).filter((a) => a.meant).map((a) => a.ref));
  const answered = new Set((answers ?? []).map((a) => a.ref));
  const asked = spec.asked.map((card, i) => ({ card, ref: `n${i + 1}` }));
  const notMeant = asked.filter((a) => answered.has(a.ref) && !meant.has(a.ref)).map((a) => a.card);
  const people = [...spec.mentions.sure, ...asked.filter((a) => meant.has(a.ref)).map((a) => a.card)].slice(0, 4);
  const plainWords = [...spec.mentions.words, ...notMeant].filter((c, i, all) => all.indexOf(c) === i && alsoWord(c));
  const byName = new Map<string, PersonCard[]>();
  for (const p of people) byName.set(exactForm(p.display_name), [...(byName.get(exactForm(p.display_name)) ?? []), p]);
  return {
    people,
    notMeant: plainWords.map((c) => ({ name: c.display_name, who: c.relation ?? c.kind, word: alsoWord(c)! })),
    sameName: [...byName.values()].filter((g) => g.length > 1).map((g) => ({ name: g[0].display_name, who: g.map((p) => p.relation ?? p.kind) })),
    excluded: new Set([...spec.mentions.words, ...notMeant].map((c) => c.id)),
  };
}

async function todayFor(db: Db, child: ChildRow, instance: Instance, controls: Controls): Promise<Today> {
  const local = localTime(child.time_zone);
  const diary = (
    await db.query<{ story: string; valence: 'bright' | 'normal' | 'grey' }>(
      'SELECT story, valence FROM diary_entry WHERE instance_id = $1 AND day = $2::date ORDER BY slot',
      [instance.id, local.date],
    )
  ).rows;
  let mood: number;
  if (controls.mood_pin !== null) {
    // A pinned mood writes nothing: it is the parent's choice, not Buddy's day.
    mood = controls.mood_pin;
  } else {
    const stored = await db.query<{ mood: number }>('SELECT mood FROM mood_day WHERE instance_id = $1 AND day = $2::date', [instance.id, local.date]);
    mood = stored.rows[0]?.mood ?? dailyMood(`${instance.id}:${local.date}`, instance.energy, diary[0]?.valence ?? null);
    if (!stored.rows[0]) {
      await db.query(
        "INSERT INTO mood_day (instance_id, day, mood, source) VALUES ($1, $2::date, $3, 'computed') ON CONFLICT DO NOTHING",
        [instance.id, local.date, mood],
      );
    }
  }
  return {
    date: local.date,
    weekday: local.weekday,
    mood,
    energy: energyPhase(local.hour, local.minute, controls.bedtime),
    diary: diary.map((d) => d.story),
  };
}

// Everything a turn needs that does not depend on the child's words, started
// at the tap. Each promise settles to a usable value, even on failure.
export function prefetchFor(deps: VoiceDeps, child: ChildRow, instance: Instance, controls: Controls): Prefetch {
  const { db, digests, log } = deps;
  const local = localTime(child.time_zone);
  const plainDay: Today = { date: local.date, weekday: local.weekday, mood: 60, energy: energyPhase(local.hour, local.minute, controls.bedtime), diary: [] };
  return {
    today: todayFor(db, child, instance, controls).catch((err) => {
      log.warn('day state failed, using a plain day', { child_id: child.id, error: (err as Error).message });
      return plainDay;
    }),
    digest: digests.get(db, child.id).catch(() => null),
    nudges: db
      .query<{ id: string; content: string }>(
        `SELECT id, content FROM nudge
         WHERE child_id = $1 AND status = 'pending' AND use_after <= now() AND (expires_at IS NULL OR expires_at > now())
         ORDER BY use_after LIMIT 2`,
        [child.id],
      )
      .then((r) => r.rows)
      .catch(() => []),
    extras: loadExtras(db, child.id).catch(() => NO_EXTRAS),
  };
}

export async function runTurn(ctx: TurnContext): Promise<TurnOutcome> {
  const { db, gateway, config, log, queue } = ctx.deps;
  const { instance, pack } = ctx.buddy;
  const language = speechLanguage(ctx.child, instance);
  const usage: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  const outcome: TurnOutcome = {
    result: 'failed', childText: '', replyText: '', face: 'neutral', turnType: 'none',
    replyBytes: 0, ttsChars: 0, usage, dueHandled: null, nudgeIds: [], language,
    game: null, goalShown: false, wordsShown: false, mirroredFactId: null, tone: null, clarified: false,
  };

  try {
    const transcript = ctx.greet ? '' : (await ctx.transcript).trim();
    ctx.timing.sttMs = since(ctx.timing.endAt);
    if (ctx.signal.aborted) return { ...outcome, result: 'cancelled' };
    // The child spoke for a second or more, yet no words came through even
    // after a second opinion: Buddy asks again in its own words instead of
    // the canned clip, once; a second miss in a row gets the clip.
    const lost = !transcript && !ctx.greet && ctx.allow.clarify && (ctx.tone?.read(0)?.voicedSeconds ?? 0) >= 1;
    if (!transcript && !ctx.greet && !lost) return { ...outcome, result: 'no_speech' };
    outcome.childText = transcript;
    const wordless = ctx.greet || lost;

    // Input moderation is a recorded signal, never a gate (a playground fight
    // scores as violence and still deserves comfort), so it does not hold up
    // the reply; its verdict is read after Buddy has answered.
    const moderation = wordless
      ? Promise.resolve({ flagged: false, categories: [] as string[] })
      : gateway.moderate(transcript, withTimeout(ctx.signal, 3_000)).catch(() => ({ flagged: false, categories: [] as string[] }));

    // Reuse what was computed on the partial transcript when the final one
    // says the same thing; otherwise classify the final words now. A turn
    // with no words (speaking first, or nothing heard) only needs what is due.
    const key = textKey(transcript);
    const reused = !wordless && ctx.speculation !== null && key !== '' && ctx.speculation.key === key;
    const who = { childId: ctx.child.id, instanceId: instance.id, cards: ctx.cards, before: ctx.before, habits: ctx.habits };
    const spec = wordless ? null : reused ? ctx.speculation! : speculate(ctx.deps, who, transcript, language, ctx.signal);
    ctx.timing.reused = reused;
    if (reused && spec) ctx.timing.specLeadMs = Math.round(ctx.timing.endAt - spec.startedAt);
    const [classification, recalled, today, digest, nudges, extras] = await Promise.all([
      spec?.classification ?? NEUTRAL,
      spec?.recall ?? dueItems(db, ctx.child.id).then((due) => ({ ...EMPTY_RECALL, due }), () => EMPTY_RECALL),
      ctx.prefetch.today, ctx.prefetch.digest, ctx.prefetch.nudges, ctx.prefetch.extras,
    ]);
    ctx.timing.contextMs = since(ctx.timing.endAt);
    if (ctx.signal.aborted) return { ...outcome, result: 'cancelled' };

    // Safety signals become events; concern and urgent ones alert the parent.
    if (classification.danger !== 'none' && classification.severity !== 'none') {
      await recordSafetyEvent(db, queue, {
        childId: ctx.child.id, sessionId: ctx.sessionId, turnId: ctx.serverTurnId,
        severity: classification.severity, category: classification.danger, detectedBy: 'classifier', excerpt: transcript,
      });
    }

    // Decide the turn and compile the brief.
    const local = localTime(ctx.child.time_zone);
    const ageYears = ageInYears(ctx.child.birth_date, local.date);
    const minutesLeft = ctx.controls.daily_limit_min !== null ? ctx.controls.daily_limit_min - ctx.usedSeconds / 60 : null;
    const bilingual = instance.language_mode === 'bilingual' || extras.goals.includes('english_words');
    outcome.tone = ctx.tone?.read(transcript.split(/\s+/).filter(Boolean).length) ?? null;
    const tone = judgeTone(outcome.tone, extras.voice);
    const candidateGame = pickGame({
      ageYears, energy: today.energy, feeling: classification.feeling, bilingual, playfulness: instance.playfulness,
      // A voice quieter than usual rules out a startle, whatever the words say.
      surpriseAllowed: ctx.controls.surprise_play && startlesWelcome(extras.traits) && !tone?.low,
      played: ctx.play.played, worked: extras.worked, seed: ctx.play.seed,
    });
    const plan = ctx.greet
      ? greetPlan()
      : lost
        ? clarifyPlan()
        : decide({
          classification, firstTurnOfSession: ctx.firstTurn, dueCount: recalled.due.length, energy: today.energy,
          minutesLeft, questionStreak: ctx.questionStreak, ageYears,
          activeGame: ctx.play.active, candidateGame, wantsToPlay: ctx.play.wantsToPlay, clarifiedLastTurn: !ctx.allow.clarify,
        });
    outcome.turnType = plan.type;
    outcome.clarified = plan.type === 'clarify';
    // What a young child most likely said, when it differs from what was heard.
    const meant = classification.meant && textKey(classification.meant) !== key ? classification.meant : null;
    if (plan.game) outcome.game = { id: plan.game.id, step: plan.gameStep!, continues: plan.gameContinues };

    // Once-a-session moments: growth only between best friends with happy
    // news; a parent's goal and the word review only on calm, ordinary turns.
    const growth = ctx.allow.growth && instance.relationship_stage === 'best_friends' && CHEERFUL.has(classification.feeling) ? recalled.growth[0] : undefined;
    outcome.mirroredFactId = growth?.id ?? null;
    const ordinary = ['answer', 'share', 'play', 'story', 'wind_down'].includes(plan.type) && !UPSET.has(classification.feeling);
    const goal = ctx.allow.goal && ordinary && !plan.game ? goalLine(extras.goals, today.energy, ctx.play.seed) : null;
    outcome.goalShown = goal !== null;
    const words = bilingual && extras.dueWords.length && (plan.game?.bilingual || (ctx.allow.words && ordinary)) ? extras.dueWords : null;
    outcome.wordsShown = words !== null && !plan.game?.bilingual;
    const fallbackDigest: ChildDigest = {
      name: ctx.child.name, nickname: ctx.child.nickname, ageYears, passions: [], likes: [], dislikes: [], fears: [], strengths: [], people: [], topicsToAvoid: [],
    };
    const names = spec ? readNames(spec, classification.names) : { people: [], notMeant: [], sameName: [], excluded: new Set<string>() };
    const messages = compileBrief({
      pack, instance, digest: digest ?? fallbackDigest, today, history: ctx.history,
      recall: {
        ...recalled,
        people: names.people,
        memories: recalled.memories.filter((m) => !m.personId || !names.excluded.has(m.personId)),
      },
      names: { notMeant: names.notMeant, sameName: names.sameName },
      traits: traitGuidance(extras.traits),
      growth: growth?.text ?? null,
      goal,
      words,
      voice: tone?.note ?? null,
      meant,
      habits: ctx.habits,
      nudges: nudges.map((n) => n.content), plan, classification,
      transcript: ctx.greet ? '(No words yet: you speak first.)' : lost ? '(You heard your friend speak, but no words came through.)' : transcript,
      audioTags: config.elevenlabs.audioTags,
    });
    if ((plan.type === 'follow_up' || plan.type === 'greet') && recalled.due[0]) outcome.dueHandled = recalled.due[0];
    outcome.nudgeIds = nudges.map((n) => n.id);

    // Stream the reply; speak each sentence as soon as it is complete.
    const parser = new ReplyParser({ audioTags: config.elevenlabs.audioTags });
    const spoken: string[] = [];
    let stopped = false;
    const voiceId = pack.voices[language]?.voice_id ?? pack.voices.vi.voice_id;

    const speak = async (text: string, clean: string) => {
      const moderated = gateway.moderate(clean, withTimeout(ctx.signal, 3_000)).catch(() => ({ flagged: false, categories: [] as string[] }));
      for await (const chunk of gateway.speak({ text, voiceId, language, signal: withTimeout(ctx.signal, 20_000) })) {
        if (ctx.timing.firstAudioMs === undefined) ctx.timing.firstAudioMs = since(ctx.timing.endAt);
        outcome.replyBytes += chunk.length;
        ctx.sendAudio(chunk);
      }
      spoken.push(clean);
      outcome.ttsChars += clean.length;
      const m = await moderated;
      if (m.flagged) {
        stopped = true;
        await recordSafetyEvent(db, queue, {
          childId: ctx.child.id, sessionId: ctx.sessionId, turnId: ctx.serverTurnId,
          severity: 'concern', category: `output:${m.categories[0] ?? 'moderation'}`, detectedBy: 'output', excerpt: null,
        });
      }
    };

    const handle = async (events: ReturnType<ReplyParser['push']>) => {
      for (const e of events) {
        if (stopped || ctx.signal.aborted) return;
        if (e.type === 'face') {
          outcome.face = enforceChildFirst(e.emotion, classification.feeling);
          ctx.send({ type: 'face', emotion: outcome.face, phase: 'speaking' });
          continue;
        }
        if (spoken.length >= plan.sentenceLimit + 1) {
          stopped = true;
          return;
        }
        const hit = checkSentence(e.clean);
        if (hit) {
          stopped = true;
          await recordSafetyEvent(db, queue, {
            childId: ctx.child.id, sessionId: ctx.sessionId, turnId: ctx.serverTurnId,
            severity: hit.category === 'too_long' ? 'info' : 'concern', category: `output:${hit.category}`, detectedBy: 'output', excerpt: null,
          });
          if (!spoken.length) await speak(FALLBACK[language], FALLBACK[language]);
          return;
        }
        await speak(e.spoken, e.clean);
      }
    };

    const replySignal = withTimeout(ctx.signal, 30_000);
    for await (const delta of gateway.reply({ messages, cacheKey: `buddy:${pack.slug}:${pack.version}`, signal: replySignal, onUsage: (u) => Object.assign(usage, u) })) {
      if (ctx.timing.firstTokenMs === undefined) ctx.timing.firstTokenMs = since(ctx.timing.endAt);
      await handle(parser.push(delta));
      if (stopped || ctx.signal.aborted) break;
    }
    if (!stopped && !ctx.signal.aborted) await handle(parser.end());
    if (ctx.signal.aborted) return { ...outcome, result: 'cancelled' };
    if (!spoken.length) return { ...outcome, result: 'failed' };

    const m = await moderation;
    if (m.flagged && classification.danger === 'none') {
      await recordSafetyEvent(db, queue, {
        childId: ctx.child.id, sessionId: ctx.sessionId, turnId: ctx.serverTurnId,
        severity: 'info', category: m.categories[0] ?? 'moderation', detectedBy: 'input', excerpt: null,
      });
    }

    outcome.replyText = spoken.join(' ');
    outcome.result = 'answered';
    return outcome;
  } catch (err) {
    if (ctx.signal.aborted) return { ...outcome, result: 'cancelled' };
    log.warn('turn failed', { child_id: ctx.child.id, kind: (err as GatewayError).kind ?? 'internal', status: (err as GatewayError).status, error: (err as Error).message });
    return { ...outcome, result: 'failed' };
  }
}
