// Local development without a PostgreSQL server: the same stack as dev.ts
// (Parent API, voice service and worker in one process) on PGlite, the
// in-process PostgreSQL the tests use, kept on disk in .pglite/ between runs.
// GATEWAY=fake (the default without keys) answers with stand-ins, so the
// website and a browser Buddy can be tried end to end with no account
// anywhere. Delete .pglite/ to start over.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PGlite, types } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

import { buildApi } from '../api/app.ts';
import { seedCast } from '../character/packs.ts';
import { configFromProcess } from '../config.ts';
import type { Db, Queryable } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { createWorker } from '../jobs/worker.ts';
import { createRuntime } from '../runtime.ts';
import { createVoiceServer } from '../voice/server.ts';

const dir = fileURLToPath(new URL('../../.pglite/', import.meta.url));
mkdirSync(dir, { recursive: true });
// A DATE stays the calendar day it is, as the pg driver is told in db/index.ts.
const pg = new PGlite(dir, { extensions: { vector }, parsers: { [types.DATE]: (v: string) => v } });
await pg.waitReady;

function wrap(c: PGlite | Parameters<Parameters<PGlite['transaction']>[0]>[0]): Queryable {
  return {
    async query(text, params) {
      const r = await c.query<any>(text, (params ?? []) as unknown[]);
      return { rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    async exec(sql) {
      await c.exec(sql);
    },
  };
}

// PGlite runs one statement at a time, so work is queued rather than pooled.
const db: Db = { ...wrap(pg), tx: (fn) => pg.transaction((tx) => fn(wrap(tx))), close: () => pg.close() };

const rt = createRuntime(configFromProcess(), { db });
await migrate(rt.db, { log: rt.log });
await seedCast(rt.db);

const voice = createVoiceServer(rt);
const api = buildApi({ ...rt, onDeviceBlocked: (id) => voice.kick(id) });
const worker = createWorker(rt);

await api.listen({ port: rt.config.apiPort, host: rt.config.host });
const voicePort = await voice.listen(rt.config.voicePort, rt.config.host);
worker.start();
rt.log.info('dev stack up on PGlite', { api: rt.config.apiPort, voice: voicePort, gateway: rt.config.gateway, data: dir });

const stop = async () => {
  await worker.stop();
  await voice.close();
  await api.close();
  await rt.db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
