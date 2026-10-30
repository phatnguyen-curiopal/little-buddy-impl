// Letting go of toys: unpairing one, or deleting the child or family it
// belonged to. A physical toy goes back to the factory state, so the code on
// its box works again. A Buddy that lived only in the browser is revoked for
// good, because its owner's browser may still hold its secret.

import type { Queryable } from '../db/index.ts';

// The one-awake-toy-per-child index refused a write: another request gave
// the child an awake toy in the meantime. Any other unique clash (a serial)
// is a different problem and is not reported as this one.
export function isActiveToyClash(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string };
  return e.code === '23505' && e.constraint === 'device_active_child_uq';
}

export type ToyScope = { deviceId: string; familyId: string } | { childId: string } | { familyId: string };

export async function releaseToys(q: Queryable, scope: ToyScope, actor: string): Promise<string[]> {
  const [where, params] =
    'deviceId' in scope ? ['id = $1 AND family_id = $2', [scope.deviceId, scope.familyId]]
    : 'childId' in scope ? ['child_id = $1', [scope.childId]]
    : ['family_id = $1', [scope.familyId]];
  // A toy staff disabled stays with its family until staff release it.
  const r = await q.query<{ id: string; status: string }>(
    `UPDATE device SET status = CASE WHEN hardware_rev = 'web' THEN 'revoked' ELSE 'provisioned' END,
            family_id = NULL, child_id = NULL, claimed_at = NULL, disabled_by = NULL
     WHERE ${where} AND status <> 'revoked' AND disabled_by IS DISTINCT FROM 'staff'
     RETURNING id, status`,
    params,
  );
  for (const d of r.rows) {
    await q.query('INSERT INTO device_event (device_id, kind, actor) VALUES ($1, $2, $3)', [d.id, d.status === 'revoked' ? 'revoked' : 'unclaimed', actor]);
  }
  return r.rows.map((d) => d.id);
}
