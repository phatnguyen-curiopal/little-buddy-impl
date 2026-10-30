// Safety events: the record of every danger signal, and the trigger for
// parent alerts. The excerpt is kept only for concern and urgent events,
// because it is the one place a parent ever sees the child's words.

import type { Queryable } from '../db/index.ts';
import type { Severity } from '../domain/types.ts';
import type { JobQueue } from '../jobs/queue.ts';

export interface SafetyEventInput {
  childId: string;
  sessionId: string | null;
  turnId: string | null;
  severity: Exclude<Severity, 'none'>;
  category: string;
  detectedBy: 'input' | 'output' | 'classifier';
  excerpt: string | null;
}

export async function recordSafetyEvent(q: Queryable, queue: JobQueue, ev: SafetyEventInput): Promise<string> {
  const alert = ev.severity === 'concern' || ev.severity === 'urgent';
  const r = await q.query<{ id: string }>(
    `INSERT INTO safety_event (child_id, session_id, turn_id, severity, category, detected_by, excerpt, review_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      ev.childId,
      ev.sessionId,
      ev.turnId,
      ev.severity,
      ev.category,
      ev.detectedBy,
      alert && ev.excerpt ? ev.excerpt.slice(0, 200) : null,
      ev.severity === 'urgent' ? 'queued' : 'none',
    ],
  );
  const id = r.rows[0].id;
  if (alert) await queue.enqueue('send-alert', { safety_event_id: id }, { q });
  return id;
}
