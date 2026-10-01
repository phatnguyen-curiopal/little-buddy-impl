import { loadConfig } from '../config.js';
import { createPool } from '../store/db.js';
import { ensureDatabase, runMigrations } from '../store/migrate.js';

const config = loadConfig();
try {
  await ensureDatabase(config.databaseUrl);
  const pool = createPool(config.databaseUrl, { max: 2 });
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `applied: ${applied.join(', ')}` : 'nothing to apply');
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
