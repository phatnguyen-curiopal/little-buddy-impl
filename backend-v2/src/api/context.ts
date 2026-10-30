// Shared plumbing for the Parent API: auth, family scoping, ETags,
// idempotency and paging. Every child-level route goes through childFor, so a
// child outside the caller's family is indistinguishable from a missing one.

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { OidcVerifier } from '../auth/oidc.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import type { Queue } from '../jobs/queue.ts';
import type { Logger } from '../log.ts';
import { HttpError, notFound, staleWrite } from '../util/errors.ts';

export interface ApiDeps {
  db: Db;
  config: Config;
  log: Logger;
  queue: Queue;
  oidc: OidcVerifier;
  // Closes a toy's live socket when the voice service runs in this process.
  onDeviceBlocked?: (deviceId: string) => void;
  // Pairing (claiming a toy, making a Buddy in the browser): a printed code
  // is only about 39 bits, so attempts get a budget of their own.
  pairLimit?: (key: string) => boolean;
}

export interface AuthCtx {
  parentId: string;
  familyId: string;
}

export type Authed = FastifyRequest & { auth: AuthCtx };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authOf(req: FastifyRequest): AuthCtx {
  return (req as Authed).auth;
}

export function uuidParam(value: unknown, what: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw notFound(what);
  return value;
}

export interface ChildRecord {
  id: string;
  family_id: string;
  name: string;
  nickname: string | null;
  birth_date: string | null;
  languages: string[];
  time_zone: string;
  city: string | null;
  learning_enabled: boolean;
  created_at: Date;
}

export const CHILD_COLUMNS = 'id, family_id, name, nickname, birth_date::text AS birth_date, languages, time_zone, city, learning_enabled, created_at';

export async function childFor(deps: ApiDeps, req: FastifyRequest): Promise<ChildRecord> {
  const childId = uuidParam((req.params as { childId?: string }).childId, 'child');
  const r = await deps.db.query<ChildRecord>(`SELECT ${CHILD_COLUMNS} FROM child WHERE id = $1 AND family_id = $2`, [childId, authOf(req).familyId]);
  if (!r.rows[0]) throw notFound('child');
  return r.rows[0];
}

export function publicChild(c: ChildRecord) {
  const { family_id: _family, ...rest } = c;
  return rest;
}

// ETags are the row's xmin: it changes on every update, costs nothing to
// read, and needs no version column.
export function ifMatch(req: FastifyRequest): string {
  const raw = req.headers['if-match'];
  if (typeof raw !== 'string' || !raw.trim()) throw new HttpError(428, 'precondition-required', 'Send If-Match with the ETag you loaded');
  return raw.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}

export function sendWithEtag(reply: FastifyReply, row: Record<string, unknown> & { etag: string }, status = 200) {
  reply.header('ETag', `"${row.etag}"`);
  return reply.code(status).send(row);
}

// After a guarded UPDATE matched nothing: missing row is 404, changed row is 412.
export async function missingOrStale(deps: ApiDeps, table: string, id: string, childId: string): Promise<never> {
  const r = await deps.db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND child_id = $2`, [id, childId]);
  throw r.rowCount ? staleWrite() : notFound();
}

export function paging(query: unknown): { limit: number; offset: number } {
  const q = (query ?? {}) as { limit?: string; cursor?: string };
  const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? '50', 10) || 50));
  let offset = 0;
  if (q.cursor) {
    try {
      offset = Math.max(0, Number(JSON.parse(Buffer.from(q.cursor, 'base64url').toString('utf8')).o) || 0);
    } catch {
      offset = 0;
    }
  }
  return { limit, offset };
}

export function page<T>(rows: T[], limit: number, offset: number) {
  const more = rows.length > limit;
  return {
    data: more ? rows.slice(0, limit) : rows,
    next_cursor: more ? Buffer.from(JSON.stringify({ o: offset + limit })).toString('base64url') : null,
  };
}

// Replays the first response for a repeated Idempotency-Key, so a retry
// after a lost response cannot claim a toy or post a nudge twice.
export async function idempotent(
  deps: ApiDeps,
  req: FastifyRequest,
  reply: FastifyReply,
  route: string,
  run: () => Promise<{ status: number; body: unknown }>,
) {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !key) {
    const r = await run();
    return reply.code(r.status).send(r.body);
  }
  if (key.length > 100) throw new HttpError(400, 'invalid-request', 'Idempotency-Key is too long');
  const { parentId } = authOf(req);
  const seen = await deps.db.query<{ route: string; status: number; body: unknown }>(
    'SELECT route, status, body FROM idempotency_key WHERE parent_id = $1 AND key = $2',
    [parentId, key],
  );
  if (seen.rows[0]) {
    if (seen.rows[0].route !== route) throw new HttpError(422, 'idempotency-key-reused', 'This Idempotency-Key was used for another request');
    return reply.code(seen.rows[0].status).send(seen.rows[0].body);
  }
  const r = await run();
  if (r.status < 500) {
    await deps.db.query(
      'INSERT INTO idempotency_key (parent_id, key, route, status, body) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [parentId, key, route, r.status, JSON.stringify(r.body ?? null)],
    );
  }
  return reply.code(r.status).send(r.body);
}

// A per-key token bucket in memory. One API instance at this stage; several
// instances would share Redis instead.
export function createRateLimiter(perMinute: number, burst: number) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      return false;
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 50_000) buckets.clear();
    return true;
  };
}
