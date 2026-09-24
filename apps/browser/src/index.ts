import { serve } from "@hono/node-server";
import { createWorkerApp } from "./app.ts";
import { readWorkerConfig } from "./config.ts";
import { startEgressProxy } from "./proxy.ts";
import { Sessions } from "./sessions.ts";

const config = readWorkerConfig();
const proxy = await startEgressProxy({ allowPrivate: config.allowPrivate });
const sessions = new Sessions(config, proxy.url);
sessions.start();
const { app, injectWebSocket } = createWorkerApp(config, sessions);
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () =>
  console.log(`Agent V browser worker listening on http://${config.host}:${config.port}`),
);
injectWebSocket(server);

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close();
  void sessions
    .stop()
    .then(() => proxy.close())
    .then(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
