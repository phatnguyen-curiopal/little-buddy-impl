import { buildApi } from '../api/app.ts';
import { configFromProcess } from '../config.ts';
import { createRuntime } from '../runtime.ts';

const rt = createRuntime(configFromProcess());
const app = buildApi(rt);
await app.listen({ port: rt.config.apiPort, host: rt.config.host });
rt.log.info('parent api listening', { port: rt.config.apiPort, gateway: rt.config.gateway });

const stop = async () => {
  await app.close();
  await rt.db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
