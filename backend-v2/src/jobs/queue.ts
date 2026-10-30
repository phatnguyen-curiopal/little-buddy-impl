// A Postgres-backed job queue (FOR UPDATE SKIP LOCKED), so a single-server
// deployment needs no SQS. Payloads carry ids, never a child's words.

import type { Db, Queryable } from '../db/index.ts';

export type QueueName = 'learn-turn' | 'nightly-sleep' | 'build-digest' | 'send-alert' | 'maintenance';

export interface Job {
  id: number;
  queue: QueueName;
  payload: Record<string, any>;
  attempts: number;
}

export interface JobQueue {
  enqueue(queue: QueueName, payload: Record<string, unknown>, opts?: { dedupeKey?: string; runAt?: Date; q?: Queryable }): Promise<boolean>;
}

export const MAX_ATTEMPTS = 5;

export function createJobQueue(db: Db) {
  return {
    async enqueue(queue: QueueName, payload: Record<string, unknown>, opts: { dedupeKey?: string; runAt?: Date; q?: Queryable } = {}): Promise<boolean> {
      const r = await (opts.q ?? db).query(
        `INSERT INTO job (queue, payload, dedupe_key, run_at) VALUES ($1, $2, $3, coalesce($4, now()))
         ON CONFLICT (queue, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('ready', 'running') DO NOTHING`,
        [queue, JSON.stringify(payload), opts.dedupeKey ?? null, opts.runAt ?? null],
      );
      return r.rowCount > 0;
    },

    async claim(queues: QueueName[], lockSec = 120): Promise<Job | null> {
      const r = await db.query<Job>(
        `UPDATE job SET status = 'running', attempts = attempts + 1, locked_until = now() + make_interval(secs => $2)
         WHERE id = (
           SELECT id FROM job WHERE status = 'ready' AND run_at <= now() AND queue = ANY($1::text[])
           ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT 1
         )
         RETURNING id, queue, payload, attempts`,
        [queues, lockSec],
      );
      return r.rows[0] ?? null;
    },

    async complete(id: number): Promise<void> {
      await db.query("UPDATE job SET status = 'done', finished_at = now(), locked_until = NULL WHERE id = $1", [id]);
    },

    async fail(job: Job, err: unknown): Promise<'retry' | 'dead'> {
      const dead = job.attempts >= MAX_ATTEMPTS;
      // The message only: an error body could hold a child's words.
      const message = String((err as Error)?.message ?? err).slice(0, 300);
      await db.query(
        `UPDATE job SET status = $2, last_error = $3, locked_until = NULL,
                run_at = now() + make_interval(secs => $4), finished_at = CASE WHEN $2 = 'dead' THEN now() END
         WHERE id = $1`,
        [job.id, dead ? 'dead' : 'ready', message, 5 * 2 ** job.attempts],
      );
      return dead ? 'dead' : 'retry';
    },

    // A worker that died mid-job leaves it running; this hands it back.
    async reclaimStale(): Promise<number> {
      const r = await db.query("UPDATE job SET status = 'ready', locked_until = NULL WHERE status = 'running' AND locked_until < now()");
      return r.rowCount;
    },

    async purgeFinished(olderThanDays = 7): Promise<number> {
      const r = await db.query("DELETE FROM job WHERE status = 'done' AND finished_at < now() - make_interval(days => $1)", [olderThanDays]);
      return r.rowCount;
    },
  };
}

export type Queue = ReturnType<typeof createJobQueue>;
