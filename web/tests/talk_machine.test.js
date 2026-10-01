import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MESSAGES, MAX_RECONNECTS, canSend, initialState, reconnectPlan, reduce, streamUrl, tapAction } from '../src/talk/machine.js';

const run = (events, from = initialState) => events.reduce(reduce, from);
const ready = run([{ type: 'ready' }]);

test('connects, then waits for a tap', () => {
  assert.equal(initialState.status, 'connecting');
  assert.equal(ready.status, 'idle');
  assert.equal(tapAction(initialState), null, 'no taps before the socket is ready');
  assert.equal(tapAction(ready), 'start');
});

test('a voice turn: listen, think, answer with the transcript, speak, done', () => {
  let s = run([{ type: 'start', mode: 'voice' }], ready);
  assert.equal(s.status, 'starting');
  assert.equal(s.emotion, 'listening');
  assert.equal(tapAction(s), null, 'a tap before turn_accepted is ignored');

  s = reduce(s, { type: 'accepted', turn_id: 't1' });
  assert.equal(s.status, 'listening');
  assert.equal(tapAction(s), 'end', 'a second tap ends the turn');

  s = reduce(s, { type: 'speech' });
  assert.equal(s.heardSpeech, true);
  s = reduce(s, { type: 'end' });
  assert.equal(s.status, 'thinking');
  assert.equal(tapAction(s), null, 'taps while thinking are ignored');
  assert.equal(canSend(s), false);

  s = reduce(s, { type: 'answer', turn_id: 't1', emotion: 'happy', say: 'Hi!', heard: 'hello buddy' });
  assert.equal(s.status, 'answered');
  assert.equal(s.emotion, 'happy');
  assert.deepEqual(s.messages.map((m) => [m.from, m.text, Boolean(m.voice)]), [['child', 'hello buddy', true], ['buddy', 'Hi!', false]]);

  s = reduce(s, { type: 'audio', turn_id: 't1' });
  assert.equal(s.status, 'speaking');
  assert.equal(tapAction(s), null, 'still the open turn until turn_done');

  s = reduce(s, { type: 'turn_done', turn_id: 't1', status: 'completed' });
  assert.equal(s.status, 'speaking', 'the voice keeps playing after the debit');
  assert.equal(s.turnId, null);
  assert.equal(tapAction(s), 'interrupt', 'a tap now cuts the voice and starts a new turn');

  s = reduce(s, { type: 'playback_end' });
  assert.equal(s.status, 'idle');
  assert.equal(s.emotion, 'happy', 'the face keeps the answer until the next turn');
});

test('playback that ends before turn_done waits for it', () => {
  const s = run([
    { type: 'start', mode: 'voice' }, { type: 'accepted', turn_id: 't1' }, { type: 'end' },
    { type: 'answer', turn_id: 't1', emotion: 'love', say: 'x' }, { type: 'audio', turn_id: 't1' }, { type: 'playback_end' },
  ], ready);
  assert.equal(s.status, 'answered');
  assert.equal(reduce(s, { type: 'turn_done', turn_id: 't1', status: 'completed' }).status, 'idle');
});

test('a typed turn shows the message at once and never a second copy', () => {
  let s = run([{ type: 'start', mode: 'text', text: 'why is the sky blue?' }], ready);
  assert.equal(s.status, 'starting');
  assert.deepEqual(s.messages.map((m) => [m.from, m.text]), [['child', 'why is the sky blue?']]);
  s = reduce(s, { type: 'accepted', turn_id: 't2' });
  assert.equal(s.status, 'thinking', 'typed turns skip listening');
  s = reduce(s, { type: 'answer', turn_id: 't2', emotion: 'curious', say: 'Light!', heard: 'why is the sky blue?' });
  assert.deepEqual(s.messages.map((m) => m.from), ['child', 'buddy']);
  s = reduce(s, { type: 'turn_done', turn_id: 't2', status: 'completed' });
  assert.equal(s.status, 'idle');
  assert.equal(canSend(s), true);
});

test('a denial shows the face and line, and a new tap may try again', () => {
  const s = run([{ type: 'start', mode: 'voice' }, { type: 'denied', emotion: 'sleepy', say: 'Time for a little break.' }], ready);
  assert.equal(s.status, 'denied');
  assert.equal(s.emotion, 'sleepy');
  assert.equal(s.messages.at(-1).denied, true);
  assert.equal(tapAction(s), 'start');
  assert.equal(reduce(reduce(ready, { type: 'start', mode: 'voice' }), { type: 'denied' }).emotion, 'sleepy', 'sleepy when no face is named');
});

test('no speech gives the turn back quietly; the later turn_done is ignored', () => {
  let s = run([{ type: 'start', mode: 'voice' }, { type: 'accepted', turn_id: 't3' }, { type: 'cancel', error: 'no_speech' }], ready);
  assert.equal(s.status, 'idle');
  assert.equal(s.error, 'no_speech');
  s = reduce(s, { type: 'start', mode: 'voice' });
  const before = s;
  s = reduce(s, { type: 'turn_done', turn_id: 't3', status: 'abandoned' });
  assert.equal(s, before, 'a stale turn_done does not touch the new turn');
});

test('a cancel before turn_accepted holds new turns until the server answers the old one', () => {
  const s = run([{ type: 'start', mode: 'voice' }, { type: 'cancel', error: 'mic_denied' }], ready);
  assert.equal(s.status, 'cancelling');
  assert.equal(s.error, 'mic_denied');
  assert.equal(tapAction(s), null, 'no tap while the old turn_start is unanswered');
  assert.equal(canSend(s), false, 'no typed message either: it would become the old turn\'s words');
  const after = reduce(s, { type: 'accepted', turn_id: 'old' });
  assert.equal(after.status, 'idle');
  assert.equal(after.turnId, null, 'the cancelled turn is never adopted');
  assert.equal(canSend(after), true);
  assert.equal(reduce(s, { type: 'denied', say: 'rest' }).status, 'denied');
  assert.equal(reduce(s, { type: 'error', code: 'turn_in_flight' }).status, 'idle');
});

test('a brain no-speech answer is shown and closes as abandoned', () => {
  const s = run([
    { type: 'start', mode: 'voice' }, { type: 'accepted', turn_id: 't4' }, { type: 'end' },
    { type: 'answer', turn_id: 't4', emotion: 'confused', say: 'I did not catch that', heard: '' },
    { type: 'turn_done', turn_id: 't4', status: 'abandoned' },
  ], ready);
  assert.equal(s.status, 'idle');
  assert.equal(s.emotion, 'confused');
  assert.deepEqual(s.messages.map((m) => m.from), ['buddy'], 'an empty transcript adds no child bubble');
});

test('messages for another turn are ignored', () => {
  const s = run([{ type: 'start', mode: 'voice' }, { type: 'accepted', turn_id: 'a' }, { type: 'end' }], ready);
  assert.equal(reduce(s, { type: 'answer', turn_id: 'b', say: 'x' }), s);
  assert.equal(reduce(s, { type: 'audio', turn_id: 'b' }), s);
});

test('a protocol error on turn_start returns to idle', () => {
  const s = run([{ type: 'start', mode: 'voice' }, { type: 'error', code: 'turn_in_flight' }], ready);
  assert.equal(s.status, 'idle');
  assert.equal(s.error, 'turn_in_flight');
  assert.equal(reduce(s, { type: 'clear_error' }).error, null);
});

test('4003 puts Buddy to sleep; other closes reconnect', () => {
  const mid = run([{ type: 'start', mode: 'voice' }, { type: 'accepted', turn_id: 't' }, { type: 'end' }], ready);
  const asleep = reduce(mid, { type: 'closed', code: 4003 });
  assert.equal(asleep.status, 'asleep');
  assert.equal(asleep.emotion, 'sleepy');
  assert.equal(asleep.turnId, null);
  assert.equal(tapAction(asleep), null);
  const dropped = reduce(mid, { type: 'closed', code: 1006 });
  assert.equal(dropped.status, 'connecting');
  assert.equal(reduce(dropped, { type: 'offline' }).status, 'offline');
  assert.equal(reduce(dropped, { type: 'ready' }).emotion, 'neutral', 'no stale thinking face after a reconnect');
});

test('a new conversation clears the log', () => {
  const s = run([{ type: 'start', mode: 'text', text: 'hi' }, { type: 'conversation_started' }], ready);
  assert.deepEqual(s.messages.map((m) => [m.from, m.kind]), [['system', 'new']]);
});

test('the log keeps the most recent messages only', () => {
  let s = ready;
  for (let i = 0; i < MAX_MESSAGES + 20; i += 1) s = reduce(s, { type: 'denied', say: `n${i}` });
  assert.equal(s.messages.length, MAX_MESSAGES);
  assert.equal(s.messages.at(-1).text, `n${MAX_MESSAGES + 19}`);
  assert.equal(new Set(s.messages.map((m) => m.id)).size, MAX_MESSAGES, 'ids stay unique');
});

test('reconnects: bounded retries with backoff, one fresh reveal, then give up', () => {
  const delays = [];
  for (let attempts = 0; attempts < MAX_RECONNECTS; attempts += 1) {
    const plan = reconnectPlan({ attempts, rerevealed: false });
    assert.equal(plan.action, 'retry');
    delays.push(plan.delayMs);
  }
  assert.deepEqual(delays, [1000, 2000, 4000]);
  assert.deepEqual(reconnectPlan({ attempts: MAX_RECONNECTS, rerevealed: false }), { action: 'reveal' });
  assert.deepEqual(reconnectPlan({ attempts: MAX_RECONNECTS, rerevealed: true }), { action: 'give_up' });
});

test('the stream url follows the page scheme', () => {
  const q = { device_id: 'd', ts: '1', nonce: 'n', sig: 's' };
  assert.equal(streamUrl('http://localhost:5174', q), 'ws://localhost:5174/v1/stream?device_id=d&ts=1&nonce=n&sig=s');
  assert.equal(streamUrl('https://buddy.example', q), 'wss://buddy.example/v1/stream?device_id=d&ts=1&nonce=n&sig=s');
});
