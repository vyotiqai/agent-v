import { port, required } from '../config.ts';
import { connect } from '../db/connect.ts';
import { loadMigrations, MIGRATIONS } from '../db/migrate.ts';
import { startProcess } from '../process.ts';
import { createApi } from './app.ts';

// The API service. Settings: DATABASE_URL; PORT (Cloud Run sets it; 8080 otherwise);
// GOOGLE_CLOUD_PROJECT (links log lines to traces).
const { logger, onStop } = startProcess('api');
const sql = connect(required(process.env, 'DATABASE_URL'));
const schema = (await loadMigrations(MIGRATIONS)).length;
const server = createApi({ sql, logger, schema });
server.listen(port(process.env, 'PORT', 8080));

onStop(async () => {
  server.close();
  server.closeIdleConnections();
  await sql.end({ timeout: 5 });
});
