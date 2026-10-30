import type { FastifyInstance } from 'fastify';

import { notFound } from '../../util/errors.ts';
import { authOf, childFor, idempotent, page, paging, uuidParam, type ApiDeps } from '../context.ts';

export function registerParent(app: FastifyInstance, deps: ApiDeps) {
  const { db } = deps;

  // The only response in the API that carries a child's words: the excerpt
  // of a concern or urgent safety event.
  app.get('/children/:childId/alerts', async (req) => {
    const child = await childFor(deps, req);
    const { limit, offset } = paging(req.query);
    const r = await db.query(
      `SELECT id, severity, category, excerpt, created_at, acknowledged_at FROM safety_event
       WHERE child_id = $1 AND severity IN ('concern', 'urgent')
       ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
      [child.id, limit + 1, offset],
    );
    return page(r.rows, limit, offset);
  });

  app.post('/children/:childId/alerts/:alertId/acknowledge', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { alertId: string }).alertId, 'alert');
    const r = await db.query('UPDATE safety_event SET acknowledged_at = coalesce(acknowledged_at, now()) WHERE id = $1 AND child_id = $2', [id, child.id]);
    if (!r.rowCount) throw notFound('alert');
    return reply.code(204).send();
  });

  app.delete('/children/:childId/alerts/:alertId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { alertId: string }).alertId, 'alert');
    const r = await db.query('DELETE FROM safety_event WHERE id = $1 AND child_id = $2', [id, child.id]);
    if (!r.rowCount) throw notFound('alert');
    return reply.code(204).send();
  });

  app.get('/children/:childId/digests', async (req) => {
    const child = await childFor(deps, req);
    const { limit, offset } = paging(req.query);
    const r = await db.query(
      'SELECT id, week_start::text AS week_start, content, created_at FROM digest WHERE child_id = $1 ORDER BY week_start DESC LIMIT $2 OFFSET $3',
      [child.id, limit + 1, offset],
    );
    return page(r.rows, limit, offset);
  });

  app.get('/children/:childId/digests/:weekStart', async (req) => {
    const child = await childFor(deps, req);
    const week = (req.params as { weekStart: string }).weekStart;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw notFound('digest');
    const r = await db.query('SELECT id, week_start::text AS week_start, content, created_at FROM digest WHERE child_id = $1 AND week_start = $2::date', [child.id, week]);
    if (!r.rows[0]) throw notFound('digest');
    return r.rows[0];
  });

  app.get('/children/:childId/nudges', async (req) => {
    const child = await childFor(deps, req);
    const r = await db.query(
      `SELECT id, content, use_after, expires_at, status, used_at FROM nudge
       WHERE child_id = $1 AND status IN ('pending', 'used') ORDER BY use_after DESC LIMIT 100`,
      [child.id],
    );
    return { data: r.rows };
  });

  app.post('/children/:childId/nudges', {
    schema: {
      body: {
        type: 'object', required: ['content'], additionalProperties: false,
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 300 },
          use_after: { type: ['string', 'null'], format: 'date-time' },
          expires_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    return idempotent(deps, req, reply, `POST /children/${child.id}/nudges`, async () => {
      const b = req.body as { content: string; use_after?: string | null; expires_at?: string | null };
      const r = await db.query(
        `INSERT INTO nudge (child_id, parent_id, content, use_after, expires_at) VALUES ($1, $2, $3, coalesce($4::timestamptz, now()), $5)
         RETURNING id, content, use_after, expires_at, status, used_at`,
        [child.id, authOf(req).parentId, b.content.trim(), b.use_after ?? null, b.expires_at ?? null],
      );
      return { status: 201, body: r.rows[0] };
    });
  });

  app.delete('/children/:childId/nudges/:nudgeId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { nudgeId: string }).nudgeId, 'nudge');
    const r = await db.query("UPDATE nudge SET status = 'cancelled' WHERE id = $1 AND child_id = $2 AND status = 'pending'", [id, child.id]);
    if (!r.rowCount) throw notFound('nudge');
    return reply.code(204).send();
  });

  app.get('/children/:childId/goals', async (req) => {
    const child = await childFor(deps, req);
    const r = await db.query('SELECT id, focus, created_at FROM goal WHERE child_id = $1 AND active ORDER BY created_at', [child.id]);
    return { data: r.rows };
  });

  app.put('/children/:childId/goals', {
    schema: {
      body: {
        type: 'object', required: ['focuses'], additionalProperties: false,
        properties: { focuses: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 60 } } },
      },
    },
  }, async (req) => {
    const child = await childFor(deps, req);
    const focuses = [...new Set((req.body as { focuses: string[] }).focuses.map((f) => f.trim()).filter(Boolean))];
    await db.tx(async (q) => {
      await q.query('UPDATE goal SET active = false WHERE child_id = $1 AND active AND NOT (focus = ANY($2::text[]))', [child.id, focuses]);
      for (const f of focuses) {
        const exists = await q.query('SELECT 1 FROM goal WHERE child_id = $1 AND focus = $2 AND active', [child.id, f]);
        if (!exists.rowCount) await q.query('INSERT INTO goal (child_id, focus) VALUES ($1, $2)', [child.id, f]);
      }
    });
    const r = await db.query('SELECT id, focus, created_at FROM goal WHERE child_id = $1 AND active ORDER BY created_at', [child.id]);
    return { data: r.rows };
  });
}
