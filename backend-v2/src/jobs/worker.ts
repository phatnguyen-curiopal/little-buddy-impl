import type { WorkerDeps } from './nightly.ts';
import { handleJob, scheduleTick } from './handlers.ts';
import type { QueueName } from './queue.ts';

const ALL: QueueName[] = ['send-alert', 'learn-turn', 'nightly-sleep', 'build-digest', 'maintenance'];

export function createWorker(deps: WorkerDeps, opts: { queues?: QueueName[]; pollMs?: number; scheduleMs?: number } = {}) {
  const queues = opts.queues ?? ALL;
  const pollMs = opts.pollMs ?? 500;
  let running = false;
  let loop: Promise<void> | null = null;
  let scheduler: NodeJS.Timeout | undefined;

  // Runs jobs until the queue is empty; returns how many ran. Tests call this directly.
  async function drain(max = 100): Promise<number> {
    let ran = 0;
    while (ran < max) {
      const job = await deps.queue.claim(queues);
      if (!job) break;
      ran += 1;
      try {
        await handleJob(deps, job);
        await deps.queue.complete(job.id);
      } catch (err) {
        const outcome = await deps.queue.fail(job, err);
        deps.log.warn('job failed', { job_id: job.id, queue: job.queue, attempts: job.attempts, outcome, error: (err as Error).message });
      }
    }
    return ran;
  }

  return {
    drain,
    start() {
      if (running) return;
      running = true;
      loop = (async () => {
        while (running) {
          const ran = await drain(20).catch((err) => {
            deps.log.error('worker loop error', { error: err });
            return 0;
          });
          if (!ran) await new Promise((r) => setTimeout(r, pollMs));
        }
      })();
      const tick = () => void scheduleTick(deps).catch((err) => deps.log.error('schedule tick failed', { error: err }));
      tick();
      scheduler = setInterval(tick, opts.scheduleMs ?? 5 * 60_000);
    },
    async stop() {
      running = false;
      clearInterval(scheduler);
      await loop;
    },
  };
}
