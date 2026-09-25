import { createHash } from 'node:crypto';
import type { Sql } from './db/connect.ts';

/**
 * Rate limits (stage 6, section 17): at most `limit` uses of a key a minute, counted in Postgres so
 * every API instance sees the same count. Network addresses are counted by a hash, never kept as
 * they are.
 */
export async function allow(sql: Sql, key: string, limit: number): Promise<boolean> {
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, date_trunc('minute', now()), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  return (row?.count ?? 0) <= limit;
}

/** A rate-limit key for a network address, without keeping the address. */
export function addressKey(scope: string, address: string): string {
  return `${scope}:${createHash('sha256').update(address).digest('base64url').slice(0, 22)}`;
}
