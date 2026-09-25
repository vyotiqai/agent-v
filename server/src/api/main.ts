import { tidy } from '../auth/accounts.ts';
import { createGoogleVerifier } from '../auth/google.ts';
import { port, required } from '../config.ts';
import { connect } from '../db/connect.ts';
import { loadMigrations, MIGRATIONS } from '../db/migrate.ts';
import { startProcess } from '../process.ts';
import { createApi } from './app.ts';

// The API service. Settings: DATABASE_URL; GOOGLE_CLIENT_ID (Agent V's server client id, the
// audience of Google's identity tokens); PORT (Cloud Run sets it; 8080 otherwise);
// GOOGLE_CLOUD_PROJECT (links log lines to traces).
const { logger, onStop } = startProcess('api');
const sql = connect(required(process.env, 'DATABASE_URL'));
const verifyGoogle = createGoogleVerifier({ audience: required(process.env, 'GOOGLE_CLIENT_ID') });
const schema = (await loadMigrations(MIGRATIONS)).length;
const server = createApi({ sql, logger, schema, verifyGoogle });
server.listen(port(process.env, 'PORT', 8080));

// Spent sign-in nonces and old rate-limit counts are removed every 10 minutes.
const tidying = setInterval(() => {
  tidy(sql).catch((err: unknown) => logger.error('api.error', 'database', err));
}, 10 * 60_000);
tidying.unref();

onStop(async () => {
  clearInterval(tidying);
  server.close();
  server.closeIdleConnections();
  await sql.end({ timeout: 5 });
});
