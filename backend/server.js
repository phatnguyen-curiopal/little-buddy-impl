import http from 'node:http';
import config from './config.js';
import { createApp } from './app.js';
import * as db from './store/db.js';
import * as redisStore from './store/redis.js';
import log from './lib/log.js';
import { attachStream } from './ws/stream.js';
import { sweepStale } from './turns/service.js';

const SHUTDOWN_GRACE_MS = 10_000;

const app = createApp();
const server = http.createServer(app);
attachStream(server);

await redisStore.connect();
await db.ping();
// Crash leftovers: accepted turns that never closed would reserve credits.
await sweepStale();
setInterval(() => sweepStale().catch((err) => log.warn('turns_sweep_failed', { err_message: err.message })), 60_000).unref();

server.listen(config.port, () => {
  log.info('server_listening', { port: config.port, node_env: config.nodeEnv, device_auth: config.deviceAuth });
  if (config.deviceAuth === 'off') {
    // Loud on purpose: a server running like this accepts any device id.
    log.warn('device_auth_off', { note: 'signature checks are disabled; never run like this outside local dev' });
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('server_shutdown', { signal });
  const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  server.close(async () => {
    await Promise.allSettled([redisStore.close(), db.close()]);
    clearTimeout(force);
    process.exit(0);
  });
}

// Windows delivers only SIGINT (Ctrl+C); SIGTERM matters under pm2 on Linux.
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
