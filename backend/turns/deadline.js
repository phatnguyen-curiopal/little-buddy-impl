// How long the brain may take on this turn. Normally BRAIN_TIMEOUT_MS; but
// never past 10 s before the turn row would count as stale, because a stale
// row can no longer be completed and the child would hear an answer that
// the store then refuses to record. Pure, so it is tested without a clock.
export const STALE_SAFETY_MS = 10_000;

export function brainDeadlineMs({ startedAt, now, staleAfterSec, brainTimeoutMs }) {
  const untilStale = startedAt + staleAfterSec * 1000 - STALE_SAFETY_MS - now;
  return Math.max(0, Math.min(brainTimeoutMs, untilStale));
}
