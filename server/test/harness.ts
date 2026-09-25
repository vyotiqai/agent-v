import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Session } from '@agentv/shared/accounts.ts';
import { type ApiOptions, createApi } from '../src/api/app.ts';
import { createGoogleVerifier } from '../src/auth/google.ts';
import type { Sql } from '../src/db/connect.ts';
import { loadMigrations, MIGRATIONS, migrate } from '../src/db/migrate.ts';
import { createLogger, type Logger } from '../src/log.ts';
import { withDatabase } from './db.ts';
import { TestIssuer } from './google-tokens.ts';
import { unusedAi } from './stand-ins.ts';

/**
 * The API on a real Postgres, for tests that go through it end to end: a fresh database with the
 * shipped schema, and signing in as a person, with Google's side played by TestIssuer.
 */

export const issuer = new TestIssuer();

/** A P-256 public key, as a phone's secure chip would give it. */
export function phoneKey(): string {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
}

export interface Api {
  base: string;
  sql: Sql;
  logs: string[];
  call: (
    method: string,
    path: string,
    body?: unknown,
    token?: string,
    headers?: Record<string, string>,
  ) => Promise<{ status: number; json: unknown; headers: Headers }>;
  signIn: (sub?: string, model?: string) => Promise<Session>;
}

export async function withApi(
  fn: (api: Api) => Promise<void>,
  options: { ai?: (logger: Logger) => ApiOptions['ai'] } = {},
): Promise<void> {
  await withDatabase(async (sql) => {
    const logs: string[] = [];
    const logger = createLogger({ write: (l) => logs.push(l) });
    const shipped = await loadMigrations(MIGRATIONS);
    await migrate(sql, shipped, logger);
    const verifyGoogle = createGoogleVerifier({
      audience: issuer.audience,
      fetch: issuer.fetcher().fetch,
    });
    const server = createApi({
      sql,
      logger,
      schema: shipped.length,
      verifyGoogle,
      ai: (options.ai ?? unusedAi)(logger),
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const call: Api['call'] = async (method, path, body, token, headers = {}) => {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
    };
    const signIn: Api['signIn'] = async (sub = '110248495921238986420', model = 'Pixel 8') => {
      const { json } = await call('POST', '/v1/auth/nonce', {});
      const nonce = (json as { nonce: string }).nonce;
      const r = await call('POST', '/v1/auth/google', {
        idToken: issuer.token({ nonce, sub }),
        nonce,
        phone: { platform: 'android', model, signingKey: phoneKey() },
      });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      return r.json as Session;
    };
    try {
      await fn({ base, sql, logs, call, signIn });
    } finally {
      server.close();
    }
  });
}
