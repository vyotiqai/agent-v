import { DBOS } from "@dbos-inc/dbos-sdk";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { BrowserClient } from "./browser/client.ts";
import { recoverCommands } from "./computer/service.ts";
import type { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { createDatabase, runMigrations } from "./db/client.ts";
import { createModels, type Models } from "./models/registry.ts";
import { Realtime } from "./realtime.ts";
import { Signer } from "./signing.ts";
import { setTaskContext, taskQueue } from "./tasks/workflow.ts";

/** Build and start everything one server process needs. Used by the entry point and tests. */
export async function startRuntime(config: Config, options: { models?: Models } = {}) {
  const database = createDatabase(config.databaseUrl);
  await runMigrations(database.db);
  const realtime = new Realtime(database.pool, config.databaseUrl);
  await realtime.start();
  const ctx: Context = {
    config,
    db: database.db,
    models: options.models ?? createModels(config),
    realtime,
    browser: config.browser
      ? new BrowserClient(config.browser.url, config.browser.token)
      : undefined,
    signer: new Signer(config.authSecret),
  };
  setTaskContext(ctx);
  await recoverCommands(ctx);
  DBOS.setConfig({
    name: "agent-v",
    systemDatabaseUrl: config.databaseUrl,
    logLevel: config.env === "test" ? "error" : "info",
  });
  await DBOS.launch();
  await DBOS.registerQueue(taskQueue, {
    workerConcurrency: config.taskWorkers,
    minPollingIntervalMs: 250,
    onConflict: "always_update",
  });
  const auth = createAuth(config, database.db);
  const { app, injectWebSocket } = createApp(ctx, auth);
  return {
    app,
    injectWebSocket,
    ctx,
    auth,
    async close() {
      await DBOS.shutdown();
      await realtime.close();
      await database.close();
    },
  };
}
