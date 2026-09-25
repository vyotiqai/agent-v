import { port } from '../config.ts';
import { startProcess } from '../process.ts';
import { createGateway } from './gateway.ts';

// The egress gateway. Settings: PORT (3128 otherwise); GOOGLE_CLOUD_PROJECT.
// It must listen only where our own browsers and workers can reach it, never on the internet.
const { logger, onStop } = startProcess('egress');
const server = createGateway({ logger });
server.listen(port(process.env, 'PORT', 3128));

onStop(async () => {
  server.close();
  server.closeIdleConnections();
});
