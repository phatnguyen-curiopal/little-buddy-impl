import { configFromProcess } from '../config.ts';
import { createWorker } from '../jobs/worker.ts';
import { createRuntime } from '../runtime.ts';

const rt = createRuntime(configFromProcess());
const worker = createWorker(rt);
worker.start();
rt.log.info('worker started', { gateway: rt.config.gateway });

const stop = async () => {
  await worker.stop();
  await rt.db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
