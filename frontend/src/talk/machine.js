// The web toy's state machine, pure: useWebToy.js feeds it events (socket
// messages and what the child did) and renders what comes out. Keeping the
// rules here means they are tested without a socket, a mic or React.
//
// The protocol is backend-v2's toy protocol (docs/backend-v2.md, "A Buddy in
// the browser"): the toy names each turn itself and streams audio right
// behind turn_start (there is no turn_accepted); the server answers with
// faces, Buddy's voice as downlink frames, sometimes a clip, and always
// turn_done.
//
// status:
//   connecting  fetching the credential, opening the socket, signing in
//   idle        signed in: with the mic on, waiting for the child to speak
//   listening   the child is talking: turn_start sent, frames streaming
//   thinking    turn_end sent, or Buddy is about to speak first
//   answered    Buddy's face for the answer is up and its voice has not
//               started yet (or already ended, with turn_done on its way)
//   speaking    Buddy's voice is playing
//   denied      the last turn was refused with a clip: napping (no Buddy,
//               no credits, paused) or sleepy (quiet hours, daily limit)
//   asleep      paused or removed (close 4003, or the credential refused)
//   replaced    the same Buddy was opened somewhere else (close 4009)
//   offline     could not connect after the retries
//
// mic: off | opening | on. The Talk screen is hands-free: the mic opens once
// the toy has signed in and stays open, a turn starts on its own when the
// child speaks, and the big button mutes it.
//
// mode: voice | text | buddy, who opened the turn (buddy: Buddy speaks
// first). Typed turns exist for development only; production refuses them.

export const MAX_MESSAGES = 200;
export const MAX_RECONNECTS = 3;
// A server that says "too many" (4029) is given this long before the next try.
export const SLOW_DOWN_MS = 30_000;
export const PROTOCOL_VERSION = 1;
export const FIRMWARE = 'web-1';
export const CLOSE = Object.freeze({ AUTH_FAILED: 4001, BLOCKED: 4003, PROTOCOL: 4008, REPLACED: 4009, RATE: 4029 });
// The clips a physical toy keeps on board; the browser shows a line instead.
export const CLIPS = Object.freeze(['napping', 'sleepy', 'didnt_catch']);
export const TURN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const initialState = Object.freeze({
  status: 'connecting',
  emotion: 'neutral',
  mic: 'off',
  turnId: null,
  mode: null,
  answered: false,
  playing: false,
  // The last clip the server asked for, until the next turn starts.
  clip: null,
  // From ready: quiet (quiet hours) or limit (today's talk time used up),
  // when every turn would only get the sleepy clip.
  sleepy: null,
  // stalled: the page gave up on the last turn (see watch below). It
  // outlives a reconnect, so the line is still there once Buddy listens
  // again, and goes when the next turn starts.
  notice: null,
  messages: [],
  seq: 0,
  error: null,
});

function push(state, message) {
  const seq = state.seq + 1;
  const messages = [...state.messages, { id: seq, ...message }].slice(-MAX_MESSAGES);
  return { ...state, seq, messages };
}

const mine = (state, event) => Boolean(state.turnId) && event.turn_id === state.turnId;
// Listening and thinking are faces of a turn in progress, not moods to keep.
const settled = (emotion) => (emotion === 'listening' || emotion === 'thinking' ? 'neutral' : emotion);
const quiet = (state) => ({ ...state, mic: 'off', turnId: null, mode: null, playing: false });

export function reduce(state, event) {
  switch (event.type) {
    case 'connecting':
      return { ...quiet(state), status: 'connecting', error: event.error ?? null };

    case 'ready':
      return {
        ...state, status: 'idle', turnId: null, mode: null, playing: false, clip: null, error: null,
        sleepy: event.quietHours ? 'quiet' : event.limitReached ? 'limit' : null,
        emotion: settled(state.emotion),
      };

    case 'mic_opening':
      return { ...state, mic: 'opening', error: null };

    case 'mic_on':
      return { ...state, mic: 'on', error: null };

    case 'mic_off':
      return { ...state, mic: 'off', error: event.error ?? state.error };

    case 'start': {
      // A voice turn starts because speech was heard, so it is listening at
      // once; a typed turn is already over on the child's side.
      const text = event.mode === 'text';
      const next = {
        ...state, status: text ? 'thinking' : 'listening', mode: event.mode, turnId: event.turn_id, answered: false, playing: false,
        clip: null, notice: null, error: null, emotion: text ? 'thinking' : 'listening',
      };
      return text ? push(next, { from: 'child', text: event.text }) : next;
    }

    case 'end':
      if (!mine(state, event) || state.status !== 'listening') return state;
      return push({ ...state, status: 'thinking', emotion: 'thinking' }, { from: 'child', voice: true });

    case 'face': {
      if (!mine(state, event)) return state;
      if (event.phase === 'speaking') {
        return { ...state, status: state.status === 'speaking' ? 'speaking' : 'answered', answered: true, sleepy: null, emotion: event.emotion || 'neutral' };
      }
      // Thinking while the child still talks: the server ended the turn
      // itself (its own cap), and the screen follows it.
      if (event.phase === 'thinking' && (state.status === 'listening' || state.status === 'thinking')) {
        return { ...state, status: 'thinking', emotion: 'thinking' };
      }
      // Listening: the turn got past the gate; the screen already listens.
      return state;
    }

    case 'audio':
      return mine(state, event) ? { ...state, status: 'speaking', playing: true, answered: true } : state;

    case 'playback_end':
      if (!state.playing) return state;
      return { ...state, playing: false, status: state.status === 'speaking' ? (state.turnId ? 'answered' : 'idle') : state.status };

    case 'clip': {
      if (!mine(state, event)) return state;
      const emotion = event.clip === 'didnt_catch' ? 'confused' : 'sleepy';
      return push({ ...state, clip: event.clip, emotion }, { from: 'buddy', clip: event.clip, emotion });
    }

    case 'turn_done': {
      if (!mine(state, event)) return state;
      const done = { ...state, turnId: null, mode: null };
      switch (event.result) {
        case 'blocked':
          // useWebToy closes the mic with a refusal: every further word
          // would only knock on a closed door. A tap opens it again.
          return { ...done, status: 'denied', playing: false, clip: state.clip ?? 'napping', emotion: 'sleepy' };
        case 'answered': {
          const next = push(done, { from: 'buddy', emotion: state.emotion, kind: state.mode === 'buddy' ? 'greet' : 'answer' });
          // The voice keeps playing after the debit; playback_end settles it.
          return state.playing ? next : { ...next, status: 'idle' };
        }
        case 'no_speech':
        case 'failed':
          return { ...done, status: state.playing ? 'speaking' : 'idle', clip: state.clip ?? 'didnt_catch', emotion: state.playing ? state.emotion : 'confused' };
        default:
          // cancelled, or a result this page does not know yet
          return { ...done, status: state.playing ? 'speaking' : 'idle', emotion: state.playing ? state.emotion : settled(state.emotion) };
      }
    }

    case 'buddy_turn':
      // Buddy speaks first only into a quiet room; when the child has a turn
      // open, the server drops its greeting for the child's turn anyway.
      if (state.turnId || state.playing || (state.status !== 'idle' && state.status !== 'denied')) return state;
      return { ...state, status: 'thinking', mode: 'buddy', turnId: event.turn_id, answered: false, clip: null, notice: null, error: null, emotion: 'thinking' };

    case 'interrupt':
      // The child cut Buddy off. useWebToy cancels the open turn, so its
      // turn_done, when it comes, no longer matches anything.
      return { ...state, status: 'idle', turnId: null, mode: null, playing: false, emotion: settled(state.emotion) };

    case 'stalled':
      // The watchdog gave up on a turn the server never finished. useWebToy
      // cancels it (free, and its late turn_done then matches nothing) and
      // listens again, or reconnects first. A greeting Buddy never got to
      // say asked nothing of the child, so it goes without a word.
      if (!mine(state, event)) return state;
      if (state.mode === 'buddy') return { ...state, status: 'idle', turnId: null, mode: null, playing: false, emotion: settled(state.emotion) };
      return { ...state, status: 'idle', turnId: null, mode: null, playing: false, clip: null, notice: 'stalled', emotion: 'confused' };

    case 'resume':
      // What a refusal was about has been dealt with on the dashboard.
      return state.status === 'denied' ? { ...state, status: 'idle', clip: null, emotion: 'neutral' } : state;

    case 'error':
      return { ...state, error: event.code || 'error' };

    case 'conversation_new':
      return push({ ...state, messages: [], notice: null, error: null }, { from: 'system', kind: 'new' });

    // Asleep, opened elsewhere or offline: whatever happens next starts
    // over, so a line about the last turn would be stale by then.
    case 'closed':
      if (event.code === CLOSE.BLOCKED) return { ...quiet(state), status: 'asleep', notice: null, emotion: 'sleepy' };
      if (event.code === CLOSE.REPLACED) return { ...quiet(state), status: 'replaced', notice: null, emotion: 'sleepy' };
      return { ...quiet(state), status: 'connecting' };

    case 'asleep':
      return { ...quiet(state), status: 'asleep', notice: null, emotion: 'sleepy' };

    case 'offline':
      return { ...quiet(state), status: 'offline', notice: null, emotion: 'confused', error: event.error ?? 'offline' };

    case 'clear_error':
      return state.error ? { ...state, error: null } : state;

    default:
      return state;
  }
}

// Nothing open and nothing playing: speech may start a turn now.
export const canListen = (state) => (state.status === 'idle' || state.status === 'denied') && !state.turnId && !state.playing;

// What a tap on the big button means right now. Taps while the child's
// answer is being thought out are ignored: it is on its way, and a stray tap
// should not throw it away. Buddy's own voice, or its turn to speak first,
// can always be cut short.
export function tapAction(state) {
  switch (state.status) {
    case 'idle':
    case 'denied':
      if (state.mic === 'on') return 'mute';
      return state.mic === 'opening' ? null : 'listen';
    case 'listening':
      return state.mode === 'voice' ? 'end' : null;
    case 'answered':
    case 'speaking':
      return 'interrupt';
    case 'thinking':
      return state.mode === 'buddy' ? 'interrupt' : null;
    default:
      return null;
  }
}

// A typed message (development only) may go whenever a tap could free the toy.
export const canSend = (state) => state.status === 'idle' || state.status === 'denied' || tapAction(state) === 'interrupt';

// After a close (code) or a failed credential request (no code): which way
// back. A refused signature gets one fresh credential; paused, removed and
// "opened elsewhere" stop and say so; anything else retries with backoff.
export function reconnectPlan({ code = null, attempts = 0, refetched = false } = {}) {
  if (code === CLOSE.BLOCKED) return { action: 'blocked' };
  if (code === CLOSE.REPLACED) return { action: 'replaced' };
  if (code === CLOSE.AUTH_FAILED) return refetched ? { action: 'give_up', error: 'auth_failed' } : { action: 'refetch' };
  if (code === CLOSE.PROTOCOL) return { action: 'give_up', error: 'protocol' };
  if (attempts >= MAX_RECONNECTS) return { action: 'give_up', error: code === CLOSE.RATE ? 'slow_down' : 'stream_failed' };
  if (code === CLOSE.RATE) return { action: 'retry', delayMs: SLOW_DOWN_MS, error: 'slow_down' };
  return { action: 'retry', delayMs: 1000 * 2 ** attempts };
}

// The page's own watch over the open turn, so a turn the server dropped (a
// socket that died quietly, a failure that sent nothing back) never leaves
// the screen thinking for good. backend-v2 ends every turn with turn_done,
// but the page does not stake its liveness on that. Thinking out an answer
// can take a while (recognition, the model, the first sentence's voice);
// once Buddy is answering, its next frame, face or turn_done follows within
// seconds, so a shorter silence is enough to give up then.
export const ANSWER_WAIT_MS = 30_000;
export const VOICE_WAIT_MS = 15_000;
// backend-v2 sends Buddy's voice as fast as it is made, so a long answer (a
// story) can still be playing well after its last frame came. The watch
// never cuts that short: it gives up this long after the voice already
// queued has played, at the earliest.
export const PLAYOUT_GRACE_MS = 3_000;

// dog is null while nothing is awaited, else { turnId, ms, since, heard }:
// the turn may stay silent for ms after since, and heard counts the server
// messages that had arrived when the turn last moved (see stallPlan).
// Events:
//   wait      the child's part is over (turn_end went out, or the server
//             ended the turn itself), or Buddy opened a turn of its own
//   progress  a speaking face, a frame of Buddy's voice, a clip, audio_end;
//             aheadMs is how much of Buddy's voice is queued to play
//   turn_done the turn is over
// useWebToy keeps one timer on the deadline (dueIn).
export function watch(dog, event, now, heard = 0) {
  switch (event.type) {
    case 'wait':
      return { turnId: event.turn_id, ms: ANSWER_WAIT_MS, since: now, heard };
    case 'progress':
      if (!dog || dog.turnId !== event.turn_id) return dog;
      return { ...dog, ms: Math.max(VOICE_WAIT_MS, (event.aheadMs ?? 0) + PLAYOUT_GRACE_MS), since: now, heard };
    case 'turn_done':
      return dog && dog.turnId === event.turn_id ? null : dog;
    default:
      return dog;
  }
}

// Milliseconds until the open turn is given up on (0: now), null when
// nothing is awaited.
export const dueIn = (dog, now) => (dog ? Math.max(0, dog.since + dog.ms - now) : null);

// After giving up on a turn: listen again on the same socket when the server
// said anything after the turn last moved (it is there, the turn got lost
// in it), or start over on a fresh socket when nothing at all came since,
// which is what a socket that died without a close looks like, mid-answer
// as much as before it.
export const stallPlan = ({ open, heard, dog }) => (open && heard > dog.heard ? 'rearm' : 'reconnect');

// The toy names its turns: 1 to 64 of A-Za-z0-9_-, which a UUID is.
export function newTurnId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// The control messages a toy sends, built in one place so the tests can hand
// each to backend-v2's own parser.
export function helloMessage(deviceId, signature) {
  return { type: 'hello', device_id: deviceId, protocol: PROTOCOL_VERSION, firmware: FIRMWARE, battery: null, clips_version: null, signature };
}

export const turnStartMessage = (turnId) => ({ type: 'turn_start', turn_id: turnId });

// reason: silence (the child went quiet), tap (send now) or cap (too long).
// text is a typed turn, which only a development server hears.
export function turnEndMessage(turnId, reason, text = null) {
  return text ? { type: 'turn_end', turn_id: turnId, reason, text } : { type: 'turn_end', turn_id: turnId, reason };
}

export const cancelMessage = (turnId) => ({ type: 'cancel', turn_id: turnId });

// What a toy says now and then, so its last-seen time stays fresh. wake is
// sent once, when the page opens (a physical toy: when it is picked up),
// the one moment Buddy may speak first, if the parent allowed it.
export function statusMessage(wake = false) {
  return { type: 'status', battery: null, wifi_rssi: null, charging: null, event: wake ? 'wake' : null };
}

// Why the server would only answer with its napping clip, so the Talk
// screen can say it before the mic opens: the toy is asleep, the child has
// no Buddy yet, or the family is out of credits. null when nothing stands in
// the way. balance is null while the wallet is unknown.
export function gateFor({ device, child, buddy, balance = null }) {
  if (device.status !== 'active') {
    if (device.status === 'disabled') return device.disabled_by === 'staff' ? 'held' : 'paused';
    return 'asleep';
  }
  if (!child || !buddy) return 'setup';
  if (typeof balance === 'number' && balance < 1) return 'credits';
  return null;
}
