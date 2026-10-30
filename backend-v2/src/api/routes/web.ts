// What the parent website needs beyond the app's API: a Buddy that lives
// only in the browser, the secret that browser signs in with, and the list
// of recent answers (never the words) for the activity page.

import type { FastifyInstance } from 'fastify';

import { createWebDevice, loadDeviceSecret } from '../../devices/credentials.ts';
import { b64url } from '../../util/crypto.ts';
import { isActiveToyClash } from '../../devices/lifecycle.ts';
import { HttpError, conflict, notFound, tooMany } from '../../util/errors.ts';
import { authOf, uuidParam, type ApiDeps } from '../context.ts';
import { DEVICE_COLUMNS } from './children.ts';

// Revoked Buddies count toward this, or making and removing one in a loop
// would add devices without end.
const WEB_TOYS_PER_DAY = 10;

export function registerWeb(app: FastifyInstance, deps: ApiDeps) {
  const { db, config } = deps;
  const off = () => new HttpError(403, 'web-toy-off', 'Playing Buddy in the browser is not available');

  app.post('/devices/web', {
    schema: {
      body: { type: 'object', required: ['child_id'], additionalProperties: false, properties: { child_id: { type: 'string', format: 'uuid' } } },
    },
  }, async (req, reply) => {
    if (!config.web.webToy) throw off();
    const { familyId, parentId } = authOf(req);
    // The same pairing budget as claiming a toy.
    if (deps.pairLimit && !deps.pairLimit(`parent:${parentId}`)) throw tooMany('Too many new Buddies at once, wait a little and try again', deps.pairLimit.retryAfter(`parent:${parentId}`));
    const childId = (req.body as { child_id: string }).child_id;
    let id: string;
    try {
      id = await db.tx(async (q) => {
        // The family row is the lock, so two quick taps cannot both pass the limit.
        await q.query('SELECT 1 FROM family WHERE id = $1 FOR UPDATE', [familyId]);
        const child = await q.query('SELECT 1 FROM child WHERE id = $1 AND family_id = $2', [childId, familyId]);
        if (!child.rowCount) throw notFound('child');
        const count = await q.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM device WHERE family_id = $1 AND hardware_rev = 'web' AND status <> 'revoked'",
          [familyId],
        );
        if (count.rows[0].n >= config.web.maxWebToys) throw conflict('web-toy-limit', `A family can have ${config.web.maxWebToys} Buddies in the browser`);
        const today = await q.query<{ n: number; wait: number }>(
          `SELECT count(*)::int AS n, coalesce(extract(epoch FROM min(e.at) + interval '1 day' - now()), 0)::float8 AS wait FROM device_event e
           JOIN device d ON d.id = e.device_id
           JOIN parent_user p ON e.actor = 'parent:' || p.id::text
           WHERE p.family_id = $1 AND e.kind = 'provisioned' AND d.hardware_rev = 'web' AND e.at > now() - interval '1 day'`,
          [familyId],
        );
        if (today.rows[0].n >= WEB_TOYS_PER_DAY) throw tooMany(`A family can make ${WEB_TOYS_PER_DAY} Buddies in the browser a day; try again tomorrow`, today.rows[0].wait);
        const busy = await q.query("SELECT 1 FROM device WHERE child_id = $1 AND status = 'active'", [childId]);
        if (busy.rowCount) throw conflict('child-has-toy', 'This child already has a toy; unpair it first');
        return createWebDevice(q, config.deviceKek, { familyId, childId, actor: `parent:${parentId}` });
      });
    } catch (err) {
      // Two requests for one child racing: the one-active-toy index answers.
      if (isActiveToyClash(err)) throw conflict('child-has-toy', 'This child already has a toy; unpair it first');
      throw err;
    }
    const row = (await db.query(`SELECT ${DEVICE_COLUMNS} FROM device WHERE id = $1`, [id])).rows[0];
    return reply.code(201).send(row);
  });

  // Only a Buddy that lives in the browser hands out its secret, and only to
  // its own family while it is awake; a physical toy's secret never leaves.
  app.post('/devices/:deviceId/credential', async (req) => {
    if (!config.web.webToy) throw off();
    const id = uuidParam((req.params as { deviceId: string }).deviceId, 'toy');
    const device = (await db.query<{ hardware_rev: string; status: string }>(
      'SELECT hardware_rev, status FROM device WHERE id = $1 AND family_id = $2',
      [id, authOf(req).familyId],
    )).rows[0];
    if (!device || device.hardware_rev !== 'web') throw notFound('toy');
    if (device.status !== 'active') throw conflict('toy-not-active', 'Wake this Buddy before talking to it');
    const secret = await loadDeviceSecret(db, config.deviceKek, id);
    if (!secret) throw notFound('toy');
    return { device_id: id, secret: b64url(secret) };
  });

  // Recent answers for the activity page: when, which child, Buddy's face and
  // the kind of turn, and whether it cost a credit. Never the words.
  app.get('/turns', {
    schema: { querystring: { type: 'object', properties: { limit: { type: 'string' }, child_id: { type: 'string', format: 'uuid' } } } },
  }, async (req) => {
    const q = req.query as { limit?: string; child_id?: string };
    const n = Number.parseInt(q.limit ?? '', 10);
    const limit = Number.isInteger(n) ? Math.min(Math.max(n, 1), 500) : 100;
    const r = await db.query(
      `SELECT t.id, t.child_id, t.created_at, t.face, t.turn_type, t.language,
              EXISTS (SELECT 1 FROM credit_ledger l WHERE l.turn_id = t.id AND l.kind = 'debit') AS charged
       FROM turn t JOIN child c ON c.id = t.child_id
       WHERE c.family_id = $1 AND ($2::uuid IS NULL OR t.child_id = $2)
       ORDER BY t.created_at DESC LIMIT $3`,
      [authOf(req).familyId, q.child_id ?? null, limit],
    );
    return { data: r.rows };
  });
}
