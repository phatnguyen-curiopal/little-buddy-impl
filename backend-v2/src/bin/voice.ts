import { configFromProcess } from '../config.ts';
import { createRuntime } from '../runtime.ts';
import { createVoiceServer } from '../voice/server.ts';

const rt = createRuntime(configFromProcess());
const voice = createVoiceServer(rt);
const port = await voice.listen(rt.config.voicePort, rt.config.host);
rt.log.info('voice service listening', { port, path: '/v1/device', gateway: rt.config.gateway });

const stop = async () => {
  await voice.close();
  await rt.db.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
