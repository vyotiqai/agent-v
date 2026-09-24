import { DBOS } from "@dbos-inc/dbos-sdk";
import { createApp } from "./app.ts";
import { createAuth, promoteAdmins } from "./auth.ts";
import { billingQueue, setBillingContext } from "./billing/service.ts";
import { BrowserClient } from "./browser/client.ts";
import { recoverCommands } from "./computer/service.ts";
import type { Config } from "./config.ts";
import type { Context } from "./context.ts";
import { createDatabase, runMigrations } from "./db/client.ts";
import { createMailer, type Mailer } from "./mail.ts";
import { createEmbedder } from "./memory/embed.ts";
import { learnQueue, setMemoryContext } from "./memory/service.ts";
import { createModels, type Models } from "./models/registry.ts";
import {
  enqueueCheck,
  monitorQueue,
  setMonitorContext,
  startMonitorSchedule,
} from "./monitors/workflow.ts";
import { enqueueDelivery, pushQueue, setPushContext } from "./push/service.ts";
import { startQueueClient, stopQueueClient } from "./queue.ts";
import { Realtime } from "./realtime.ts";
import { Signer } from "./signing.ts";
import { setTaskContext, taskQueue } from "./tasks/workflow.ts";
import { startTelemetry } from "./telemetry.ts";

const appName = "agent-v";

/** Build and start everything one server process needs. Used by the entry point and tests. */
export async function startRuntime(
  config: Config,
  options: {
    models?: Models;
    mailer?: Mailer;
    telemetry?: Parameters<typeof startTelemetry>[1];
  } = {},
) {
  const database = createDatabase(config.databaseUrl);
  const telemetry = startTelemetry(config, options.telemetry);
  await runMigrations(database.db, database.pool);
  const realtime = new Realtime(database.pool, config.databaseUrl);
  await realtime.start();
  const ctx: Context = {
    config,
    db: database.db,
    models: options.models ?? createModels(config),
    embedder: createEmbedder(config),
    realtime,
    mailer: options.mailer ?? createMailer(config),
    browser: config.browser
      ? new BrowserClient(config.browser.url, config.browser.token)
      : undefined,
    signer: new Signer(config.authSecret),
  };
  setTaskContext(ctx);
  setMonitorContext(ctx);
  setPushContext(ctx);
  setMemoryContext(ctx);
  setBillingContext(ctx);
  await promoteAdmins(ctx);
  await recoverCommands(ctx);
  DBOS.setConfig({
    name: appName,
    systemDatabaseUrl: config.databaseUrl,
    logLevel: config.env === "test" ? "error" : "info",
  });
  await DBOS.launch();
  await DBOS.registerQueue(taskQueue, {
    workerConcurrency: config.taskWorkers,
    minPollingIntervalMs: 250,
    onConflict: "always_update",
  });
  await DBOS.registerQueue(monitorQueue, {
    workerConcurrency: config.monitorWorkers,
    minPollingIntervalMs: 500,
    onConflict: "always_update",
  });
  await DBOS.registerQueue(learnQueue, {
    workerConcurrency: 2,
    minPollingIntervalMs: 1000,
    onConflict: "always_update",
  });
  await DBOS.registerQueue(billingQueue, {
    workerConcurrency: 2,
    minPollingIntervalMs: 1000,
    onConflict: "always_update",
  });
  await DBOS.registerQueue(pushQueue, {
    workerConcurrency: 8,
    minPollingIntervalMs: 500,
    onConflict: "always_update",
  });
  if (config.monitorSchedule) await startMonitorSchedule();
  await startQueueClient(config.databaseUrl, appName);
  ctx.monitors = { enqueue: enqueueCheck };
  ctx.push = { deliver: (userId, id) => enqueueDelivery(ctx, userId, id) };
  const auth = createAuth(ctx);
  const { app, injectWebSocket } = createApp(ctx, auth, { tracing: telemetry.enabled });
  return {
    app,
    injectWebSocket,
    ctx,
    auth,
    async close() {
      await stopQueueClient();
      await DBOS.shutdown();
      await realtime.close();
      await database.close();
      await telemetry.shutdown();
    },
  };
}
