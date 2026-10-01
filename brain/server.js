import http from 'node:http';

import { createApp, createDeps } from './app.js';
import { loadConfig } from './config.js';
import { createLog } from './lib/log.js';
import { createPool } from './store/db.js';

const SHUTDOWN_GRACE_MS = 10_000;

const config = loadConfig();
const log = createLog({ level: config.logLevel });
for (const message of config.warnings) log.warn('config_warning', { message });

const pool = createPool(config.databaseUrl);
// Fail fast: a brain that cannot reach its memory should not accept turns.
await pool.query('SELECT 1');

const deps = createDeps(config, { pool, log });
const server = http.createServer(createApp(deps));
// A turn can legitimately take the whole deadline; Node's default request
// timeout must not cut it first.
server.requestTimeout = config.turnTimeoutMs + 30_000;

// Bound to loopback only: the brain trusts its one caller, the backend on
// the same host, and holds every child's memory.
server.listen(config.port, config.host, () => {
  log.info('brain_listening', {
    host: config.host,
    port: server.address().port,
    llm: deps.llm.describe(),
    memory: config.memory.enabled,
    bot_life: config.botLife.enabled,
    debug_log_file: Boolean(config.debug.llmLogFile),
  });
  // Pay the embeddings TLS handshake at boot rather than inside the first
  // child's MEMORY_WAIT_MS (measured: about 4 s cold against 0.5 s warm).
  if (config.memory.enabled) {
    deps.embed('xin chào').catch((err) => log.warn('memory_warmup_failed', { err_name: err?.name, err_status: err?.status }));
  }
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('brain_shutdown', { signal });
  const force = setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  server.close(async () => {
    await deps.learner.drain().catch(() => {});
    deps.history.close();
    await pool.end().catch(() => {});
    clearTimeout(force);
    process.exit(0);
  });
  server.closeIdleConnections?.();
}

// Windows delivers only SIGINT; SIGTERM matters under a process manager.
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
