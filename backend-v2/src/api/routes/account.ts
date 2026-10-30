import type { FastifyInstance } from 'fastify';

import { notFound } from '../../util/errors.ts';
import { authOf, type ApiDeps } from '../context.ts';

const CONSENT_KINDS = ['terms', 'privacy', 'learning', 'pilot_review'];

export function registerAccount(app: FastifyInstance, deps: ApiDeps) {
  const { db } = deps;

  app.get('/me', async (req) => {
    const { parentId, familyId } = authOf(req);
    const parent = (await db.query('SELECT id, email, display_name, role, auth_provider FROM parent_user WHERE id = $1', [parentId])).rows[0];
    if (!parent) throw notFound('account');
    const family = (await db.query('SELECT id, country, created_at FROM family WHERE id = $1', [familyId])).rows[0];
    const children = (await db.query('SELECT id, name, nickname FROM child WHERE family_id = $1 ORDER BY created_at', [familyId])).rows;
    return { parent, family, children };
  });

  app.patch('/me', {
    schema: { body: { type: 'object', additionalProperties: false, properties: { display_name: { type: ['string', 'null'], maxLength: 80 } } } },
  }, async (req) => {
    const body = req.body as { display_name?: string | null };
    const r = await db.query(
      'UPDATE parent_user SET display_name = $2 WHERE id = $1 RETURNING id, email, display_name, role, auth_provider',
      [authOf(req).parentId, body.display_name ?? null],
    );
    return r.rows[0];
  });

  app.get('/consents', async (req) => {
    const r = await db.query(
      'SELECT kind, version, granted_at, revoked_at FROM consent WHERE family_id = $1 ORDER BY granted_at DESC',
      [authOf(req).familyId],
    );
    return { data: r.rows };
  });

  app.post('/consents', {
    schema: {
      body: {
        type: 'object', required: ['kind', 'version'], additionalProperties: false,
        properties: { kind: { type: 'string', enum: CONSENT_KINDS }, version: { type: 'string', minLength: 1, maxLength: 32 } },
      },
    },
  }, async (req, reply) => {
    const { parentId, familyId } = authOf(req);
    const body = req.body as { kind: string; version: string };
    const r = await db.query(
      'INSERT INTO consent (family_id, parent_id, kind, version) VALUES ($1, $2, $3, $4) RETURNING kind, version, granted_at, revoked_at',
      [familyId, parentId, body.kind, body.version],
    );
    return reply.code(201).send(r.rows[0]);
  });

  app.delete('/consents/:kind', async (req, reply) => {
    const { familyId } = authOf(req);
    const kind = (req.params as { kind: string }).kind;
    if (!CONSENT_KINDS.includes(kind)) throw notFound('consent');
    await db.tx(async (q) => {
      await q.query('UPDATE consent SET revoked_at = now() WHERE family_id = $1 AND kind = $2 AND revoked_at IS NULL', [familyId, kind]);
      // Withdrawing learning consent switches learning off for every child at once.
      if (kind === 'learning') await q.query('UPDATE child SET learning_enabled = false, updated_at = now() WHERE family_id = $1', [familyId]);
    });
    return reply.code(204).send();
  });

  app.post('/push-tokens', {
    schema: {
      body: {
        type: 'object', required: ['token', 'platform'], additionalProperties: false,
        properties: { token: { type: 'string', minLength: 8, maxLength: 4096 }, platform: { type: 'string', enum: ['ios', 'android'] } },
      },
    },
  }, async (req, reply) => {
    const body = req.body as { token: string; platform: string };
    await db.query(
      `INSERT INTO push_token (token, parent_id, platform) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET parent_id = EXCLUDED.parent_id, platform = EXCLUDED.platform`,
      [body.token, authOf(req).parentId, body.platform],
    );
    return reply.code(201).send({ registered: true });
  });

  app.delete('/push-tokens/:token', async (req, reply) => {
    await db.query('DELETE FROM push_token WHERE token = $1 AND parent_id = $2', [(req.params as { token: string }).token, authOf(req).parentId]);
    return reply.code(204).send();
  });

  app.delete('/family', async (req, reply) => {
    const { familyId } = authOf(req);
    const toys = await db.tx(async (q) => {
      // Toys go back to the factory state so their claim codes work again.
      const r = await q.query<{ id: string }>(
        "UPDATE device SET status = 'provisioned', family_id = NULL, child_id = NULL, claimed_at = NULL WHERE family_id = $1 RETURNING id",
        [familyId],
      );
      for (const d of r.rows) await q.query("INSERT INTO device_event (device_id, kind, actor) VALUES ($1, 'unclaimed', 'system')", [d.id]);
      await q.query('DELETE FROM family WHERE id = $1', [familyId]);
      return r.rows;
    });
    for (const d of toys) deps.onDeviceBlocked?.(d.id);
    return reply.code(204).send();
  });
}
