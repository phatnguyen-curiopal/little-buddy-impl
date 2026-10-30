// "What Buddy knows": the parent can see, fix and delete every memory.
// Edits carry If-Match, because the learner may have changed the same item
// a moment ago.

import type { FastifyInstance } from 'fastify';

import { FACT_CATEGORIES, PERSON_KINDS } from '../../gateway/schemas.ts';
import { buildDigest } from '../../memory/digest.ts';
import { forgetEverything } from '../../memory/forget.ts';
import { nameKey } from '../../memory/names.ts';
import { notFound } from '../../util/errors.ts';
import { childFor, ifMatch, missingOrStale, page, paging, sendWithEtag, uuidParam, type ApiDeps } from '../context.ts';

const PERSON = `id, display_name, kind, relation, details, aliases, cues, also_word, round(closeness::numeric, 2)::float AS closeness,
  mentions, first_mentioned_at, last_mentioned_at, xmin::text AS etag`;
const FACT = `id, category, statement, person_id, source, round(confidence::numeric, 2)::float AS confidence, reality,
  sensitivity, mentions, first_seen_at, last_seen_at, xmin::text AS etag`;
const EVENT = `id, kind, description, person_id, starts_on::text AS starts_on, ends_on::text AS ends_on, recurrence,
  follow_up_due, status, created_at, xmin::text AS etag`;

export function registerMemory(app: FastifyInstance, deps: ApiDeps) {
  const { db } = deps;

  app.get('/children/:childId/memory/summary', async (req) => {
    const child = await childFor(deps, req);
    const digest = await buildDigest(db, child.id);
    const counts = await db.query<{ people: number; facts: number; events: number }>(
      `SELECT (SELECT count(*)::int FROM person WHERE child_id = $1) AS people,
              (SELECT count(*)::int FROM fact WHERE child_id = $1 AND status = 'active') AS facts,
              (SELECT count(*)::int FROM child_event WHERE child_id = $1 AND status = 'open') AS events`,
      [child.id],
    );
    return { ...digest, counts: counts.rows[0], learning_enabled: child.learning_enabled };
  });

  app.get('/children/:childId/people', {
    schema: { querystring: { type: 'object', properties: { kind: { type: 'string', enum: [...PERSON_KINDS] }, limit: { type: 'string' }, cursor: { type: 'string' } } } },
  }, async (req) => {
    const child = await childFor(deps, req);
    const { limit, offset } = paging(req.query);
    const kind = (req.query as { kind?: string }).kind ?? null;
    const r = await db.query(
      `SELECT ${PERSON} FROM person WHERE child_id = $1 AND status = 'active' AND ($2::text IS NULL OR kind = $2)
       ORDER BY closeness DESC, mentions DESC, id LIMIT $3 OFFSET $4`,
      [child.id, kind, limit + 1, offset],
    );
    return page(r.rows, limit, offset);
  });

  app.get('/children/:childId/people/:personId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { personId: string }).personId, 'person');
    const r = await db.query(`SELECT ${PERSON} FROM person WHERE id = $1 AND child_id = $2`, [id, child.id]);
    if (!r.rows[0]) throw notFound('person');
    const facts = await db.query(`SELECT ${FACT} FROM fact WHERE person_id = $1 AND status = 'active' ORDER BY last_seen_at DESC`, [id]);
    return sendWithEtag(reply, { ...(r.rows[0] as { etag: string }), facts: facts.rows });
  });

  app.patch('/children/:childId/people/:personId', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          display_name: { type: 'string', minLength: 1, maxLength: 60 },
          kind: { type: 'string', enum: [...PERSON_KINDS] },
          relation: { type: ['string', 'null'], maxLength: 60 },
          details: { type: 'object', maxProperties: 20 },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { personId: string }).personId, 'person');
    const etag = ifMatch(req);
    const b = req.body as { display_name?: string; kind?: string; relation?: string | null; details?: Record<string, unknown> };
    // A renamed card keeps its old key as an alias, so speech that still
    // produces the old spelling finds the same person. The ordinary meaning
    // belonged to the old name, so it goes.
    const r = await db.query(
      `UPDATE person SET
         aliases = CASE WHEN $3::text IS NOT NULL AND $4 <> name_key THEN array_append(aliases, name_key) ELSE aliases END,
         also_word = CASE WHEN $3::text IS NOT NULL AND $4 <> name_key THEN NULL ELSE also_word END,
         display_name = coalesce($3, display_name), name_key = coalesce($4, name_key), kind = coalesce($5, kind),
         relation = CASE WHEN $6 THEN $7 ELSE relation END, details = coalesce($8, details), embedding = CASE WHEN $3::text IS NOT NULL THEN NULL ELSE embedding END
       WHERE id = $1 AND child_id = $2 AND xmin::text = $9 RETURNING ${PERSON}`,
      [id, child.id, b.display_name ?? null, b.display_name ? nameKey(b.display_name) : null, b.kind ?? null, 'relation' in b, b.relation ?? null, b.details ? JSON.stringify(b.details) : null, etag],
    );
    if (!r.rows[0]) return missingOrStale(deps, 'person', id, child.id);
    return sendWithEtag(reply, r.rows[0] as { etag: string });
  });

  app.delete('/children/:childId/people/:personId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { personId: string }).personId, 'person');
    const r = await db.query('DELETE FROM person WHERE id = $1 AND child_id = $2', [id, child.id]);
    if (!r.rowCount) throw notFound('person');
    return reply.code(204).send();
  });

  app.get('/children/:childId/facts', {
    schema: { querystring: { type: 'object', properties: { category: { type: 'string', enum: [...FACT_CATEGORIES] }, limit: { type: 'string' }, cursor: { type: 'string' } } } },
  }, async (req) => {
    const child = await childFor(deps, req);
    const { limit, offset } = paging(req.query);
    const category = (req.query as { category?: string }).category ?? null;
    const r = await db.query(
      `SELECT ${FACT} FROM fact WHERE child_id = $1 AND status = 'active' AND ($2::text IS NULL OR category = $2)
       ORDER BY last_seen_at DESC, id LIMIT $3 OFFSET $4`,
      [child.id, category, limit + 1, offset],
    );
    return page(r.rows, limit, offset);
  });

  app.post('/children/:childId/facts', {
    schema: {
      body: {
        type: 'object', required: ['category', 'statement'], additionalProperties: false,
        properties: { category: { type: 'string', enum: [...FACT_CATEGORIES] }, statement: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const b = req.body as { category: string; statement: string };
    // Parent facts outrank the child's tall tales: full confidence, source "parent".
    const r = await db.query(
      `INSERT INTO fact (child_id, category, statement, source, confidence) VALUES ($1, $2, $3, 'parent', 1) RETURNING ${FACT}`,
      [child.id, b.category, b.statement.trim()],
    );
    return sendWithEtag(reply, r.rows[0] as { etag: string }, 201);
  });

  app.patch('/children/:childId/facts/:factId', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: { category: { type: 'string', enum: [...FACT_CATEGORIES] }, statement: { type: 'string', minLength: 1, maxLength: 200 } },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { factId: string }).factId, 'fact');
    const etag = ifMatch(req);
    const b = req.body as { category?: string; statement?: string };
    // The embedding is cleared so the nightly job re-embeds the corrected text.
    const r = await db.query(
      `UPDATE fact SET category = coalesce($3, category), statement = coalesce($4, statement), source = 'parent', confidence = 1,
              embedding = CASE WHEN $4::text IS NOT NULL THEN NULL ELSE embedding END, last_seen_at = now()
       WHERE id = $1 AND child_id = $2 AND xmin::text = $5 RETURNING ${FACT}`,
      [id, child.id, b.category ?? null, b.statement?.trim() ?? null, etag],
    );
    if (!r.rows[0]) return missingOrStale(deps, 'fact', id, child.id);
    return sendWithEtag(reply, r.rows[0] as { etag: string });
  });

  app.delete('/children/:childId/facts/:factId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { factId: string }).factId, 'fact');
    const r = await db.query('DELETE FROM fact WHERE id = $1 AND child_id = $2', [id, child.id]);
    if (!r.rowCount) throw notFound('fact');
    return reply.code(204).send();
  });

  app.get('/children/:childId/events', async (req) => {
    const child = await childFor(deps, req);
    const { limit, offset } = paging(req.query);
    const r = await db.query(
      `SELECT ${EVENT} FROM child_event WHERE child_id = $1 AND status IN ('open', 'followed_up')
       ORDER BY coalesce(starts_on, created_at::date) DESC, id LIMIT $2 OFFSET $3`,
      [child.id, limit + 1, offset],
    );
    return page(r.rows, limit, offset);
  });

  app.patch('/children/:childId/events/:eventId', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 200 },
          starts_on: { type: ['string', 'null'], format: 'date' },
          status: { type: 'string', enum: ['open', 'followed_up', 'done', 'cancelled'] },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { eventId: string }).eventId, 'event');
    const etag = ifMatch(req);
    const b = req.body as { description?: string; starts_on?: string | null; status?: string };
    const r = await db.query(
      `UPDATE child_event SET description = coalesce($3, description), starts_on = CASE WHEN $4 THEN $5::date ELSE starts_on END,
              status = coalesce($6, status)
       WHERE id = $1 AND child_id = $2 AND xmin::text = $7 RETURNING ${EVENT}`,
      [id, child.id, b.description ?? null, 'starts_on' in b, b.starts_on ?? null, b.status ?? null, etag],
    );
    if (!r.rows[0]) return missingOrStale(deps, 'child_event', id, child.id);
    return sendWithEtag(reply, r.rows[0] as { etag: string });
  });

  app.delete('/children/:childId/events/:eventId', async (req, reply) => {
    const child = await childFor(deps, req);
    const id = uuidParam((req.params as { eventId: string }).eventId, 'event');
    const r = await db.query('DELETE FROM child_event WHERE id = $1 AND child_id = $2', [id, child.id]);
    if (!r.rowCount) throw notFound('event');
    return reply.code(204).send();
  });

  app.get('/children/:childId/relationship', async (req) => {
    const child = await childFor(deps, req);
    const r = await db.query(
      `SELECT id, kind, content, due_at, status, last_used_at, created_at FROM relationship_item
       WHERE child_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 200`,
      [child.id],
    );
    return { data: r.rows };
  });

  app.delete('/children/:childId/memory', async (req, reply) => {
    const child = await childFor(deps, req);
    await forgetEverything(db, child.id);
    return reply.code(204).send();
  });
}
