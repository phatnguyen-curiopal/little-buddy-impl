// The toy-to-cloud protocol (API design, section 6): JSON control messages,
// binary audio frames. Every message from a toy is validated here before any
// code acts on it.

export const PROTOCOL_VERSION = 1;

export const CLOSE = {
  AUTH_FAILED: 4001,
  BLOCKED: 4003,
  PROTOCOL: 4008,
  REPLACED: 4009,
  RATE: 4029,
} as const;

export type ToyMessage =
  | { type: 'hello'; device_id: string; protocol: number; firmware: string | null; battery: number | null; clips_version: string | null; signature: string }
  | { type: 'turn_start'; turn_id: string }
  | { type: 'turn_end'; turn_id: string; reason: 'tap' | 'silence' | 'cap'; text: string | null }
  | { type: 'cancel'; turn_id: string }
  | { type: 'playback_done'; turn_id: string }
  // event 'wake': the toy woke from sleep or was picked up, the one moment
  // Buddy may speak first (answered with buddy_turn, when allowed).
  | { type: 'status'; battery: number | null; wifi_rssi: number | null; charging: boolean | null; event: 'wake' | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TURN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length <= max ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseToyMessage(raw: string): ToyMessage | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const turnId = str(m.turn_id, 64);
  switch (m.type) {
    case 'hello': {
      const deviceId = str(m.device_id, 36);
      const signature = str(m.signature, 128);
      if (!deviceId || !UUID_RE.test(deviceId) || !signature || num(m.protocol) === null) return null;
      return { type: 'hello', device_id: deviceId, protocol: num(m.protocol)!, firmware: str(m.firmware, 32), battery: num(m.battery), clips_version: str(m.clips_version, 64), signature };
    }
    case 'turn_start':
      return turnId && TURN_ID_RE.test(turnId) ? { type: 'turn_start', turn_id: turnId } : null;
    case 'turn_end': {
      if (!turnId || !TURN_ID_RE.test(turnId)) return null;
      const reason = m.reason === 'silence' || m.reason === 'cap' ? m.reason : 'tap';
      return { type: 'turn_end', turn_id: turnId, reason, text: str(m.text, 2000) };
    }
    case 'cancel':
      return turnId && TURN_ID_RE.test(turnId) ? { type: 'cancel', turn_id: turnId } : null;
    case 'playback_done':
      return turnId && TURN_ID_RE.test(turnId) ? { type: 'playback_done', turn_id: turnId } : null;
    case 'status':
      return {
        type: 'status', battery: num(m.battery), wifi_rssi: num(m.wifi_rssi), charging: typeof m.charging === 'boolean' ? m.charging : null,
        event: m.event === 'wake' ? 'wake' : null,
      };
    default:
      return null;
  }
}
