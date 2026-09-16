import express from 'express';
import config from './config.js';
import { requestId } from './middleware/request_id.js';
import { notFound, errorHandler } from './middleware/error.js';
import * as db from './store/db.js';
import * as redisStore from './store/redis.js';
import { dashboardRouter } from './routes/dashboard.js';
import { adminRouter } from './routes/admin.js';
import { deviceRouter } from './routes/device.js';

const HEALTH_TIMEOUT_MS = 2000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function probe(fn) {
  try {
    await withTimeout(fn(), HEALTH_TIMEOUT_MS);
    return 'ok';
  } catch {
    return 'down';
  }
}

// createApp never listens: tests and scripts bind their own port.
// Body parsing is per router, not global, because /v1 needs the raw bytes
// for HMAC verification and a global parser would consume them first.
export function createApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestId);

  app.get('/healthz', async (req, res) => {
    const [pgStatus, redisStatus] = await Promise.all([
      probe(db.ping),
      probe(redisStore.ping),
    ]);
    const ok = pgStatus === 'ok' && redisStatus === 'ok';
    res.status(ok ? 200 : 503).json({
      ok,
      pg: pgStatus,
      redis: redisStatus,
      uptime_s: Math.floor(process.uptime()),
    });
  });

  app.use('/v1', deviceRouter);
  app.use('/api', dashboardRouter);
  app.use('/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
