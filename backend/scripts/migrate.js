import { pool } from '../store/db.js';
import { runMigrations } from '../store/migrate.js';

try {
  const applied = await runMigrations(pool);
  console.log(applied.length ? `applied: ${applied.join(', ')}` : 'nothing to apply');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
