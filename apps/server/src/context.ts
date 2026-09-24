import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import type { Models } from "./models/registry.ts";
import type { Realtime } from "./realtime.ts";

/** Everything request handlers and durable workflows need. Built once per process. */
export interface Context {
  config: Config;
  db: Db;
  models: Models;
  realtime: Realtime;
}

export const newId = () => crypto.randomUUID();
export const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
