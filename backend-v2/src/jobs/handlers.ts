import { learnFromTurn } from '../memory/learner.ts';
import { localTime } from '../character/mood.ts';
import { buildWeeklyDigest, nightlySleep, type WorkerDeps } from './nightly.ts';
import type { Job } from './queue.ts';

// Push delivery (APNs, FCM) is not wired yet: notifications are recorded for
// the app to list, and the push step logs ids only.
async function sendAlert(deps: WorkerDeps, safetyEventId: string): Promise<void> {
  const { db, log } = deps;
  const ev = (await db.query<{ id: string; child_id: string; parent_notified_at: Date | null }>('SELECT id, child_id, parent_notified_at FROM safety_event WHERE id = $1', [safetyEventId])).rows[0];
  if (!ev || ev.parent_notified_at) return;
  const parents = await db.query<{ id: string }>(
    `INSERT INTO notification (parent_id, child_id, kind, ref_id)
     SELECT p.id, c.id, 'safety_alert', $2 FROM child c JOIN parent_user p ON p.family_id = c.family_id WHERE c.id = $1
     RETURNING parent_id AS id`,
    [ev.child_id, ev.id],
  );
  await db.query('UPDATE safety_event SET parent_notified_at = now() WHERE id = $1', [ev.id]);
  const tokens = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM push_token WHERE parent_id = ANY($1::uuid[])', [parents.rows.map((p) => p.id)]);
  log.info('safety alert recorded', { safety_event_id: ev.id, parents: parents.rowCount, push_tokens: tokens.rows[0].n, push: 'not configured' });
}

export async function maintenance(deps: WorkerDeps): Promise<void> {
  const { db, queue, log } = deps;
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await db.query('SELECT ensure_turn_partition($1::date)', [today]);
  await db.query('SELECT ensure_turn_partition($1::date)', [tomorrow]);
  // The 30-day rule for the child's words: whole days are dropped at once.
  const dropped = (await db.query<{ n: number }>('SELECT drop_turn_partitions_before($1::date) AS n', [cutoff])).rows[0].n;
  const purged = await queue.purgeFinished(7);
  const reclaimed = await queue.reclaimStale();
  await db.query('DELETE FROM email_login WHERE expires_at < now()');
  await db.query('DELETE FROM idempotency_key WHERE created_at < now() - interval \'2 days\'');
  log.info('maintenance done', { dropped_partitions: dropped, purged_jobs: purged, reclaimed_jobs: reclaimed });
}

export async function handleJob(deps: WorkerDeps, job: Job): Promise<void> {
  switch (job.queue) {
    case 'learn-turn':
      await learnFromTurn(deps, String(job.payload.turn_id));
      return;
    case 'send-alert':
      await sendAlert(deps, String(job.payload.safety_event_id));
      return;
    case 'nightly-sleep':
      await nightlySleep(deps, String(job.payload.child_id), String(job.payload.day));
      return;
    case 'build-digest':
      await buildWeeklyDigest(deps, String(job.payload.child_id), String(job.payload.week_start));
      return;
    case 'maintenance':
      await maintenance(deps);
      return;
  }
}

// Every few minutes: one maintenance run per UTC day, and nightly sleep for
// each child whose local clock is between 2 and 4 in the morning.
export async function scheduleTick(deps: WorkerDeps, now: Date = new Date()): Promise<number> {
  const { db, queue } = deps;
  let queued = 0;
  // The dedupe key only holds while a job waits or runs, so a finished run
  // has to be looked up, or every tick would run maintenance again.
  const maintenanceKey = `maintenance:${now.toISOString().slice(0, 10)}`;
  const maintained = await db.query("SELECT 1 FROM job WHERE queue = 'maintenance' AND dedupe_key = $1 AND status = 'done'", [maintenanceKey]);
  if (!maintained.rowCount && (await queue.enqueue('maintenance', {}, { dedupeKey: maintenanceKey }))) queued += 1;
  const children = await db.query<{ id: string; time_zone: string }>(
    "SELECT DISTINCT c.id, c.time_zone FROM child c JOIN character_instance i ON i.child_id = c.id AND i.status = 'active'",
  );
  for (const c of children.rows) {
    const local = localTime(c.time_zone, now);
    if (local.hour < 2 || local.hour >= 4) continue;
    // Sleep closes out the day that just ended.
    const day = new Date(Date.parse(`${local.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const done = await db.query("SELECT 1 FROM nightly_run WHERE child_id = $1 AND day = $2::date AND status = 'done'", [c.id, day]);
    if (done.rowCount) continue;
    if (await queue.enqueue('nightly-sleep', { child_id: c.id, day }, { dedupeKey: `${c.id}:${day}` })) queued += 1;
  }
  return queued;
}
