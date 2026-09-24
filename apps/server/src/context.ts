import type { BrowserClient } from "./browser/client.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import type { Models } from "./models/registry.ts";
import type { Realtime } from "./realtime.ts";
import type { Signer } from "./signing.ts";

/** Everything request handlers and durable workflows need. Built once per process. */
export interface Context {
  config: Config;
  db: Db;
  models: Models;
  realtime: Realtime;
  /** Present when a browser worker is configured. */
  browser?: BrowserClient;
  /** Signs short-lived links (screenshots, live view) that cannot carry a bearer token. */
  signer: Signer;
}

export const newId = () => crypto.randomUUID();
export const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
