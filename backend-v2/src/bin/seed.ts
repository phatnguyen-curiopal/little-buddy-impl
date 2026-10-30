import { seedCast } from '../character/packs.ts';
import { configFromProcess } from '../config.ts';
import { createPgDb } from '../db/index.ts';
import { createLogger } from '../log.ts';

const config = configFromProcess();
const db = createPgDb(config.databaseUrl, { max: 1 });
try {
  const created = await seedCast(db);
  createLogger(config.logLevel, { service: 'seed' }).info('cast seeded', { new_characters: created });
} finally {
  await db.close();
}
