import { serve } from "@hono/node-server";
import { readConfig } from "./config.ts";
import { startRuntime } from "./runtime.ts";

const config = readConfig();
const runtime = await startRuntime(config);
const server = serve({ fetch: runtime.app.fetch, port: config.port, hostname: config.host }, () =>
  console.log(`Agent V API listening on http://${config.host}:${config.port}`),
);
runtime.injectWebSocket(server);

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  server.close(() => void runtime.close().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
