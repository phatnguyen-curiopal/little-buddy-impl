// Local development: the Parent API, the voice service and the worker in one
// process, so unpairing a toy in the API closes its socket at once.

import { buildApi } from '../api/app.ts';
import { configFromProcess } from '../config.ts';
import { migrate } from '../db/migrate.ts';
import { seedCast } from '../character/packs.ts';
import { createWorker } from '../jobs/worker.ts';
import { createRuntime } from '../runtime.ts';
import { createVoiceServer } from '../voice/server.ts';

const rt = createRuntime(configFromProcess());
await migrate(rt.db, { log: rt.log });
await seedCast(rt.db);

const voice = createVoiceServer(rt);
const api = buildApi({ ...rt, onDeviceBlocked: (id) => voice.kick(id) });
const worker = createWorker(rt);

await api.listen({ port: rt.config.apiPort, host: rt.config.host });
const voicePort = await voice.listen(rt.config.voicePort, rt.config.host);
worker.start();
rt.log.info('dev stack up', { api: rt.config.apiPort, voice: voicePort, gateway: rt.config.gateway });

const stop = async () => {
  await worker.stop();
  await voice.close();
  await api.close();
  await rt.db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
