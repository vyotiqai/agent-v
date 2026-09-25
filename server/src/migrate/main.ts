import { required } from '../config.ts';
import { connect } from '../db/connect.ts';
import { loadMigrations, MIGRATIONS, MigrationError, migrate } from '../db/migrate.ts';
import { startProcess } from '../process.ts';

// Applies the database migrations, then exits: 0 when the schema is current, 1 otherwise.
// Run before each deploy (stage 6, section 23). Settings: DATABASE_URL; GOOGLE_CLOUD_PROJECT.
const { logger } = startProcess('migrate');
const sql = connect(required(process.env, 'DATABASE_URL'), { max: 2 });
let code = 0;
try {
  const ran = await migrate(sql, await loadMigrations(MIGRATIONS), logger);
  logger.log('migrate.done', { process: 'migrate', count: ran.length });
} catch (err) {
  logger.error('migrate.failed', err instanceof MigrationError ? err.kind : 'database', err, {
    process: 'migrate',
  });
  code = 1;
}
await sql.end({ timeout: 5 });
process.exit(code);
