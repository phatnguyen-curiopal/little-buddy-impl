import { configFromProcess } from '../config.ts';
import { createPgDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import { createLogger } from '../log.ts';

const config = configFromProcess();
const db = createPgDb(config.databaseUrl, { max: 1 });
const log = createLogger(config.logLevel, { service: 'migrate' });
try {
  const { applied, vecType } = await migrate(db, { log });
  log.info('migrations complete', { applied: applied.length, embedding_type: vecType });
} finally {
  await db.close();
}
