// The web toy's state machine, pure: useWebToy.js feeds it events (socket
// messages and what the child did) and renders what comes out. Keeping
// the rules here means they are tested without a socket, a mic or React.
//
// status:
//   connecting  revealing the secret, syncing the clock, opening the socket
//   idle        ready: with the mic on, waiting for the child to speak
//   starting    turn_start sent, waiting for turn_accepted or turn_denied
//   cancelling  the turn was given up before turn_accepted arrived; nothing
//               new may start until the server answers that turn_start, or
//               the next message would be taken as the old turn's words
//   listening   the child is talking and the frames are streaming
//   thinking    turn_end sent, waiting for the answer
//   answered    the answer has arrived, turn_done has not yet
//   speaking    Buddy's voice is playing
//   denied      the press was refused (a break, or no credits: the toy
//               cannot tell which, on purpose)
//   asleep      the toy is paused or revoked (close 4003, or not active)
//   offline     could not connect after the retries
//
// mic: off | opening | on. The Talk screen is hands-free: the mic opens
// when the stream is ready and stays open, a turn starts on its own when
// the child speaks, and the big button mutes it.

export const MAX_MESSAGES = 200;
export const MAX_RECONNECTS = 3;

export const initialState = Object.freeze({
  status: 'connecting',
  emotion: 'neutral',
  mic: 'off',
  turnId: null,
  mode: null,
  heardSpeech: false,
  answered: false,
  playing: false,
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

export function reduce(state, event) {
  switch (event.type) {
    case 'connecting':
      return { ...state, status: 'connecting', mic: 'off', turnId: null, playing: false, error: null };

    case 'ready': {
      const busyFace = state.emotion === 'listening' || state.emotion === 'thinking';
      return { ...state, status: 'idle', turnId: null, error: null, emotion: busyFace ? 'neutral' : state.emotion };
    }

    case 'mic_opening':
      return { ...state, mic: 'opening', error: null };

    case 'mic_on':
      return { ...state, mic: 'on', error: null };

    case 'mic_off':
      return { ...state, mic: 'off', error: event.error ?? state.error };

    case 'start': {
      // Hands-free, the turn starts because speech was heard, so the
      // listening screen knows it at once (heard: true).
      const next = {
        ...state, status: 'starting', mode: event.mode, turnId: null, heardSpeech: Boolean(event.heard), answered: false, playing: false, error: null,
        emotion: event.mode === 'text' ? 'thinking' : 'listening',
      };
      return event.mode === 'text' ? push(next, { from: 'child', text: event.text }) : next;
    }

    case 'accepted':
      if (state.status === 'cancelling') return { ...state, status: 'idle' };
      if (state.status !== 'starting') return state;
      return state.mode === 'text'
        ? { ...state, status: 'thinking', turnId: event.turn_id, emotion: 'thinking' }
        : { ...state, status: 'listening', turnId: event.turn_id, emotion: 'listening' };

    case 'speech':
      return state.status === 'listening' ? { ...state, heardSpeech: true } : state;

    case 'end':
      return state.status === 'listening' ? { ...state, status: 'thinking', emotion: 'thinking' } : state;

    // The turn is given back (turn_cancel), so nothing is charged and
    // nothing is shown.
    case 'cancel':
      if (state.status !== 'listening' && state.status !== 'starting') return state;
      return { ...state, status: state.status === 'starting' ? 'cancelling' : 'idle', turnId: null, emotion: 'neutral', error: event.error ?? null };

    case 'denied': {
      // The mic closes with a refusal: every further word would only knock
      // on a closed door. A tap opens it again.
      const next = { ...state, status: 'denied', mic: 'off', turnId: null, emotion: event.emotion || 'sleepy' };
      return event.say ? push(next, { from: 'buddy', text: event.say, emotion: next.emotion, denied: true }) : next;
    }

    case 'answer': {
      if (!mine(state, event)) return state;
      let next = { ...state, status: 'answered', answered: true, emotion: event.emotion || 'neutral' };
      // A typed turn already shows what was sent; a voice turn shows what
      // Buddy understood, which is the only way to spot a mishearing.
      if (state.mode === 'voice' && event.heard) next = push(next, { from: 'child', text: event.heard, voice: true });
      return event.say ? push(next, { from: 'buddy', text: event.say, emotion: next.emotion }) : next;
    }

    case 'audio':
      return mine(state, event) ? { ...state, status: 'speaking', playing: true } : state;

    case 'playback_end':
      if (!state.playing) return state;
      return { ...state, playing: false, status: state.status === 'speaking' ? (state.turnId ? 'answered' : 'idle') : state.status };

    case 'turn_done': {
      if (!mine(state, event)) return state;
      if (state.playing) return { ...state, turnId: null };
      const quiet = !state.answered;
      return { ...state, status: 'idle', turnId: null, emotion: quiet ? 'neutral' : state.emotion };
    }

    case 'error':
      // turn_in_flight answers a turn_start or a conversation_new sent
      // while the server still holds a turn; either way nothing started.
      return state.status === 'starting' || state.status === 'cancelling'
        ? { ...state, status: 'idle', error: event.code }
        : { ...state, error: event.code };

    case 'conversation_started':
      return push({ ...state, messages: [], error: null }, { from: 'system', kind: 'new' });

    case 'closed':
      if (event.code === 4003) return { ...state, status: 'asleep', mic: 'off', emotion: 'sleepy', turnId: null, playing: false };
      return { ...state, status: 'connecting', mic: 'off', turnId: null, playing: false };

    case 'asleep':
      return { ...state, status: 'asleep', mic: 'off', emotion: 'sleepy', turnId: null, playing: false };

    case 'offline':
      return { ...state, status: 'offline', mic: 'off', emotion: 'confused', turnId: null, playing: false, error: event.error ?? 'offline' };

    case 'clear_error':
      return state.error ? { ...state, error: null } : state;

    default:
      return state;
  }
}

// What a tap on the big button means right now. Taps while Buddy thinks
// are ignored: the answer is already on its way and a second press would
// only be a protocol error.
export function tapAction(state) {
  switch (state.status) {
    case 'idle':
    case 'denied':
      if (state.mic === 'on') return 'mute';
      return state.mic === 'opening' ? null : 'listen';
    case 'listening':
      return 'end';
    case 'speaking':
      return state.turnId ? null : 'interrupt';
    default:
      return null;
  }
}

// A typed message may go whenever the toy is free, mic or no mic.
export const canSend = (state) => state.status === 'idle' || state.status === 'denied' || tapAction(state) === 'interrupt';

// After an unexpected close: a few quick retries, then one fresh reveal of
// the secret (it may have been rotated), then give up and show the error.
export function reconnectPlan({ attempts, rerevealed }) {
  if (attempts < MAX_RECONNECTS) return { action: 'retry', delayMs: 1000 * 2 ** attempts };
  if (!rerevealed) return { action: 'reveal' };
  return { action: 'give_up' };
}

export function streamUrl(origin, query) {
  return `${String(origin).replace(/^http/, 'ws')}/v1/stream?${new URLSearchParams(query)}`;
}
