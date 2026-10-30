// One toy's connection: the signed sign-in, turn gating, streaming the
// child's voice to recognition, cancel, and everything written after a turn.
// The socket pins a toy to one process, so conversation history lives here,
// in memory, for 30 minutes.

import { randomUUID } from 'node:crypto';

import type { WebSocket } from 'ws';

import type { ChatMessage, Lang } from '../domain/types.ts';
import type { SttStream } from '../gateway/types.ts';
import { DOWNLINK, FrameChunker, UPLINK, decodeFrame, encodeFrame } from '../audio/frames.ts';
import { pcmSeconds, SAMPLE_RATE } from '../audio/wav.ts';
import { balance, chargeTurn } from '../billing/credits.ts';
import { activeBuddy, type CharacterPack, type Instance } from '../character/packs.ts';
import { GAMES, wantsToPlay } from '../character/play.ts';
import { localTime } from '../character/mood.ts';
import { loadDeviceSecret, verifyChallenge } from '../devices/credentials.ts';
import { alsoWord, type PersonCard } from '../memory/names.ts';
import { loadPeople } from '../memory/recall.ts';
import { loadLexicon, speechHabits, speechTerms } from '../memory/speech.ts';
import { randomToken } from '../util/crypto.ts';
import { CLOSE, PROTOCOL_VERSION, parseToyMessage, type ToyMessage } from './protocol.ts';
import { foldBaseline, ToneMeter, type VoiceBaseline } from './tone.ts';
import {
  prefetchFor, runTurn, speculate, speechLanguage, textKey,
  type ChildRow, type Controls, type Prefetch, type Speculation, type TurnOutcome, type TurnTiming, type VoiceDeps,
} from './turn.ts';

interface Loaded {
  child: ChildRow;
  controls: Controls;
  usedSeconds: number;
  credits: number;
}

interface TurnState {
  id: string;
  bytes: number;
  abort: AbortController;
  phase: 'listening' | 'processing' | 'done';
  loaded: Loaded;
  buddy: { instance: Instance; pack: CharacterPack };
  language: Lang;
  cards: PersonCard[];
  // What Buddy said just before, and this child's speech habits.
  before: string | null;
  habits: [string, string][];
  stt: SttStream;
  tone: ToneMeter | null;
  // Buddy speaks first: a turn the server started, with no words to hear.
  greet: boolean;
  prefetch: Prefetch;
  partial: string;
  spec: Speculation | null;
  specAbort: AbortController | null;
  specCount: number;
}

interface DeviceRow {
  id: string;
  status: string;
  child_id: string | null;
}

// Realtime partials arrive about once a second while the child talks; this
// bounds the classifier and embedding calls a long ramble can start.
const MAX_SPECULATIONS = 10;
// Under 0.3 s of audio there is no word to hear.
const MIN_SPEECH_BYTES = 0.3 * SAMPLE_RATE * 2;

const partitionsReady = new Set<string>();

function minutesOf(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function inQuietHours(controls: Pick<Controls, 'quiet_start' | 'quiet_end'>, hour: number, minute: number): boolean {
  const start = minutesOf(controls.quiet_start);
  const end = minutesOf(controls.quiet_end);
  if (start === null || end === null || start === end) return false;
  const now = hour * 60 + minute;
  // Quiet hours usually cross midnight (20:30 to 06:30).
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export class DeviceSession {
  private readonly ws: WebSocket;
  private readonly deps: VoiceDeps;
  private readonly registry: Map<string, DeviceSession>;
  private readonly nonce = randomToken(16);
  private readonly serverTime = Math.floor(Date.now() / 1000);
  private helloTimer: NodeJS.Timeout | undefined;
  private pingTimer: NodeJS.Timeout | undefined;
  private alive = true;
  private device: DeviceRow | null = null;
  private turn: TurnState | null = null;
  private chatSessionId: string | null = null;
  private lastTurnAt = 0;
  private history: ChatMessage[] = [];
  private questionStreak = 0;
  // Per chat session: the game in progress, games played, turns since the
  // last game, and the once-a-session moments already used.
  private game: { id: string; turns: number } | null = null;
  private gamesPlayed: string[] = [];
  private turnsSinceGame = 99;
  private turnCount = 0;
  private shown = { goal: false, words: false, growth: false };
  // Buddy asked the child to say it again on the last turn.
  private clarifiedLast = false;
  private seqDown = 0;
  private closed = false;
  private inbox: Promise<void> = Promise.resolve();

  constructor(ws: WebSocket, deps: VoiceDeps, registry: Map<string, DeviceSession>) {
    this.ws = ws;
    this.deps = deps;
    this.registry = registry;
  }

  start(): void {
    // Messages are handled strictly in order: turn_start awaits a few database
    // checks, and the frames and turn_end right behind it must not overtake it.
    this.ws.on('message', (data, isBinary) => {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      this.inbox = this.inbox
        .then(() => (isBinary ? this.onAudio(buf) : this.onText(buf.toString('utf8'))))
        .catch((err) => this.deps.log.error('voice message failed', { device_id: this.device?.id, error: err }));
    });
    this.ws.on('pong', () => {
      this.alive = true;
    });
    this.ws.on('close', () => void this.onClose());
    this.ws.on('error', () => {});
    this.send({ type: 'challenge', nonce: this.nonce, server_time: this.serverTime });
    this.helloTimer = setTimeout(() => this.close(CLOSE.AUTH_FAILED, 'no hello'), this.deps.config.voice.helloTimeoutMs);
  }

  private send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(code: number, reason: string): void {
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) this.ws.close(code, reason);
  }

  private async onText(raw: string): Promise<void> {
    const msg = parseToyMessage(raw);
    if (!msg) {
      this.send({ type: 'error', code: 'bad_message' });
      return;
    }
    if (msg.type === 'hello') return this.onHello(msg);
    if (!this.device) {
      this.close(CLOSE.AUTH_FAILED, 'sign in first');
      return;
    }
    switch (msg.type) {
      case 'turn_start':
        return this.onTurnStart(msg.turn_id);
      case 'turn_end':
        return this.onTurnEnd(msg);
      case 'cancel':
        return this.onCancel(msg.turn_id);
      case 'status':
        await this.deps.db.query('UPDATE device SET last_seen_at = now() WHERE id = $1', [this.device.id]);
        if (msg.event === 'wake') await this.maybeGreet();
        return;
      default:
        return;
    }
  }

  private async onHello(msg: Extract<ToyMessage, { type: 'hello' }>): Promise<void> {
    if (this.device) return;
    clearTimeout(this.helloTimer);
    if (msg.protocol !== PROTOCOL_VERSION) return this.close(CLOSE.PROTOCOL, 'protocol not supported');
    const { db, config } = this.deps;
    const secret = await loadDeviceSecret(db, config.deviceKek, msg.device_id);
    if (!secret || !verifyChallenge(secret, this.nonce, msg.device_id, this.serverTime, msg.signature)) {
      return this.close(CLOSE.AUTH_FAILED, 'sign-in failed');
    }
    const device = (await db.query<DeviceRow>('SELECT id, status, child_id FROM device WHERE id = $1', [msg.device_id])).rows[0];
    if (!device || device.status === 'disabled' || device.status === 'revoked') return this.close(CLOSE.BLOCKED, 'toy blocked');

    const previous = this.registry.get(device.id);
    if (previous && previous !== this) previous.close(CLOSE.REPLACED, 'replaced by a newer connection');
    this.registry.set(device.id, this);
    this.device = device;
    await db.query('UPDATE device SET last_seen_at = now(), firmware_version = coalesce($2, firmware_version) WHERE id = $1', [device.id, msg.firmware]);

    const ready = await this.readyState();
    this.send({ type: 'ready', ...ready, ping_interval_s: config.voice.pingIntervalSec, codec: 'pcm16', sample_rate: SAMPLE_RATE, frame_ms: 20 });
    this.pingTimer = setInterval(() => {
      if (!this.alive) return void this.ws.terminate();
      this.alive = false;
      this.ws.ping();
    }, config.voice.pingIntervalSec * 1000);
  }

  private async loadChild(): Promise<Loaded | null> {
    if (!this.device?.child_id) return null;
    const { db } = this.deps;
    const child = (
      await db.query<ChildRow>(
        'SELECT id, family_id, name, nickname, birth_date::text AS birth_date, languages, time_zone, learning_enabled FROM child WHERE id = $1',
        [this.device.child_id],
      )
    ).rows[0];
    if (!child) return null;
    const controls = (
      await db.query<Controls>(
        `SELECT daily_limit_min, quiet_start::text AS quiet_start, quiet_end::text AS quiet_end, bedtime::text AS bedtime, mood_pin,
                surprise_play, speak_first
         FROM child_controls WHERE child_id = $1`,
        [child.id],
      )
    ).rows[0] ?? { daily_limit_min: null, quiet_start: null, quiet_end: null, bedtime: '20:30', mood_pin: null, surprise_play: true, speak_first: false };
    const local = localTime(child.time_zone);
    const [used, credits] = await Promise.all([
      db.query<{ s: number }>('SELECT talk_seconds AS s FROM usage_daily WHERE child_id = $1 AND day = $2::date', [child.id, local.date]),
      balance(db, child.family_id),
    ]);
    return { child, controls, usedSeconds: used.rows[0]?.s ?? 0, credits };
  }

  private async readyState() {
    const loaded = await this.loadChild();
    const buddy = loaded ? await activeBuddy(this.deps.db, loaded.child.id) : null;
    const local = loaded ? localTime(loaded.child.time_zone) : null;
    return {
      claimed: Boolean(loaded),
      language_mode: buddy?.instance.language_mode ?? null,
      quiet_hours: loaded && local ? inQuietHours(loaded.controls, local.hour, local.minute) : false,
      limit_reached: loaded?.controls.daily_limit_min ? loaded.usedSeconds >= loaded.controls.daily_limit_min * 60 : false,
      clips_version: buddy ? `${buddy.pack.slug}-${buddy.pack.version}` : null,
    };
  }

  // Everything that does not depend on the child's words happens at the tap:
  // the gate, the child and Buddy, the day, and the recognition socket, so
  // the child's first syllable already streams to the recogniser.
  private async onTurnStart(turnId: string): Promise<void> {
    // A new tap interrupts whatever Buddy was doing.
    if (this.turn && this.turn.phase !== 'done') this.stopTurn(this.turn);
    this.turn = null;
    const { db, gateway } = this.deps;
    const device = (await db.query<DeviceRow>('SELECT id, status, child_id FROM device WHERE id = $1', [this.device!.id])).rows[0];
    if (!device || device.status === 'disabled' || device.status === 'revoked') return this.close(CLOSE.BLOCKED, 'toy blocked');
    this.device = device;

    const loaded = await this.loadChild();
    const [buddy, people, lexicon] = loaded
      ? await Promise.all([activeBuddy(db, loaded.child.id), loadPeople(db, loaded.child.id), loadLexicon(db, loaded.child.id)])
      : [null, [], []];
    const blocked = this.gate(loaded, buddy);
    if (blocked || !loaded || !buddy) {
      this.send({ type: 'play_clip', turn_id: turnId, clip: blocked ?? 'napping' });
      this.send({ type: 'turn_done', turn_id: turnId, result: 'blocked' });
      return;
    }

    const language = speechLanguage(loaded.child, buddy.instance);
    const abort = new AbortController();
    const prefetch = prefetchFor(this.deps, loaded.child, buddy.instance, loaded.controls);
    // Buddy's last words, unless the chat has gone quiet long enough to be a new one.
    const recent = Date.now() - this.lastTurnAt < this.deps.config.voice.sessionIdleMs;
    const before = recent ? ([...this.history].reverse().find((m) => m.role === 'assistant')?.content ?? null) : null;
    let t: TurnState | undefined;
    const stt = gateway.openTranscription({
      language,
      // A name that is also an ordinary word is already in the recogniser's
      // vocabulary; biasing towards it only invites a stray capital. The
      // child's own words (a toy, a cartoon) are what it may not know.
      keyterms: [
        loaded.child.name, loaded.child.nickname ?? '', buddy.pack.name,
        ...people.filter((p) => !alsoWord(p)).map((p) => p.display_name), ...speechTerms(lexicon),
      ],
      previousText: before,
      signal: abort.signal,
      // Bound to this turn's state, so a late partial from an older stream lands on a finished turn.
      onPartial: (text) => t && this.onPartial(t, text),
    });
    t = {
      id: turnId, bytes: 0, abort, phase: 'listening', loaded, buddy, language, cards: people, before, habits: speechHabits(lexicon),
      stt, tone: new ToneMeter(), greet: false, prefetch, partial: '', spec: null, specAbort: null, specCount: 0,
    };
    this.turn = t;
    this.send({ type: 'face', turn_id: turnId, emotion: 'listening', phase: 'listening' });
  }

  // Denials carry no reason to the toy; the clip is the whole answer.
  private gate(loaded: Loaded | null, buddy: unknown): 'napping' | 'sleepy' | null {
    if (!loaded || !buddy) return 'napping';
    // An answer costs one credit; an empty wallet looks the same as a
    // napping toy, and the parent sees the balance in the app.
    if (loaded.credits < 1) return 'napping';
    const local = localTime(loaded.child.time_zone);
    if (inQuietHours(loaded.controls, local.hour, local.minute)) return 'sleepy';
    if (loaded.controls.daily_limit_min !== null && loaded.usedSeconds >= loaded.controls.daily_limit_min * 60) return 'sleepy';
    return null;
  }

  private onAudio(buf: Buffer): void {
    const t = this.turn;
    const frame = decodeFrame(buf);
    if (!t || t.phase !== 'listening' || !frame || frame.direction !== UPLINK) return;
    const max = this.deps.config.voice.maxTurnSeconds * SAMPLE_RATE * 2;
    if (t.bytes + frame.payload.length > max) {
      this.onTurnEnd({ type: 'turn_end', turn_id: t.id, reason: 'cap', text: null });
      return;
    }
    t.bytes += frame.payload.length;
    t.stt.write(frame.payload);
    t.tone?.push(frame.payload);
  }

  // The partial holding the child's last words usually lands a few hundred
  // milliseconds before turn_end (the toy waits for a second of silence), so
  // speculating on every new partial starts the classifier before the final
  // words are committed.
  private onPartial(t: TurnState, text: string): void {
    // A repeated or re-punctuated partial is not new words.
    if (t.phase !== 'listening' || textKey(text) === textKey(t.partial)) return;
    t.partial = text;
    if (t.specCount < MAX_SPECULATIONS) this.speculateOn(t, text);
  }

  // Classify and recall on words heard so far; runTurn reuses the result when
  // the final transcript says the same thing.
  private speculateOn(t: TurnState, text: string): void {
    const key = textKey(text);
    if (!key || t.spec?.key === key) return;
    // Words the child has since talked past will not be the final transcript.
    t.specAbort?.abort();
    t.specAbort = new AbortController();
    t.specCount += 1;
    t.spec = speculate(
      this.deps,
      { childId: t.loaded.child.id, instanceId: t.buddy.instance.id, cards: t.cards, before: t.before, habits: t.habits },
      text, t.language, AbortSignal.any([t.abort.signal, t.specAbort.signal]),
    );
  }

  // Stops everything a turn still has running: the model and database calls
  // behind its signal (speculations included) and the recognition socket.
  private stopTurn(t: TurnState): void {
    t.phase = 'done';
    t.abort.abort();
    t.stt.close();
  }

  private onCancel(turnId: string): void {
    const t = this.turn;
    if (!t || t.id !== turnId || t.phase === 'done') return;
    this.stopTurn(t);
    this.send({ type: 'turn_done', turn_id: turnId, result: 'cancelled' });
  }

  private async ensureChatSession(childId: string, instanceId: string): Promise<boolean> {
    const { db, config } = this.deps;
    const idle = Date.now() - this.lastTurnAt > config.voice.sessionIdleMs;
    if (this.chatSessionId && !idle) return false;
    if (this.chatSessionId) await db.query('UPDATE chat_session SET ended_at = now() WHERE id = $1 AND ended_at IS NULL', [this.chatSessionId]);
    const r = await db.query<{ id: string }>(
      'INSERT INTO chat_session (child_id, instance_id, device_id) VALUES ($1, $2, $3) RETURNING id',
      [childId, instanceId, this.device!.id],
    );
    this.chatSessionId = r.rows[0].id;
    this.history = [];
    this.questionStreak = 0;
    this.game = null;
    this.gamesPlayed = [];
    this.turnsSinceGame = 99;
    this.turnCount = 0;
    this.shown = { goal: false, words: false, growth: false };
    this.clarifiedLast = false;
    return true;
  }

  // Only the state change happens in order; the turn itself runs beside the
  // inbox, so a cancel can still arrive while Buddy is thinking or speaking.
  private onTurnEnd(msg: Extract<ToyMessage, { type: 'turn_end' }>): void {
    const t = this.turn;
    if (!t || t.id !== msg.turn_id || t.phase !== 'listening') return;
    t.phase = 'processing';
    const timing: TurnTiming = { endAt: performance.now() };
    void this.processTurn(t, msg, timing).catch((err) => {
      this.deps.log.error('turn crashed', { device_id: this.device?.id, error: err });
      if ((t.phase as TurnState['phase']) === 'done') return;
      this.stopTurn(t);
      if (this.turn === t) this.turn = null;
      this.send({ type: 'play_clip', turn_id: t.id, clip: 'didnt_catch' });
      this.send({ type: 'turn_done', turn_id: t.id, result: 'failed' });
    });
  }

  // The final words: a typed dev turn, nothing for a clip too short to hold a
  // word, otherwise the recogniser's commit. The commit goes out now; the
  // classifier and recall start on the last partial while it comes back.
  private hear(t: TurnState, msg: Extract<ToyMessage, { type: 'turn_end' }>): Promise<string> {
    const typed = this.deps.config.voice.allowTextTurns ? msg.text?.trim() : '';
    if (typed || t.bytes < MIN_SPEECH_BYTES) {
      t.stt.close();
      return Promise.resolve(typed ?? '');
    }
    const transcript = t.stt.finish().then((text) => this.secondOpinion(t, text));
    if (t.partial) this.speculateOn(t, t.partial);
    return transcript;
  }

  // A stream that came back empty, or with far too few words for the speech
  // the child made (under one word per two seconds of voice), gets a second
  // opinion from batch recognition on the audio it kept. It costs about a
  // second, so only those turns pay it.
  private async secondOpinion(t: TurnState, heard: string): Promise<string> {
    const voiced = t.tone?.read(0)?.voicedSeconds ?? 0;
    const count = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
    if (voiced < 1 || count(heard) >= voiced * 0.5) return heard;
    const second = await t.stt.recheck().catch(() => '');
    const better = count(second) > count(heard);
    this.deps.log.info('stt second opinion', { device_id: this.device?.id, turn_id: t.id, voiced_s: Math.round(voiced * 10) / 10, better });
    return better ? second : heard;
  }

  private async processTurn(t: TurnState, msg: Extract<ToyMessage, { type: 'turn_end' }>, timing: TurnTiming): Promise<void> {
    const { log } = this.deps;
    const { child, controls, usedSeconds } = t.loaded;
    this.send({ type: 'face', turn_id: t.id, emotion: 'thinking', phase: 'thinking' });

    const transcript = t.greet ? Promise.resolve('') : this.hear(t, msg);
    // runTurn awaits the transcript; this handler only keeps a failure that
    // lands during the session write below from counting as unhandled.
    transcript.catch(() => {});
    const firstTurn = await this.ensureChatSession(child.id, t.buddy.instance.id);
    const chunker = new FrameChunker();
    const serverTurnId = randomUUID();
    const seed = `${this.chatSessionId}:${this.turnCount}`;
    // A typed turn has no voice to read.
    const typed = this.deps.config.voice.allowTextTurns && Boolean(msg.text?.trim());

    const outcome = await runTurn({
      deps: this.deps,
      child,
      buddy: t.buddy,
      controls,
      usedSeconds,
      sessionId: this.chatSessionId!,
      firstTurn,
      history: this.history,
      questionStreak: this.questionStreak,
      serverTurnId,
      cards: t.cards,
      play: {
        active: this.game ? (GAMES.find((g) => g.id === this.game!.id) ?? null) : null,
        wantsToPlay: wantsToPlay(t.buddy.instance.playfulness, this.turnsSinceGame, seed),
        played: this.gamesPlayed,
        seed,
      },
      allow: { goal: !this.shown.goal, words: !this.shown.words, growth: !this.shown.growth, clarify: !this.clarifiedLast },
      before: t.before,
      habits: t.habits,
      tone: typed ? null : t.tone,
      greet: t.greet,
      transcript,
      speculation: t.spec,
      prefetch: t.prefetch,
      timing,
      signal: t.abort.signal,
      send: (m) => this.send({ ...m, turn_id: t.id }),
      sendAudio: (pcm) => {
        for (const payload of chunker.push(pcm)) this.sendFrame(payload);
      },
    });

    // A cancel can land while runTurn is awaiting; the toy already has its turn_done.
    if ((t.phase as TurnState['phase']) === 'done') return;
    // Also ends speculations the final words did not need.
    this.stopTurn(t);
    if (this.turn === t) this.turn = null;
    const last = chunker.flush();
    if (last) this.sendFrame(last);
    if (outcome.result === 'answered') this.send({ type: 'audio_end', turn_id: t.id });
    if (outcome.result === 'no_speech' || outcome.result === 'failed') this.send({ type: 'play_clip', turn_id: t.id, clip: 'didnt_catch' });
    this.send({ type: 'turn_done', turn_id: t.id, result: outcome.result });
    this.lastTurnAt = Date.now();
    log.info('turn timing', {
      device_id: this.device?.id, turn_id: t.id, result: outcome.result, stt_ms: timing.sttMs, context_ms: timing.contextMs,
      first_token_ms: timing.firstTokenMs, first_audio_ms: timing.firstAudioMs, reused: timing.reused, spec_lead_ms: timing.specLeadMs,
      speculations: t.specCount,
    });

    if (outcome.result === 'answered') {
      try {
        await this.persist(child, serverTurnId, outcome, pcmSeconds(t.bytes));
      } catch (err) {
        log.error('turn persist failed', { child_id: child.id, error: err });
      }
      if (outcome.childText) this.history.push({ role: 'user', content: outcome.childText });
      this.history.push({ role: 'assistant', content: outcome.replyText });
      if (this.history.length > 12) this.history.splice(0, this.history.length - 12);
      this.questionStreak = outcome.replyText.includes('?') ? this.questionStreak + 1 : 0;
      this.afterTurn(outcome);
    }
  }

  private afterTurn(outcome: TurnOutcome): void {
    this.turnCount += 1;
    this.clarifiedLast = outcome.clarified;
    if (outcome.goalShown) this.shown.goal = true;
    if (outcome.wordsShown) this.shown.words = true;
    if (outcome.mirroredFactId) this.shown.growth = true;
    const g = outcome.game;
    if (!g) {
      this.game = null;
      this.turnsSinceGame += 1;
      return;
    }
    this.turnsSinceGame = 0;
    if (!this.gamesPlayed.includes(g.id)) this.gamesPlayed.push(g.id);
    const turns = g.continues && this.game?.id === g.id ? this.game.turns + 1 : 1;
    // A game runs a few turns at most; then Buddy follows the child again.
    this.game = turns >= 4 ? null : { id: g.id, turns };
  }

  // Speaking first (product decision: off for now). Only when the operator
  // allows it for the whole service and the parent opted in, within the
  // same gate as a tap, once a day, after the child has been away a while.
  private async maybeGreet(): Promise<void> {
    const { config, db } = this.deps;
    if (!config.voice.speakFirst || (this.turn && this.turn.phase !== 'done')) return;
    const loaded = await this.loadChild();
    if (!loaded?.controls.speak_first) return;
    const buddy = await activeBuddy(db, loaded.child.id);
    if (this.gate(loaded, buddy) || !buddy) return;
    const recent = await db.query(
      `SELECT 1 FROM turn WHERE child_id = $1
         AND (created_at > now() - interval '3 hours' OR (turn_type = 'greet' AND created_at > now() - interval '20 hours'))
       LIMIT 1`,
      [loaded.child.id],
    );
    if (recent.rowCount) return;
    const turnId = randomUUID();
    const silent: SttStream = { write() {}, finish: async () => '', recheck: async () => '', close() {} };
    const t: TurnState = {
      id: turnId, bytes: 0, abort: new AbortController(), phase: 'processing', loaded, buddy, language: speechLanguage(loaded.child, buddy.instance),
      cards: [], before: null, habits: [], stt: silent, tone: null, greet: true, prefetch: prefetchFor(this.deps, loaded.child, buddy.instance, loaded.controls),
      partial: '', spec: null, specAbort: null, specCount: 0,
    };
    this.turn = t;
    // The toy learns the turn is Buddy's before any face or audio arrives.
    this.send({ type: 'buddy_turn', turn_id: turnId });
    void this.processTurn(t, { type: 'turn_end', turn_id: turnId, reason: 'tap', text: null }, { endAt: performance.now() }).catch((err) => {
      this.deps.log.error('greeting crashed', { device_id: this.device?.id, error: err });
      if ((t.phase as TurnState['phase']) !== 'done') this.stopTurn(t);
    });
  }

  private sendFrame(payload: Buffer): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(encodeFrame(DOWNLINK, this.seqDown++, payload));
  }

  private async persist(child: ChildRow, serverTurnId: string, outcome: TurnOutcome, childSeconds: number): Promise<void> {
    const { db, queue, digests } = this.deps;
    const day = new Date().toISOString().slice(0, 10);
    if (!partitionsReady.has(day)) {
      await db.query('SELECT ensure_turn_partition($1::date)', [day]);
      partitionsReady.add(day);
    }
    const replySeconds = pcmSeconds(outcome.replyBytes);
    const local = localTime(child.time_zone);
    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO turn (id, session_id, child_id, child_text, reply_text, face, turn_type, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [serverTurnId, this.chatSessionId, child.id, outcome.childText, outcome.replyText, outcome.face, outcome.turnType, outcome.language],
      );
      await q.query(
        'UPDATE chat_session SET turns = turns + 1, talk_seconds = talk_seconds + $2 WHERE id = $1',
        [this.chatSessionId, Math.round(childSeconds + replySeconds)],
      );
      await q.query(
        `INSERT INTO usage_daily (child_id, day, turns, talk_seconds, stt_seconds, tokens_in, tokens_cached, tokens_out, tts_chars)
         VALUES ($1, $2::date, 1, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (child_id, day) DO UPDATE SET
           turns = usage_daily.turns + 1, talk_seconds = usage_daily.talk_seconds + EXCLUDED.talk_seconds,
           stt_seconds = usage_daily.stt_seconds + EXCLUDED.stt_seconds, tokens_in = usage_daily.tokens_in + EXCLUDED.tokens_in,
           tokens_cached = usage_daily.tokens_cached + EXCLUDED.tokens_cached, tokens_out = usage_daily.tokens_out + EXCLUDED.tokens_out,
           tts_chars = usage_daily.tts_chars + EXCLUDED.tts_chars`,
        [child.id, local.date, Math.round(childSeconds + replySeconds), Math.round(childSeconds), outcome.usage.inputTokens, outcome.usage.cachedTokens, outcome.usage.outputTokens, outcome.ttsChars],
      );
      if (outcome.dueHandled?.kind === 'event') await q.query("UPDATE child_event SET status = 'followed_up' WHERE id = $1", [outcome.dueHandled.id]);
      if (outcome.dueHandled?.kind === 'promise') await q.query("UPDATE relationship_item SET status = 'kept', last_used_at = now() WHERE id = $1", [outcome.dueHandled.id]);
      if (outcome.nudgeIds.length) await q.query("UPDATE nudge SET status = 'used', used_at = now() WHERE id = ANY($1::uuid[])", [outcome.nudgeIds]);
      if (outcome.mirroredFactId) await q.query('UPDATE fact SET mirrored_at = now() WHERE id = $1', [outcome.mirroredFactId]);
      // A credit pays for an answer to the child: Buddy greeting first or
      // asking again after unclear speech answered nothing, so costs nothing.
      if (outcome.childText && outcome.turnType !== 'greet' && outcome.turnType !== 'clarify') {
        await chargeTurn(q, { familyId: child.family_id, childId: child.id, turnId: serverTurnId });
      }
      // Which games keep this child playing, and their usual voice, are
      // things Buddy learns about them: only with learning on.
      if (child.learning_enabled && outcome.game) {
        const kept = outcome.game.continues;
        await q.query(
          `INSERT INTO what_works (child_id, key, attempts, successes) VALUES ($1, $2, $3, $4)
           ON CONFLICT (child_id, key) DO UPDATE SET attempts = what_works.attempts + EXCLUDED.attempts,
             successes = what_works.successes + EXCLUDED.successes, updated_at = now()`,
          [child.id, `play:${outcome.game.id}`, kept ? 0 : 1, kept ? 1 : 0],
        );
      }
      if (child.learning_enabled && outcome.tone) {
        const old = (await q.query<VoiceBaseline>(
          'SELECT turns, loudness_mean, loudness_m2, pitch_mean, pitch_m2, pace_mean, pace_m2 FROM voice_baseline WHERE child_id = $1 FOR UPDATE',
          [child.id],
        )).rows[0] ?? null;
        const b = foldBaseline(old, outcome.tone);
        if (b) {
          await q.query(
            `INSERT INTO voice_baseline (child_id, turns, loudness_mean, loudness_m2, pitch_mean, pitch_m2, pace_mean, pace_m2)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (child_id) DO UPDATE SET turns = $2, loudness_mean = $3, loudness_m2 = $4, pitch_mean = $5, pitch_m2 = $6,
               pace_mean = $7, pace_m2 = $8, updated_at = now()`,
            [child.id, b.turns, b.loudness_mean, b.loudness_m2, b.pitch_mean, b.pitch_m2, b.pace_mean, b.pace_m2],
          );
        }
      }
      // Buddy speaking first gives the learner no words of the child's.
      if (child.learning_enabled && outcome.childText) await queue.enqueue('learn-turn', { turn_id: serverTurnId }, { q });
    });
    digests.invalidate(child.id);
  }

  private async onClose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.helloTimer);
    clearInterval(this.pingTimer);
    if (this.turn) this.stopTurn(this.turn);
    if (this.device && this.registry.get(this.device.id) === this) this.registry.delete(this.device.id);
    if (this.chatSessionId) {
      await this.deps.db.query('UPDATE chat_session SET ended_at = now() WHERE id = $1 AND ended_at IS NULL', [this.chatSessionId]).catch(() => {});
    }
  }
}

export { speechLanguage };
