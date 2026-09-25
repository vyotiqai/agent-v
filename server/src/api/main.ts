import { providerClients } from '../ai/clients.ts';
import { tidy } from '../auth/accounts.ts';
import { createGoogleVerifier } from '../auth/google.ts';
import { metadataToken } from '../cloud/token.ts';
import { port, required } from '../config.ts';
import { bucketKeyStore, kmsWrapper } from '../crypto/cloud.ts';
import { DataKeys } from '../crypto/envelope.ts';
import { connect } from '../db/connect.ts';
import { loadMigrations, MIGRATIONS } from '../db/migrate.ts';
import { createEgress } from '../egress/client.ts';
import { parseAuthority } from '../egress/gateway.ts';
import { startProcess } from '../process.ts';
import { braveSearch } from '../search/brave.ts';
import { createApi } from './app.ts';

// The API service. Settings: DATABASE_URL; GOOGLE_CLIENT_ID (Agent V's server client id, the
// audience of Google's identity tokens); EGRESS_GATEWAY (host:port of the egress gateway, which
// every call made on someone's behalf goes through); KMS_KEY (the Cloud KMS key that wraps data
// keys, projects/…/cryptoKeys/…); KEYS_BUCKET (the bucket of wrapped data keys); PORT (Cloud Run
// sets it; 8080 otherwise); GOOGLE_CLOUD_PROJECT (links log lines to traces).
const { logger, onStop } = startProcess('api');
const sql = connect(required(process.env, 'DATABASE_URL'));
const verifyGoogle = createGoogleVerifier({ audience: required(process.env, 'GOOGLE_CLIENT_ID') });
const schema = (await loadMigrations(MIGRATIONS)).length;
const gateway = parseAuthority(required(process.env, 'EGRESS_GATEWAY'));
if (!gateway) throw new Error('The setting EGRESS_GATEWAY is not host:port.');
const egress = createEgress({ gateway });
const token = metadataToken();
const dataKeys = new DataKeys(
  kmsWrapper(required(process.env, 'KMS_KEY'), token),
  bucketKeyStore(required(process.env, 'KEYS_BUCKET'), token),
  logger,
);
const server = createApi({
  sql,
  logger,
  schema,
  verifyGoogle,
  ai: {
    dataKeys,
    client: providerClients(egress),
    search: (key) => braveSearch(egress, key, 'Agent V', { count: 1 }),
  },
});
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
