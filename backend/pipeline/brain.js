import config from '../config.js';
import { pool } from '../store/db.js';
import * as profiles from '../store/profile.js';
import * as childrenStore from '../store/child.js';
import * as voices from '../store/voice.js';
import { DEFAULT_PROFILE } from '../personalization/roles.js';

// The adapter to the brain service (brain/docs/contract.md). The backend
// sends codes and values only (who is talking, which Buddy, which settings);
// every word of the prompt and all memory live in the brain. Errors carry
// codes only: the brain's response body can hold the child's words, so it
// is never logged or attached to an error.

export const EMOTIONS = Object.freeze([
  'neutral', 'listening', 'thinking', 'happy', 'excited', 'laughing', 'love',
  'curious', 'surprised', 'wink', 'shy', 'confused', 'sad', 'sleepy',
]);
const EMOTION_SET = new Set(EMOTIONS);
const DEFAULT_RATE = 16000;
const WIPE_TIMEOUT_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;
const CODE_RE = /^[a-z_]{1,40}$/;

export class BrainError extends Error {
  constructor(code, { status = null, kind = null } = {}) {
    super(code);
    this.name = 'BrainError';
    this.code = code;
    this.status = status;
    this.kind = kind;
  }
}

// Memory belongs to the child when one is assigned, so it follows them from
// toy to toy. Without a child it belongs to the toy within this family:
// the family id is part of the subject, so a re-claimed toy never inherits
// what it learned for its previous owner.
export function subjectFor({ childId, deviceId, familyId }) {
  return childId ? `child:${childId}` : `device:${deviceId}:${familyId}`;
}

function endpoint(path) {
  return new URL(path, config.brainUrl).toString();
}

function authHeaders() {
  return { authorization: `Bearer ${config.brainToken}` };
}

async function buildMeta(turn) {
  const [profile, child] = await Promise.all([
    profiles.findByDevice(pool, turn.deviceId),
    turn.childId ? childrenStore.findInFamily(pool, turn.childId, turn.familyId) : null,
  ]);
  // Toys claimed before profiles existed have no row; they are Buddy.
  const p = profile ?? DEFAULT_PROFILE;
  const voiceId = await voices.resolve(pool, p.voice_id);
  if (!voiceId) throw new BrainError('no_voice');
  return {
    turn_id: turn.id,
    conversation_id: turn.conversationId,
    device_id: turn.deviceId,
    subject: subjectFor({ childId: child ? child.id : null, deviceId: turn.deviceId, familyId: turn.familyId }),
    child: child ? { name: child.name, birth_year: child.birth_year } : null,
    buddy: { name: p.name, role: p.role, personality: p.personality },
    settings: { language: p.language, voice_id: voiceId, learn: p.learn, mood_pin: p.mood_pin },
  };
}

// Only the code-shaped fields of an error body are kept.
async function errorFrom(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const code = typeof body?.error === 'string' && CODE_RE.test(body.error) ? body.error : `http_${res.status}`;
  const kind = typeof body?.kind === 'string' && CODE_RE.test(body.kind) ? body.kind : null;
  return new BrainError(`brain_${code}`, { status: res.status, kind });
}

function abortError(signal) {
  return new BrainError(signal.reason?.name === 'TimeoutError' ? 'brain_timeout' : 'aborted');
}

function parseAnswer(data) {
  if (!data || typeof data !== 'object' || typeof data.reply !== 'string' || !data.reply.trim()) {
    throw new BrainError('brain_bad_response');
  }
  let audio = null;
  if (typeof data.audio_b64 === 'string' && data.audio_b64.length > 0) {
    audio = Buffer.from(data.audio_b64, 'base64');
    // PCM16 samples are two bytes; a stray odd byte would shift every one.
    if (audio.length % 2) audio = audio.subarray(0, audio.length - 1);
    if (audio.length === 0) audio = null;
  }
  const rate = Number.isInteger(data.audio_rate) && data.audio_rate > 0 ? data.audio_rate : DEFAULT_RATE;
  return {
    emotion: EMOTION_SET.has(data.emotion) ? data.emotion : 'neutral',
    say: data.reply,
    heard: typeof data.heard === 'string' ? data.heard : '',
    audio,
    rate: audio ? rate : null,
    noSpeech: data.no_speech === true,
  };
}

// A voice turn sends the PCM bytes as the body with the metadata in a
// header (base64url, because names are Vietnamese and headers are latin1);
// a typed turn is plain JSON.
export async function answerTurn({ turn, audio = null, text = null, signal }) {
  const meta = await buildMeta(turn);
  const init = { method: 'POST', signal };
  if (text !== null) {
    init.headers = { ...authHeaders(), 'content-type': 'application/json' };
    init.body = JSON.stringify({ ...meta, text });
  } else {
    init.headers = {
      ...authHeaders(),
      'content-type': 'application/octet-stream',
      'x-lb-turn': Buffer.from(JSON.stringify(meta), 'utf8').toString('base64url'),
    };
    init.body = audio ?? Buffer.alloc(0);
  }

  let res;
  let data;
  try {
    res = await fetch(endpoint('/v1/turns'), init);
    if (!res.ok) throw await errorFrom(res);
    data = await res.json();
  } catch (err) {
    if (signal?.aborted) throw abortError(signal);
    if (err instanceof BrainError) throw err;
    throw new BrainError(res ? 'brain_bad_response' : 'brain_unreachable');
  }
  return parseAnswer(data);
}

export async function wipeDeviceSubject({ deviceId, familyId }) {
  const subject = subjectFor({ childId: null, deviceId, familyId });
  let res;
  try {
    res = await fetch(endpoint(`/v1/subjects/${encodeURIComponent(subject)}`), {
      method: 'DELETE',
      headers: authHeaders(),
      signal: AbortSignal.timeout(WIPE_TIMEOUT_MS),
    });
  } catch {
    throw new BrainError('brain_unreachable');
  }
  if (!res.ok) throw await errorFrom(res);
}

// A boot-time check that the brain is up and shares our BRAIN_TOKEN, so a
// mismatch shows in the log before a child presses the button (otherwise
// every turn would fail with the canned line). It posts an empty JSON turn:
// the brain checks the token first and then refuses the empty meta with
// 400 before doing anything, so the probe costs nothing and writes nothing.
export async function probe() {
  let res;
  try {
    res = await fetch(endpoint('/v1/turns'), {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: 'brain_unreachable' };
  }
  await res.arrayBuffer().catch(() => {});
  if (res.status === 400) return { ok: true, code: 'brain_ready' };
  if (res.status === 401) return { ok: false, code: 'brain_unauthorized' };
  return { ok: false, code: `brain_http_${res.status}` };
}
