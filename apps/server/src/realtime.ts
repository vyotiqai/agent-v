import type { WorkspaceEvent } from "@agent-v/shared";
import pg from "pg";

const channel = "agentv_events";
type Listener = (event: WorkspaceEvent) => void;

/**
 * Per-user change feed. Writers call `publish`, which goes through Postgres NOTIFY so every
 * server process (API or worker) reaches the clients connected to any other process.
 */
export class Realtime {
  private listeners = new Map<string, Set<Listener>>();
  private client?: pg.Client;
  private closed = false;

  private readonly pool: pg.Pool;
  private readonly url: string;
  constructor(pool: pg.Pool, url: string) {
    this.pool = pool;
    this.url = url;
  }

  async start() {
    const client = new pg.Client({ connectionString: this.url });
    client.on("notification", (message) => {
      if (message.channel !== channel || !message.payload) return;
      try {
        const { userId, event } = JSON.parse(message.payload) as {
          userId: string;
          event: WorkspaceEvent;
        };
        for (const listener of this.listeners.get(userId) ?? []) listener(event);
      } catch {
        // Ignore malformed payloads from other writers.
      }
    });
    client.on("error", (error) => {
      console.error("[realtime] listener error:", error.message);
      if (!this.closed) setTimeout(() => void this.restart(), 1000);
    });
    await client.connect();
    await client.query(`LISTEN ${channel}`);
    this.client = client;
  }

  private async restart() {
    if (this.closed) return;
    await this.client?.end().catch(() => {});
    await this.start().catch((error) => {
      console.error("[realtime] reconnect failed:", error.message);
      setTimeout(() => void this.restart(), 5000);
    });
  }

  async publish(userId: string, event: WorkspaceEvent) {
    await this.pool.query("SELECT pg_notify($1, $2)", [channel, JSON.stringify({ userId, event })]);
  }

  subscribe(userId: string, listener: Listener): () => void {
    let set = this.listeners.get(userId);
    if (!set) {
      set = new Set();
      this.listeners.set(userId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(userId);
    };
  }

  async close() {
    this.closed = true;
    await this.client?.end().catch(() => {});
  }
}
