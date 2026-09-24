import type { BrowserClient } from "./browser/client.ts";
import type { Config } from "./config.ts";
import type { Db } from "./db/client.ts";
import type { Embedder } from "./memory/embed.ts";
import type { Models } from "./models/registry.ts";
import type { Realtime } from "./realtime.ts";
import type { Signer } from "./signing.ts";

/** Everything request handlers and durable workflows need. Built once per process. */
export interface Context {
  config: Config;
  db: Db;
  models: Models;
  /** Turns text into vectors for memory search. */
  embedder: Embedder;
  realtime: Realtime;
  /** Present when a browser worker is configured. */
  browser?: BrowserClient;
  /** Signs short-lived links (screenshots, live view) that cannot carry a bearer token. */
  signer: Signer;
  /** Queues a watch check for a due time. Set once the workflow engine is running. */
  monitors?: { enqueue(userId: string, id: string, slot: Date): Promise<void> };
  /** Queues push delivery of a stored notification. Set once the workflow engine is running. */
  push?: { deliver(userId: string, notificationId: string): Promise<void> };
}

export const newId = () => crypto.randomUUID();
export const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);
