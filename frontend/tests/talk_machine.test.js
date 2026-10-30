import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWER_WAIT_MS, CLOSE, MAX_MESSAGES, MAX_RECONNECTS, PLAYOUT_GRACE_MS, SLOW_DOWN_MS, TURN_ID_RE, VOICE_WAIT_MS, canListen, canSend,
  cancelMessage, dueIn, gateFor, helloMessage, initialState, newTurnId, reconnectPlan, reduce, stallPlan, statusMessage, tapAction,
  turnEndMessage, turnStartMessage, watch,
} from '../src/talk/machine.js';

// backend-v2's own parser for what a toy sends, when this Node can load
// TypeScript (23.6 and later strip the types themselves).
const protocol = await import('../../backend-v2/src/voice/protocol.ts').catch(() => null);

const run = (events, from = initialState) => events.reduce(reduce, from);
const ready = run([{ type: 'ready' }]);
const listening = run([{ type: 'mic_opening' }, { type: 'mic_on' }], ready);
const DEVICE = '3f2b6a1e-9c4d-4e8f-a1b2-c3d4e5f60718';

// A voice turn up to Buddy's answer face, as the server sends it.
const answering = (id, emotion = 'happy') => run([
  { type: 'start', turn_id: id, mode: 'voice' },
  { type: 'face', turn_id: id, emotion: 'listening', phase: 'listening' },
  { type: 'end', turn_id: id },
  { type: 'face', turn_id: id, emotion: 'thinking', phase: 'thinking' },
  { type: 'face', turn_id: id, emotion, phase: 'speaking' },
], listening);

test('connects, then the mic opens on its own and the button mutes it', () => {
  assert.equal(initialState.status, 'connecting');
  assert.equal(initialState.mic, 'off');
  assert.equal(ready.status, 'idle');
  assert.equal(tapAction(initialState), null, 'no taps before the toy has signed in');
  assert.equal(tapAction(ready), 'listen', 'with the mic closed, a tap opens it');
  const opening = reduce(ready, { type: 'mic_opening' });
  assert.equal(opening.mic, 'opening');
  assert.equal(tapAction(opening), null, 'nothing to do while the browser asks for permission');
  assert.equal(listening.mic, 'on');
  assert.equal(tapAction(listening), 'mute');
  assert.equal(canListen(listening), true);
  const refused = reduce(opening, { type: 'mic_off', error: 'mic_denied' });
  assert.equal(refused.mic, 'off');
  assert.equal(refused.error, 'mic_denied');
  assert.equal(tapAction(refused), 'listen', 'a tap tries the mic again');
});

test('a voice turn listens at once, thinks, shows the face, speaks, and settles', () => {
  let s = reduce(listening, { type: 'start', turn_id: 't1', mode: 'voice' });
  assert.equal(s.status, 'listening', 'no turn_accepted in backend-v2: frames go right away');
  assert.equal(s.turnId, 't1');
  assert.equal(s.emotion, 'listening');
  assert.equal(tapAction(s), 'end', 'a tap sends now');
  assert.equal(canListen(s), false);

  s = reduce(s, { type: 'face', turn_id: 't1', emotion: 'listening', phase: 'listening' });
  assert.equal(s.status, 'listening', 'the gate let it through; nothing changes');
  s = reduce(s, { type: 'end', turn_id: 't1' });
  assert.equal(s.status, 'thinking');
  assert.equal(tapAction(s), null, 'a stray tap does not throw the answer away');
  assert.equal(canSend(s), false);

  s = reduce(s, { type: 'face', turn_id: 't1', emotion: 'thinking', phase: 'thinking' });
  assert.equal(s.status, 'thinking');
  s = reduce(s, { type: 'face', turn_id: 't1', emotion: 'happy', phase: 'speaking' });
  assert.equal(s.status, 'answered');
  assert.equal(s.emotion, 'happy');
  assert.equal(tapAction(s), 'interrupt', 'Buddy can be cut short before it starts');

  s = reduce(s, { type: 'audio', turn_id: 't1' });
  assert.equal(s.status, 'speaking');
  assert.equal(s.playing, true);
  s = reduce(s, { type: 'face', turn_id: 't1', emotion: 'excited', phase: 'speaking' });
  assert.equal(s.status, 'speaking', 'a second face mid-answer keeps it speaking');
  assert.equal(s.emotion, 'excited');

  s = reduce(s, { type: 'turn_done', turn_id: 't1', result: 'answered' });
  assert.equal(s.status, 'speaking', 'the voice keeps playing after the debit');
  assert.equal(s.turnId, null);
  assert.equal(canListen(s), false, 'its own voice must not start a turn');
  assert.equal(tapAction(s), 'interrupt');

  s = reduce(s, { type: 'playback_end' });
  assert.equal(s.status, 'idle');
  assert.equal(s.emotion, 'excited', 'the face keeps the answer until the next turn');
  assert.equal(canListen(s), true);
  assert.equal(s.mic, 'on', 'hands-free: the mic was never closed');
  assert.deepEqual(s.messages.map((m) => [m.from, Boolean(m.voice), m.kind ?? null]), [['child', true, null], ['buddy', false, 'answer']]);
});

test('playback that ends before turn_done waits for it', () => {
  const s = run([{ type: 'audio', turn_id: 't1' }, { type: 'playback_end' }], answering('t1', 'love'));
  assert.equal(s.status, 'answered');
  const done = reduce(s, { type: 'turn_done', turn_id: 't1', result: 'answered' });
  assert.equal(done.status, 'idle');
  assert.equal(done.emotion, 'love');
});

test('the server ending a long turn itself moves the screen to thinking', () => {
  const s = run([{ type: 'start', turn_id: 'c1', mode: 'voice' }, { type: 'face', turn_id: 'c1', emotion: 'thinking', phase: 'thinking' }], listening);
  assert.equal(s.status, 'thinking');
  assert.equal(s.emotion, 'thinking');
});

test('a refused turn shows its clip, settles as denied, and a tap may try again', () => {
  let s = run([{ type: 'start', turn_id: 'b1', mode: 'voice' }, { type: 'clip', turn_id: 'b1', clip: 'napping' }], listening);
  assert.equal(s.clip, 'napping');
  assert.equal(s.emotion, 'sleepy');
  s = reduce(s, { type: 'turn_done', turn_id: 'b1', result: 'blocked' });
  assert.equal(s.status, 'denied');
  assert.equal(s.turnId, null);
  assert.equal(s.clip, 'napping');
  s = reduce(s, { type: 'mic_off' });
  assert.equal(tapAction(s), 'listen', 'useWebToy closes the mic; a tap opens it again');
  assert.equal(canListen(s), true);
  assert.equal(s.messages.at(-1).clip, 'napping');

  const sleepy = run([{ type: 'start', turn_id: 'b2', mode: 'voice' }, { type: 'clip', turn_id: 'b2', clip: 'sleepy' }, { type: 'turn_done', turn_id: 'b2', result: 'blocked' }], listening);
  assert.equal(sleepy.clip, 'sleepy');
  const bare = run([{ type: 'start', turn_id: 'b3', mode: 'voice' }, { type: 'turn_done', turn_id: 'b3', result: 'blocked' }], listening);
  assert.equal(bare.clip, 'napping', 'a refusal without a clip reads as napping');
  assert.equal(reduce(bare, { type: 'start', turn_id: 'n1', mode: 'voice' }).clip, null, 'the next turn forgets the clip');

  // Credits bought or a Buddy set up: the refusal no longer stands.
  const resumed = reduce(bare, { type: 'resume' });
  assert.equal(resumed.status, 'idle');
  assert.equal(resumed.clip, null);
  assert.equal(resumed.emotion, 'neutral');
  assert.equal(reduce(listening, { type: 'resume' }), listening, 'nothing to resume when nothing was refused');
});

test('nothing heard: the didnt_catch clip, a confused face, and the mic stays open', () => {
  const s = run([
    { type: 'start', turn_id: 'q1', mode: 'voice' }, { type: 'end', turn_id: 'q1' },
    { type: 'face', turn_id: 'q1', emotion: 'thinking', phase: 'thinking' },
    { type: 'clip', turn_id: 'q1', clip: 'didnt_catch' }, { type: 'turn_done', turn_id: 'q1', result: 'no_speech' },
  ], listening);
  assert.equal(s.status, 'idle');
  assert.equal(s.emotion, 'confused');
  assert.equal(s.clip, 'didnt_catch');
  assert.equal(s.mic, 'on');
  assert.equal(tapAction(s), 'mute');
});

test('an answer that fails halfway lets what was said finish', () => {
  const s = run([{ type: 'audio', turn_id: 'f1' }, { type: 'turn_done', turn_id: 'f1', result: 'failed' }], answering('f1'));
  assert.equal(s.status, 'speaking');
  assert.equal(s.turnId, null);
  assert.equal(s.clip, 'didnt_catch');
  assert.equal(reduce(s, { type: 'playback_end' }).status, 'idle');
  const quiet = run([{ type: 'turn_done', turn_id: 'f2', result: 'failed' }], answering('f2'));
  assert.equal(quiet.status, 'idle');
  assert.equal(quiet.emotion, 'confused');
});

test('a tap the voice service fails to start ends cleanly in every state, face or no face', () => {
  // backend-v2 answers a turn_start it cannot open (its database, the
  // recogniser) with the didnt_catch clip and turn_done failed, and no face.
  const failed = (id) => [{ type: 'clip', turn_id: id, clip: 'didnt_catch' }, { type: 'turn_done', turn_id: id, result: 'failed' }];
  const settledAfter = (s, what) => {
    assert.equal(s.status, 'idle', what);
    assert.equal(s.turnId, null, what);
    assert.equal(s.mode, null, what);
    assert.equal(s.playing, false, what);
    assert.equal(s.clip, 'didnt_catch', what);
    assert.equal(s.emotion, 'confused', what);
    assert.equal(canListen(s), true, `${what}: listening again`);
  };

  // The child is still talking: no face has come, turn_end has not gone.
  const talking = run([{ type: 'start', turn_id: 'v1', mode: 'voice' }, ...failed('v1')], listening);
  settledAfter(talking, 'before any face');
  assert.equal(talking.mic, 'on', 'the mic stays open for another try');
  assert.equal(tapAction(talking), 'mute');
  assert.deepEqual(talking.messages.map((m) => [m.from, m.clip ?? null]), [['buddy', 'didnt_catch']]);

  // turn_end already went out (the database was slow to fail).
  const waiting = run([{ type: 'start', turn_id: 'v2', mode: 'voice' }, { type: 'end', turn_id: 'v2' }, ...failed('v2')], listening);
  settledAfter(waiting, 'after turn_end');
  assert.deepEqual(waiting.messages.map((m) => m.from), ['child', 'buddy']);

  // The listening face came first after all.
  settledAfter(run([{ type: 'start', turn_id: 'v3', mode: 'voice' }, { type: 'face', turn_id: 'v3', emotion: 'listening', phase: 'listening' }, ...failed('v3')], listening), 'after the listening face');

  // A typed turn, and a turn opened after a refusal (the mic tapped back on).
  settledAfter(run([{ type: 'start', turn_id: 'x1', mode: 'text', text: 'hi' }, ...failed('x1')], ready), 'a typed turn');
  const denied = run([{ type: 'start', turn_id: 'b1', mode: 'voice' }, { type: 'clip', turn_id: 'b1', clip: 'napping' }, { type: 'turn_done', turn_id: 'b1', result: 'blocked' }, { type: 'mic_off' }], listening);
  settledAfter(run([{ type: 'mic_opening' }, { type: 'mic_on' }, { type: 'start', turn_id: 'v4', mode: 'voice' }, ...failed('v4')], denied), 'after a refusal');

  // A turn this page already let go of, while the next one is open: nothing moves.
  const next = run([{ type: 'start', turn_id: 'v5', mode: 'voice' }, { type: 'end', turn_id: 'v5' }, { type: 'stalled', turn_id: 'v5' }, { type: 'start', turn_id: 'v6', mode: 'voice' }], listening);
  assert.equal(run(failed('v5'), next), next);

  // The watchdog, as useWebToy feeds it (the clip is progress): nothing is
  // armed before turn_end, and turn_done lets go of a wait turn_end began.
  const asDog = (id) => [{ type: 'progress', turn_id: id }, { type: 'turn_done', turn_id: id }];
  assert.equal(asDog('v1').reduce((d, e) => watch(d, e, 10, 3), null), null, 'a clip before turn_end arms nothing');
  const dog = watch(watch(null, { type: 'wait', turn_id: 'v2' }, 0, 4), asDog('v2')[0], 400, 5);
  assert.equal(dueIn(dog, 400), VOICE_WAIT_MS, 'the clip shortens the wait for turn_done');
  assert.equal(watch(dog, asDog('v2')[1], 401), null);
});

test('the page gives up on a turn the server never finishes', () => {
  // Nothing back after turn_end: about 30 seconds.
  let dog = watch(null, { type: 'wait', turn_id: 'w1' }, 1000, 7);
  assert.deepEqual(dog, { turnId: 'w1', ms: ANSWER_WAIT_MS, since: 1000, heard: 7 });
  assert.equal(ANSWER_WAIT_MS, 30_000);
  assert.equal(dueIn(dog, 1000), ANSWER_WAIT_MS);
  assert.equal(dueIn(dog, 1000 + ANSWER_WAIT_MS - 1), 1);
  assert.equal(dueIn(dog, 1000 + ANSWER_WAIT_MS + 500), 0, 'a timer that fires late gives up at once');
  assert.equal(dueIn(null, 1000), null, 'nothing awaited');

  // Buddy answering: each face, frame, clip or audio_end starts a shorter wait.
  assert.ok(VOICE_WAIT_MS < ANSWER_WAIT_MS);
  dog = watch(dog, { type: 'progress', turn_id: 'w1' }, 9000, 9);
  assert.equal(dueIn(dog, 9000), VOICE_WAIT_MS);
  assert.equal(dog.heard, 9, 'the count moves with the turn');
  dog = watch(dog, { type: 'progress', turn_id: 'w1', aheadMs: 220 }, 9020, 10);
  assert.equal(dueIn(dog, 9020), VOICE_WAIT_MS, 'a short queue changes nothing');
  // A story that came faster than it is spoken is never cut short.
  dog = watch(dog, { type: 'progress', turn_id: 'w1', aheadMs: 40_000 }, 9040, 11);
  assert.equal(dueIn(dog, 9040), 40_000 + PLAYOUT_GRACE_MS);

  // Another turn's messages change nothing; this one's turn_done ends the watch.
  for (const e of [{ type: 'progress', turn_id: 'old' }, { type: 'turn_done', turn_id: 'old' }, { type: 'face' }]) {
    assert.equal(watch(dog, e, 9100, 12), dog, e.type);
  }
  assert.equal(watch(null, { type: 'turn_done', turn_id: 'w1' }, 9100), null);
  assert.equal(watch(dog, { type: 'turn_done', turn_id: 'w1' }, 9100), null);
  assert.equal(watch(dog, { type: 'wait', turn_id: 'w2' }, 9200, 12).turnId, 'w2', 'a new wait replaces the old one');
});

test('after giving up: listen again on a live socket, start over on a dead one', () => {
  const waited = watch(null, { type: 'wait', turn_id: 's1' }, 0, 5);
  assert.equal(stallPlan({ open: true, heard: 6, dog: waited }), 'rearm', 'the thinking face came, then nothing: the turn got lost');
  assert.equal(stallPlan({ open: true, heard: 5, dog: waited }), 'reconnect', 'not a word since turn_end');
  assert.equal(stallPlan({ open: false, heard: 9, dog: waited }), 'reconnect', 'a socket that is no longer open');
  // Buddy's voice stopped halfway: the frames before prove nothing about now.
  const midAnswer = watch(waited, { type: 'progress', turn_id: 's1' }, 3000, 80);
  assert.equal(stallPlan({ open: true, heard: 80, dog: midAnswer }), 'reconnect');
  assert.equal(stallPlan({ open: true, heard: 81, dog: midAnswer }), 'rearm');
});

test('a turn given up on: Buddy says so, listens again, and the line stays until the next turn', () => {
  const thinking = run([{ type: 'start', turn_id: 'g1', mode: 'voice' }, { type: 'end', turn_id: 'g1' }], listening);
  const s = reduce(thinking, { type: 'stalled', turn_id: 'g1' });
  assert.equal(s.status, 'idle');
  assert.equal(s.turnId, null);
  assert.equal(s.mode, null);
  assert.equal(s.notice, 'stalled');
  assert.equal(s.emotion, 'confused');
  assert.equal(s.mic, 'on', 'hands-free: the mic was never closed');
  assert.equal(canListen(s), true);
  assert.equal(tapAction(s), 'mute');
  assert.equal(reduce(thinking, { type: 'stalled', turn_id: 'other' }), thinking, 'only the open turn');

  // Mid-answer the voice stops with it, and the late turn_done matches nothing.
  const cut = reduce(run([{ type: 'audio', turn_id: 'g2' }], answering('g2')), { type: 'stalled', turn_id: 'g2' });
  assert.equal(cut.status, 'idle');
  assert.equal(cut.playing, false);
  assert.equal(reduce(cut, { type: 'turn_done', turn_id: 'g2', result: 'answered' }), cut);

  // A reconnect first: the line outlives it, and goes with the next turn.
  const back = run([{ type: 'mic_off' }, { type: 'connecting' }, { type: 'ready' }], s);
  assert.equal(back.notice, 'stalled');
  assert.equal(reduce(back, { type: 'start', turn_id: 'g3', mode: 'voice' }).notice, null);
  for (const e of [{ type: 'closed', code: CLOSE.BLOCKED }, { type: 'closed', code: CLOSE.REPLACED }, { type: 'asleep' }, { type: 'offline' }, { type: 'conversation_new' }]) {
    assert.equal(reduce(s, e).notice, null, `${e.type} ${e.code ?? ''}`);
  }

  // Buddy's own greeting that never came asked nothing of the child.
  const quiet = run([{ type: 'buddy_turn', turn_id: 'b1' }, { type: 'stalled', turn_id: 'b1' }], listening);
  assert.equal(quiet.status, 'idle');
  assert.equal(quiet.notice, null);
  assert.equal(quiet.emotion, 'neutral');
  assert.equal(canListen(quiet), true);
});

test('interrupting cancels the open turn and its late turn_done is ignored', () => {
  let s = run([{ type: 'audio', turn_id: 'i1' }], answering('i1'));
  assert.equal(tapAction(s), 'interrupt');
  s = reduce(s, { type: 'interrupt' });
  assert.equal(s.status, 'idle');
  assert.equal(s.turnId, null);
  assert.equal(s.playing, false);
  assert.equal(canListen(s), true);
  const next = reduce(s, { type: 'start', turn_id: 'i2', mode: 'voice' });
  assert.equal(reduce(next, { type: 'turn_done', turn_id: 'i1', result: 'cancelled' }), next, 'the old turn no longer matches');
  const cancelled = run([{ type: 'turn_done', turn_id: 'i3', result: 'cancelled' }], answering('i3'));
  assert.equal(cancelled.status, 'idle');
});

test('a typed turn shows the message at once and thinks', () => {
  let s = reduce(ready, { type: 'start', turn_id: 'x1', mode: 'text', text: 'why is the sky blue?' });
  assert.equal(s.status, 'thinking', 'nothing to stream for a typed turn');
  assert.equal(tapAction(s), null);
  assert.deepEqual(s.messages.map((m) => [m.from, m.text]), [['child', 'why is the sky blue?']]);
  s = run([{ type: 'face', turn_id: 'x1', emotion: 'curious', phase: 'speaking' }, { type: 'turn_done', turn_id: 'x1', result: 'answered' }], s);
  assert.equal(s.status, 'idle');
  assert.deepEqual(s.messages.map((m) => m.from), ['child', 'buddy']);
  assert.equal(canSend(s), true);
});

test('Buddy speaks first only into a quiet room, and can be cut short', () => {
  let s = reduce(listening, { type: 'buddy_turn', turn_id: 'g1' });
  assert.equal(s.status, 'thinking');
  assert.equal(s.mode, 'buddy');
  assert.equal(tapAction(s), 'interrupt');
  assert.equal(canListen(s), false, 'the child waits while Buddy talks');
  s = run([
    { type: 'face', turn_id: 'g1', emotion: 'thinking', phase: 'thinking' }, { type: 'face', turn_id: 'g1', emotion: 'happy', phase: 'speaking' },
    { type: 'audio', turn_id: 'g1' }, { type: 'turn_done', turn_id: 'g1', result: 'answered' }, { type: 'playback_end' },
  ], s);
  assert.equal(s.status, 'idle');
  assert.equal(s.messages.at(-1).kind, 'greet');

  const childTalking = reduce(listening, { type: 'start', turn_id: 'c1', mode: 'voice' });
  assert.equal(reduce(childTalking, { type: 'buddy_turn', turn_id: 'g2' }), childTalking, 'the child\'s turn wins');
  const stillPlaying = run([{ type: 'audio', turn_id: 'p1' }, { type: 'turn_done', turn_id: 'p1', result: 'answered' }], answering('p1'));
  assert.equal(reduce(stillPlaying, { type: 'buddy_turn', turn_id: 'g3' }), stillPlaying);
});

test('messages for another turn are ignored', () => {
  const s = run([{ type: 'start', turn_id: 'a', mode: 'voice' }, { type: 'end', turn_id: 'a' }], listening);
  for (const e of [
    { type: 'face', turn_id: 'b', emotion: 'happy', phase: 'speaking' }, { type: 'audio', turn_id: 'b' },
    { type: 'clip', turn_id: 'b', clip: 'napping' }, { type: 'turn_done', turn_id: 'b', result: 'answered' }, { type: 'end', turn_id: 'b' },
  ]) assert.equal(reduce(s, e), s, e.type);
});

test('ready says when Buddy is asleep for the night or the day', () => {
  assert.equal(reduce(initialState, { type: 'ready', quietHours: true }).sleepy, 'quiet');
  assert.equal(reduce(initialState, { type: 'ready', limitReached: true }).sleepy, 'limit');
  const s = reduce(initialState, { type: 'ready' });
  assert.equal(s.sleepy, null);
  const answered = run([{ type: 'start', turn_id: 's1', mode: 'voice' }, { type: 'face', turn_id: 's1', emotion: 'happy', phase: 'speaking' }],
    reduce(listening, { type: 'ready', quietHours: true }));
  assert.equal(answered.sleepy, null, 'an answer proves Buddy is awake after all');
});

test('close codes: 4003 asleep, 4009 opened elsewhere, anything else reconnects', () => {
  const mid = run([{ type: 'start', turn_id: 't', mode: 'voice' }, { type: 'end', turn_id: 't' }], listening);
  const asleep = reduce(mid, { type: 'closed', code: CLOSE.BLOCKED });
  assert.equal(asleep.status, 'asleep');
  assert.equal(asleep.emotion, 'sleepy');
  assert.equal(asleep.turnId, null);
  assert.equal(asleep.mic, 'off');
  assert.equal(tapAction(asleep), null);
  const replaced = reduce(mid, { type: 'closed', code: CLOSE.REPLACED });
  assert.equal(replaced.status, 'replaced');
  assert.equal(tapAction(replaced), null);
  assert.equal(canListen(replaced), false);
  const dropped = reduce(mid, { type: 'closed', code: 1006 });
  assert.equal(dropped.status, 'connecting');
  const offline = reduce(dropped, { type: 'offline', error: 'stream_failed' });
  assert.equal(offline.status, 'offline');
  assert.equal(offline.error, 'stream_failed');
  assert.equal(reduce(dropped, { type: 'ready' }).emotion, 'neutral', 'no stale thinking face after a reconnect');
  assert.equal(reduce(dropped, { type: 'connecting', error: 'slow_down' }).error, 'slow_down');
});

test('the way back after a close or a failed credential request', () => {
  const delays = [];
  for (let attempts = 0; attempts < MAX_RECONNECTS; attempts += 1) {
    const plan = reconnectPlan({ code: 1006, attempts });
    assert.equal(plan.action, 'retry');
    delays.push(plan.delayMs);
  }
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(reconnectPlan({ code: 1006, attempts: MAX_RECONNECTS }), { action: 'give_up', error: 'stream_failed' });
  assert.equal(reconnectPlan({ attempts: 0 }).action, 'retry', 'a credential request that failed on the network');

  assert.deepEqual(reconnectPlan({ code: CLOSE.AUTH_FAILED }), { action: 'refetch' }, 'a refused signature gets one fresh credential');
  assert.deepEqual(reconnectPlan({ code: CLOSE.AUTH_FAILED, refetched: true }), { action: 'give_up', error: 'auth_failed' });
  assert.deepEqual(reconnectPlan({ code: CLOSE.BLOCKED, attempts: 9 }), { action: 'blocked' });
  assert.deepEqual(reconnectPlan({ code: CLOSE.REPLACED }), { action: 'replaced' });
  assert.deepEqual(reconnectPlan({ code: CLOSE.PROTOCOL }), { action: 'give_up', error: 'protocol' });
  assert.deepEqual(reconnectPlan({ code: CLOSE.RATE }), { action: 'retry', delayMs: SLOW_DOWN_MS, error: 'slow_down' });
  assert.deepEqual(reconnectPlan({ code: CLOSE.RATE, attempts: MAX_RECONNECTS }), { action: 'give_up', error: 'slow_down' });
  assert.deepEqual(CLOSE, { AUTH_FAILED: 4001, BLOCKED: 4003, PROTOCOL: 4008, REPLACED: 4009, RATE: 4029 });
});

test('the close codes are backend-v2\'s', { skip: protocol ? false : 'this Node cannot load .ts' }, () => {
  assert.deepEqual({ ...CLOSE }, { ...protocol.CLOSE });
});

test('what the big button does, state by state', () => {
  const at = (status, extra = {}) => tapAction({ ...initialState, status, ...extra });
  assert.equal(at('listening', { mode: 'voice' }), 'end');
  assert.equal(at('listening', { mode: 'text' }), null);
  assert.equal(at('thinking', { mode: 'voice' }), null);
  assert.equal(at('thinking', { mode: 'text' }), null);
  assert.equal(at('thinking', { mode: 'buddy' }), 'interrupt');
  assert.equal(at('answered'), 'interrupt');
  assert.equal(at('speaking'), 'interrupt');
  for (const status of ['connecting', 'asleep', 'offline', 'replaced']) assert.equal(at(status), null, status);
  assert.equal(canSend({ ...initialState, status: 'denied' }), true);
  assert.equal(canSend({ ...initialState, status: 'speaking' }), true, 'typing cuts Buddy short, like a tap');
  assert.equal(canSend({ ...initialState, status: 'listening', mode: 'voice' }), false);
});

test('a new conversation clears the log', () => {
  const s = run([{ type: 'start', turn_id: 'x', mode: 'text', text: 'hi' }, { type: 'turn_done', turn_id: 'x', result: 'answered' }, { type: 'conversation_new' }], ready);
  assert.deepEqual(s.messages.map((m) => [m.from, m.kind]), [['system', 'new']]);
});

test('the log keeps the most recent messages only', () => {
  let s = ready;
  for (let i = 0; i < MAX_MESSAGES + 20; i += 1) s = run([{ type: 'start', turn_id: `n${i}`, mode: 'text', text: `n${i}` }, { type: 'turn_done', turn_id: `n${i}`, result: 'cancelled' }], s);
  assert.equal(s.messages.length, MAX_MESSAGES);
  assert.equal(s.messages.at(-1).text, `n${MAX_MESSAGES + 19}`);
  assert.equal(new Set(s.messages.map((m) => m.id)).size, MAX_MESSAGES, 'ids stay unique');
});

test('turn ids are what the protocol allows, and new each time', () => {
  const a = newTurnId();
  assert.match(a, TURN_ID_RE);
  assert.notEqual(a, newTurnId());
});

test('the messages a toy sends', () => {
  assert.deepEqual(helloMessage(DEVICE, 'sig'), { type: 'hello', device_id: DEVICE, protocol: 1, firmware: 'web-1', battery: null, clips_version: null, signature: 'sig' });
  assert.deepEqual(turnStartMessage('t1'), { type: 'turn_start', turn_id: 't1' });
  assert.deepEqual(turnEndMessage('t1', 'silence'), { type: 'turn_end', turn_id: 't1', reason: 'silence' });
  assert.deepEqual(turnEndMessage('t1', 'tap', 'hello'), { type: 'turn_end', turn_id: 't1', reason: 'tap', text: 'hello' });
  assert.deepEqual(cancelMessage('t1'), { type: 'cancel', turn_id: 't1' });
  assert.equal(statusMessage(true).event, 'wake');
  assert.equal(statusMessage().event, null);
});

test('backend-v2 parses every message the toy sends as meant', { skip: protocol ? false : 'this Node cannot load .ts' }, () => {
  const parse = (msg) => protocol.parseToyMessage(JSON.stringify(msg));
  const id = newTurnId();
  assert.deepEqual(parse(helloMessage(DEVICE, 'q'.repeat(43))), {
    type: 'hello', device_id: DEVICE, protocol: protocol.PROTOCOL_VERSION, firmware: 'web-1', battery: null, clips_version: null, signature: 'q'.repeat(43),
  });
  assert.deepEqual(parse(turnStartMessage(id)), { type: 'turn_start', turn_id: id });
  for (const reason of ['silence', 'tap', 'cap']) assert.deepEqual(parse(turnEndMessage(id, reason)), { type: 'turn_end', turn_id: id, reason, text: null });
  assert.equal(parse(turnEndMessage(id, 'tap', 'x'.repeat(2000))).text, 'x'.repeat(2000), 'the longest typed turn this page sends');
  assert.deepEqual(parse(cancelMessage(id)), { type: 'cancel', turn_id: id });
  assert.deepEqual(parse(statusMessage(true)), { type: 'status', battery: null, wifi_rssi: null, charging: null, event: 'wake' });
  assert.deepEqual(parse(statusMessage(false)), { type: 'status', battery: null, wifi_rssi: null, charging: null, event: null });
});

test('what stands in the way of every answer, said before the mic opens', () => {
  const device = { status: 'active', disabled_by: null };
  const child = { id: 'c' };
  const buddy = { character_slug: 'bo' };
  assert.equal(gateFor({ device, child, buddy, balance: 5 }), null);
  assert.equal(gateFor({ device, child, buddy, balance: null }), null, 'an unknown wallet does not block');
  assert.equal(gateFor({ device, child, buddy, balance: 0 }), 'credits');
  assert.equal(gateFor({ device, child, buddy: null, balance: 0 }), 'setup', 'no Buddy comes first: credits would not help');
  assert.equal(gateFor({ device, child: null, buddy: null, balance: 5 }), 'setup');
  assert.equal(gateFor({ device: { status: 'disabled', disabled_by: 'parent' }, child, buddy: null, balance: 0 }), 'paused', 'asleep comes first');
  assert.equal(gateFor({ device: { status: 'disabled', disabled_by: 'staff' }, child, buddy, balance: 5 }), 'held');
  assert.equal(gateFor({ device: { status: 'provisioned', disabled_by: null }, child, buddy, balance: 5 }), 'asleep');
});
