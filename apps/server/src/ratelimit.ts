import { sql } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { Context } from "./context.ts";
import { rateLimits } from "./db/schema.ts";

export interface RateLimitStore {
  /** Count one request against `key`; returns the count in the current window. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

/** Per-process counters: fastest, right for a single API process. */
export class MemoryStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();
  private sweptAt = Date.now();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    if (now - this.sweptAt > 60_000) {
      this.sweptAt = now;
      for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    }
    const current = this.windows.get(key);
    const window =
      current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
    window.count++;
    this.windows.set(key, window);
    return { ...window };
  }
}

/** Counters in Postgres, shared by every replica: one atomic upsert per request. */
export class PostgresStore implements RateLimitStore {
  private readonly ctx: Context;
  private sweptAt = 0;
  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  async hit(key: string, windowMs: number) {
    const fresh = sql`now() + make_interval(secs => ${windowMs / 1000})`;
    const [row] = await this.ctx.db
      .insert(rateLimits)
      .values({ key, count: 1, resetAt: fresh })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
          resetAt: sql`case when ${rateLimits.resetAt} <= now() then ${fresh} else ${rateLimits.resetAt} end`,
        },
      })
      .returning({ count: rateLimits.count, resetAt: rateLimits.resetAt });
    if (Date.now() - this.sweptAt > 5 * 60_000) {
      this.sweptAt = Date.now();
      void this.ctx.db
        .delete(rateLimits)
        .where(sql`${rateLimits.resetAt} < now() - interval '1 hour'`)
        .catch(() => {});
    }
    return { count: row?.count ?? 1, resetAt: row?.resetAt.getTime() ?? Date.now() + windowMs };
  }
}

interface Policy {
  name: string;
  limit: number;
  windowMs: number;
  matches(method: string, path: string): boolean;
}

const minute = 60_000;
/** The first matching policy applies; the last one covers everything else. */
export const policies: Policy[] = [
  {
    name: "runs",
    limit: 30,
    windowMs: minute,
    matches: (m, p) => m === "POST" && /^\/api\/threads\/[^/]+\/runs$/.test(p),
  },
  {
    name: "tasks",
    limit: 20,
    windowMs: minute,
    matches: (m, p) => m === "POST" && p === "/api/tasks",
  },
  {
    name: "voice",
    limit: 30,
    windowMs: minute,
    matches: (m, p) => m === "POST" && p === "/api/voice/transcribe",
  },
  {
    name: "uploads",
    limit: 60,
    windowMs: minute,
    matches: (m, p) => m === "POST" && (p === "/api/files" || p === "/api/finance/import"),
  },
  {
    name: "export",
    limit: 5,
    windowMs: 60 * minute,
    matches: (m, p) =>
      (m === "GET" && p === "/api/account/export") ||
      (m === "POST" && p === "/api/account/export-link"),
  },
  { name: "api", limit: 600, windowMs: minute, matches: () => true },
];

/** Per-user request limits with standard RateLimit headers. Runs after sign-in is checked. */
export function rateLimiter(store: RateLimitStore): MiddlewareHandler<{
  Variables: { userId: string };
}> {
  return async (c, next) => {
    const policy = policies.find((p) => p.matches(c.req.method, c.req.path));
    if (!policy) return next();
    const { count, resetAt } = await store.hit(
      `${policy.name}:${c.get("userId")}`,
      policy.windowMs,
    );
    const reset = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
    const headers = {
      "RateLimit-Limit": String(policy.limit),
      "RateLimit-Remaining": String(Math.max(0, policy.limit - count)),
      "RateLimit-Reset": String(reset),
    };
    if (count > policy.limit)
      return c.json({ error: "Too many requests. Try again in a moment." }, 429, {
        ...headers,
        "Retry-After": String(reset),
      });
    await next();
    for (const [name, value] of Object.entries(headers)) c.res.headers.set(name, value);
  };
}
