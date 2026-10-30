import type { FastifyInstance } from 'fastify';

import { claimCodeHash, loadDeviceSecret, normalizeClaimCode, parseClaimToken, verifyClaimToken } from '../../devices/credentials.ts';
import { isActiveToyClash, releaseToys } from '../../devices/lifecycle.ts';
import { HttpError, badRequest, conflict, notFound } from '../../util/errors.ts';
import {
  CHILD_COLUMNS, authOf, childFor, idempotent, ifMatch, publicChild, sendWithEtag, uuidParam, type ApiDeps, type ChildRecord,
} from '../context.ts';

export const DEVICE_COLUMNS = `id, serial, hardware_rev, status, disabled_by, child_id, firmware_version, last_seen_at, claimed_at,
  (last_seen_at IS NOT NULL AND last_seen_at > now() - interval '2 minutes') AS online`;

const childProps = {
  name: { type: 'string', minLength: 1, maxLength: 60 },
  nickname: { type: ['string', 'null'], maxLength: 40 },
  birth_date: { type: ['string', 'null'], format: 'date' },
  languages: { type: 'array', items: { type: 'string', enum: ['vi', 'en'] }, minItems: 1, maxItems: 2 },
  time_zone: { type: 'string', maxLength: 64 },
  city: { type: ['string', 'null'], maxLength: 80 },
} as const;

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function registerChildren(app: FastifyInstance, deps: ApiDeps) {
  const { db } = deps;

  app.post('/children', {
    schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: childProps } },
  }, async (req, reply) => {
    const b = req.body as { name: string; nickname?: string | null; birth_date?: string | null; languages?: string[]; time_zone?: string; city?: string | null };
    if (b.time_zone && !validTimeZone(b.time_zone)) throw new HttpError(400, 'invalid-request', 'Unknown time zone', [{ field: 'time_zone', code: 'enum' }]);
    const child = await db.tx(async (q) => {
      const r = await q.query<ChildRecord>(
        `INSERT INTO child (family_id, name, nickname, birth_date, languages, time_zone, city)
         VALUES ($1, $2, $3, $4, coalesce($5, '{vi}'::text[]), coalesce($6, 'Asia/Ho_Chi_Minh'), $7) RETURNING ${CHILD_COLUMNS}`,
        [authOf(req).familyId, b.name.trim(), b.nickname ?? null, b.birth_date ?? null, b.languages ?? null, b.time_zone ?? null, b.city ?? null],
      );
      await q.query('INSERT INTO child_controls (child_id) VALUES ($1)', [r.rows[0].id]);
      return r.rows[0];
    });
    return reply.code(201).send(publicChild(child));
  });

  app.get('/children', async (req) => {
    const r = await db.query<ChildRecord>(`SELECT ${CHILD_COLUMNS} FROM child WHERE family_id = $1 ORDER BY created_at`, [authOf(req).familyId]);
    return { data: r.rows.map(publicChild) };
  });

  app.get('/children/:childId', async (req) => publicChild(await childFor(deps, req)));

  app.patch('/children/:childId', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { ...childProps, learning_enabled: { type: 'boolean' } } } },
  }, async (req) => {
    const child = await childFor(deps, req);
    const b = req.body as Partial<ChildRecord>;
    if (b.time_zone && !validTimeZone(b.time_zone)) throw new HttpError(400, 'invalid-request', 'Unknown time zone', [{ field: 'time_zone', code: 'enum' }]);
    if (b.learning_enabled === true && !child.learning_enabled) {
      const consent = await db.query("SELECT 1 FROM consent WHERE family_id = $1 AND kind = 'learning' AND revoked_at IS NULL", [child.family_id]);
      if (!consent.rowCount) throw new HttpError(409, 'consent-required', 'Give learning consent before Buddy can remember');
    }
    const r = await db.query<ChildRecord>(
      `UPDATE child SET
         name = coalesce($2, name), nickname = CASE WHEN $3 THEN $4 ELSE nickname END,
         birth_date = CASE WHEN $5 THEN $6::date ELSE birth_date END, languages = coalesce($7, languages),
         time_zone = coalesce($8, time_zone), city = CASE WHEN $9 THEN $10 ELSE city END,
         learning_since = CASE WHEN $11 IS TRUE AND NOT learning_enabled THEN now() ELSE learning_since END,
         learning_enabled = coalesce($11, learning_enabled), updated_at = now()
       WHERE id = $1 RETURNING ${CHILD_COLUMNS}`,
      [
        child.id, b.name ?? null, 'nickname' in b, b.nickname ?? null, 'birth_date' in b, b.birth_date ?? null,
        b.languages ?? null, b.time_zone ?? null, 'city' in b, b.city ?? null, b.learning_enabled ?? null,
      ],
    );
    return publicChild(r.rows[0]);
  });

  app.delete('/children/:childId', async (req, reply) => {
    const child = await childFor(deps, req);
    const toys = await db.tx(async (q) => {
      const released = await releaseToys(q, { childId: child.id }, `parent:${authOf(req).parentId}`);
      await q.query('DELETE FROM child WHERE id = $1', [child.id]);
      return released;
    });
    for (const id of toys) deps.onDeviceBlocked?.(id);
    return reply.code(204).send();
  });

  // Pairing: the app relays a claim token the toy signed over Bluetooth, or
  // the website sends the code printed on the box.
  app.post('/devices/claim', {
    schema: {
      body: {
        type: 'object', required: ['child_id'], additionalProperties: false,
        properties: {
          claim_token: { type: 'string', maxLength: 200 },
          claim_code: { type: 'string', maxLength: 20 },
          child_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (req, reply) => idempotent(deps, req, reply, 'POST /devices/claim', async () => {
    const { familyId, parentId } = authOf(req);
    const body = req.body as { claim_token?: string; claim_code?: string; child_id: string };
    if (Boolean(body.claim_token) === Boolean(body.claim_code)) throw badRequest('Send either a claim_token or a claim_code', [{ field: 'claim_code', code: 'required' }]);
    // A printed code is only about 39 bits, so pairing has a small budget per
    // parent (the first backend's 10 an hour) on top of the general limit.
    if (deps.pairLimit && !deps.pairLimit(`parent:${parentId}`)) throw new HttpError(429, 'rate-limited', 'Too many pairing attempts, wait a little and try again');
    const invalid = new HttpError(404, 'invalid-claim', 'This pairing code is not valid; try pairing again');
    const childHasToy = conflict('child-has-toy', 'This child already has a toy; unpair it first');

    // The child comes before the code, so a wrong child, or a child that
    // already has an awake toy, gets the same answer whatever code was sent:
    // those answers cannot tell anyone whether a guessed code exists.
    const child = await db.query('SELECT id FROM child WHERE id = $1 AND family_id = $2', [body.child_id, familyId]);
    if (!child.rowCount) throw notFound('child');
    const busy = (await db.query<{ id: string }>("SELECT id FROM device WHERE child_id = $1 AND status = 'active'", [body.child_id])).rows[0];
    let deviceId: string | null = null;
    if (body.claim_token) {
      const parsed = parseClaimToken(body.claim_token);
      const secret = parsed ? await loadDeviceSecret(db, deps.config.deviceKek, parsed.deviceId) : null;
      if (parsed && secret && verifyClaimToken(secret, parsed, Math.floor(Date.now() / 1000))) deviceId = parsed.deviceId;
    } else {
      const code = normalizeClaimCode(body.claim_code!);
      if (code) deviceId = (await db.query<{ id: string }>('SELECT id FROM device WHERE claim_code_hash = $1', [claimCodeHash(deps.config.deviceKek, code)])).rows[0]?.id ?? null;
    }
    // A token the toy signed cannot be guessed, so a bad one may say so
    // first; only a printed code needs the busy child to answer before it.
    if (!deviceId && body.claim_token) throw invalid;
    // The child's own awake toy, sent again, is a retry and answers below.
    if (busy && busy.id !== deviceId) throw childHasToy;
    if (!deviceId) throw invalid;
    const claimed = deviceId;

    let device: 'claimed' | 'unchanged';
    try {
      device = await db.tx(async (q) => {
        const d = (await q.query<{ status: string; family_id: string | null; child_id: string | null }>('SELECT status, family_id, child_id FROM device WHERE id = $1 FOR UPDATE', [claimed])).rows[0];
        if (!d) throw invalid;
        // A retry by the family that already owns it is not an error.
        if (d.status === 'active' && d.family_id === familyId && d.child_id === body.child_id) return 'unchanged';
        // The family's own toy, asleep or with another of their children, is
        // theirs to hear about: it moves to a child only after an unpair.
        if (d.family_id === familyId) throw conflict('toy-in-family', 'This toy is already yours; unpair it first to give it to another child');
        // A printed code someone else already used reads as any wrong code, so
        // codes cannot be probed; only the toy's own signed token says more.
        if (d.status !== 'provisioned') throw body.claim_code ? invalid : conflict('device-claimed', 'This toy belongs to another family or is disabled');
        const clash = await q.query("SELECT 1 FROM device WHERE child_id = $1 AND status = 'active'", [body.child_id]);
        if (clash.rowCount) throw childHasToy;
        await q.query("UPDATE device SET status = 'active', family_id = $2, child_id = $3, claimed_at = now() WHERE id = $1", [claimed, familyId, body.child_id]);
        await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'claimed', $2)", [claimed, `parent:${parentId}`]);
        return 'claimed';
      });
    } catch (err) {
      // Another request gave this child an awake toy in the meantime.
      if (isActiveToyClash(err)) throw childHasToy;
      throw err;
    }
    const row = (await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE id = $1`, [claimed])).rows[0];
    return { status: device === 'claimed' ? 201 : 200, body: row };
  }));

  app.get('/devices', async (req) => {
    const r = await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE family_id = $1 ORDER BY claimed_at`, [authOf(req).familyId]);
    return { data: r.rows };
  });

  app.get('/devices/:deviceId', async (req) => {
    const id = uuidParam((req.params as { deviceId: string }).deviceId, 'toy');
    const r = await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE id = $1 AND family_id = $2`, [id, authOf(req).familyId]);
    if (!r.rows[0]) throw notFound('toy');
    return r.rows[0];
  });

  app.post('/devices/:deviceId/unpair', async (req, reply) => {
    const id = uuidParam((req.params as { deviceId: string }).deviceId, 'toy');
    const { familyId, parentId } = authOf(req);
    const released = await db.tx((q) => releaseToys(q, { deviceId: id, familyId }, `parent:${parentId}`));
    if (!released.length) throw notFound('toy');
    deps.onDeviceBlocked?.(id);
    return reply.code(204).send();
  });

  // A parent can put a toy to sleep and wake it again; a toy staff disabled
  // stays disabled.
  app.post('/devices/:deviceId/pause', async (req) => {
    const id = uuidParam((req.params as { deviceId: string }).deviceId, 'toy');
    const { familyId, parentId } = authOf(req);
    const paused = await db.tx(async (q) => {
      const r = await q.query("UPDATE device SET status = 'disabled', disabled_by = 'parent' WHERE id = $1 AND family_id = $2 AND status = 'active'", [id, familyId]);
      if (r.rowCount) await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'disabled', $2)", [id, `parent:${parentId}`]);
      return r.rowCount > 0;
    });
    const row = (await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE id = $1 AND family_id = $2`, [id, familyId])).rows[0];
    if (!row) throw notFound('toy');
    if (!paused && !(row.status === 'disabled' && row.disabled_by === 'parent')) throw conflict('toy-not-active', 'Only a toy that is awake can be put to sleep');
    // Closes its live socket at once when the voice service runs here.
    deps.onDeviceBlocked?.(id);
    return row;
  });

  app.post('/devices/:deviceId/resume', async (req) => {
    const id = uuidParam((req.params as { deviceId: string }).deviceId, 'toy');
    const { familyId, parentId } = authOf(req);
    try {
      await db.tx(async (q) => {
        const r = await q.query(
          "UPDATE device SET status = 'active', disabled_by = NULL WHERE id = $1 AND family_id = $2 AND status = 'disabled' AND disabled_by = 'parent'",
          [id, familyId],
        );
        if (r.rowCount) await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'enabled', $2)", [id, `parent:${parentId}`]);
      });
    } catch (err) {
      // The child got another toy while this one slept: one active toy each.
      if (isActiveToyClash(err)) throw conflict('child-has-toy', 'This child already has an awake toy; unpair one first');
      throw err;
    }
    const row = (await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE id = $1 AND family_id = $2`, [id, familyId])).rows[0];
    if (!row) throw notFound('toy');
    if (row.status !== 'active') throw conflict('toy-held', 'Only a toy a parent put to sleep can be woken here');
    return row;
  });

  const CONTROLS = `daily_limit_min, quiet_start::text AS quiet_start, quiet_end::text AS quiet_end, bedtime::text AS bedtime,
    topics_to_avoid, mood_pin, surprise_play, speak_first, updated_at, xmin::text AS etag`;

  app.get('/children/:childId/controls', async (req, reply) => {
    const child = await childFor(deps, req);
    const r = await db.query(`SELECT ${CONTROLS} FROM child_controls WHERE child_id = $1`, [child.id]);
    if (!r.rows[0]) throw notFound('controls');
    return sendWithEtag(reply, r.rows[0] as { etag: string });
  });

  const time = { type: ['string', 'null'], pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' };
  app.put('/children/:childId/controls', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['daily_limit_min', 'quiet_start', 'quiet_end', 'bedtime', 'topics_to_avoid', 'mood_pin'],
        properties: {
          daily_limit_min: { type: ['integer', 'null'], minimum: 5, maximum: 240 },
          quiet_start: time,
          quiet_end: time,
          bedtime: { type: 'string', pattern: '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' },
          topics_to_avoid: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 60 } },
          mood_pin: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
          // Optional, so older clients keep working: startle games ("hù") and
          // letting Buddy speak first (which the service must also allow).
          surprise_play: { type: 'boolean' },
          speak_first: { type: 'boolean' },
        },
      },
    },
  }, async (req, reply) => {
    const child = await childFor(deps, req);
    const etag = ifMatch(req);
    const b = req.body as {
      daily_limit_min: number | null; quiet_start: string | null; quiet_end: string | null; bedtime: string; topics_to_avoid: string[]; mood_pin: number | null;
      surprise_play?: boolean; speak_first?: boolean;
    };
    const r = await db.query(
      `UPDATE child_controls SET daily_limit_min = $3, quiet_start = $4::time, quiet_end = $5::time, bedtime = $6::time,
              topics_to_avoid = $7, mood_pin = $8, surprise_play = coalesce($9, surprise_play), speak_first = coalesce($10, speak_first), updated_at = now()
       WHERE child_id = $1 AND xmin::text = $2 RETURNING ${CONTROLS}`,
      [child.id, etag, b.daily_limit_min, b.quiet_start, b.quiet_end, b.bedtime, b.topics_to_avoid, b.mood_pin, b.surprise_play ?? null, b.speak_first ?? null],
    );
    if (!r.rows[0]) throw new HttpError(412, 'stale-write', 'These settings changed since you loaded them. Reload and try again.');
    return sendWithEtag(reply, r.rows[0] as { etag: string });
  });

  app.get('/children/:childId/usage', {
    schema: { querystring: { type: 'object', properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } } } },
  }, async (req) => {
    const child = await childFor(deps, req);
    const q = req.query as { from?: string; to?: string };
    const r = await db.query(
      `SELECT day::text AS day, turns, round(talk_seconds / 60.0, 1)::float AS talk_minutes FROM usage_daily
       WHERE child_id = $1 AND day >= coalesce($2::date, current_date - 30) AND day <= coalesce($3::date, current_date)
       ORDER BY day`,
      [child.id, q.from ?? null, q.to ?? null],
    );
    return { data: r.rows };
  });

}
