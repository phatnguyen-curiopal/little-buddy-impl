// Wires the shared dependencies once, for every entry point.

import { createOidcVerifier } from './auth/oidc.ts';
import type { Config } from './config.ts';
import { createPgDb, type Db } from './db/index.ts';
import { createFakeGateway } from './gateway/fake.ts';
import { createLiveGateway } from './gateway/live.ts';
import type { ModelGateway } from './gateway/types.ts';
import { createJobQueue } from './jobs/queue.ts';
import { createLogger, type Logger } from './log.ts';
import { createDigestCache } from './memory/digest.ts';

export interface Runtime {
  config: Config;
  db: Db;
  log: Logger;
  gateway: ModelGateway;
  queue: ReturnType<typeof createJobQueue>;
  digests: ReturnType<typeof createDigestCache>;
  oidc: ReturnType<typeof createOidcVerifier>;
}

export function createRuntime(config: Config, overrides: Partial<Pick<Runtime, 'db' | 'gateway' | 'log'>> = {}): Runtime {
  const log = overrides.log ?? createLogger(config.logLevel, { service: 'backend-v2' });
  const db = overrides.db ?? createPgDb(config.databaseUrl);
  const gateway = overrides.gateway ?? (config.gateway === 'live' ? createLiveGateway(config, log) : createFakeGateway());
  return {
    config,
    db,
    log,
    gateway,
    queue: createJobQueue(db),
    digests: createDigestCache(),
    oidc: createOidcVerifier(config.auth),
  };
}
