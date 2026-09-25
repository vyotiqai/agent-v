import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { Api, ApiError, type SessionStore, type StoredSession } from '../../app/src/api/client.ts';
import { createApi } from '../src/api/app.ts';
import { createGoogleVerifier } from '../src/auth/google.ts';
import type { Sql } from '../src/db/connect.ts';
import { loadMigrations, MIGRATIONS, migrate } from '../src/db/migrate.ts';
import { createLogger } from '../src/log.ts';
import { withDatabase } from './db.ts';
import { TestIssuer } from './google-tokens.ts';

// The app's own API client (app/src/api/client.ts) against the real API and a real Postgres:
// everything about signing in except the phone's native sign-in sheet and secure chip.

const issuer = new TestIssuer();

class MemoryStore implements SessionStore {
  value: StoredSession | null = null;
  async load() {
    return this.value;
  }
  async save(s: StoredSession) {
    this.value = s;
  }
  async clear() {
    this.value = null;
  }
}

interface Env {
  base: string;
  sql: Sql;
  /** A phone: the client, its store, a count of refreshes it made, and whether it was told it's out. */
  phone: (
    sub?: string,
  ) => Promise<{ api: Api; store: MemoryStore; refreshes: () => number; out: () => number }>;
}

async function withEnv(fn: (env: Env) => Promise<void>): Promise<void> {
  await withDatabase(async (sql) => {
    const logger = createLogger({ write: () => {} });
    const shipped = await loadMigrations(MIGRATIONS);
    await migrate(sql, shipped, logger);
    const verifyGoogle = createGoogleVerifier({
      audience: issuer.audience,
      fetch: issuer.fetcher().fetch,
    });
    const server = createApi({ sql, logger, schema: shipped.length, verifyGoogle });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const phone: Env['phone'] = async (sub = '110248495921238986420') => {
      const store = new MemoryStore();
      let refreshes = 0;
      let out = 0;
      const counting = (async (url: string | URL | Request, init?: RequestInit) => {
        if (String(url).endsWith('/v1/auth/refresh')) refreshes++;
        return fetch(url, init);
      }) as typeof fetch;
      const api = new Api({ baseUrl: base, store, fetch: counting, onSignedOut: () => out++ });
      await api.start();
      const { nonce } = await api.nonce();
      const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey;
      await api.signInWithGoogle({
        idToken: issuer.token({ nonce, sub }),
        nonce,
        phone: {
          platform: 'android',
          model: 'Pixel 8',
          signingKey: key.export({ format: 'der', type: 'spki' }).toString('base64'),
        },
      });
      return { api, store, refreshes: () => refreshes, out: () => out };
    };
    try {
      await fn({ base, sql, phone });
    } finally {
      server.close();
    }
  });
}

test('signing in keeps only the refresh token in the store, and the app is signed in on the next launch', async () => {
  await withEnv(async ({ base, phone }) => {
    const { api, store } = await phone();
    assert.ok(store.value?.refreshToken);
    assert.equal(JSON.stringify(store.value).includes('accessToken'), false);
    assert.equal((await api.phones()).length, 1);

    // The next launch: a new client with the same store works after one refresh.
    const later = new Api({ baseUrl: base, store, onSignedOut: () => {} });
    assert.equal(await later.start(), true);
    assert.equal((await later.phones())[0]?.current, true);
  });
});

test('an expired access token is refreshed once, however many requests need it at the same moment', async () => {
  await withEnv(async ({ phone, sql }) => {
    const p = await phone();
    await sql`update phones set access_expires_at = now() - interval '1 second'`;
    const before = p.refreshes();
    const results = await Promise.all([
      p.api.phones(),
      p.api.phones(),
      p.api.phones(),
      p.api.phones(),
    ]);
    assert.equal(results.length, 4);
    assert.equal(p.refreshes() - before, 1);
    assert.equal(p.out(), 0);
  });
});

test('signed out from another phone: the app is told once, the store is cleared', async () => {
  await withEnv(async ({ phone }) => {
    const mine = await phone('1001');
    const other = await phone('1001');
    const otherId = other.store.value?.phoneId as string;
    await mine.api.signOutPhone(otherId);

    // The other phone's access token still looks current to it; the API refuses it, a refresh is
    // refused as signed out, and the app returns to Welcome.
    await assert.rejects(
      other.api.phones(),
      (e: unknown) => e instanceof ApiError && e.code === 'signed-out',
    );
    assert.equal(other.out(), 1);
    assert.equal(other.store.value, null);
    assert.equal((await mine.api.phones()).length, 1);
  });
});

test('a copy of the stored refresh token, used after the phone moved on, signs the phone out', async () => {
  await withEnv(async ({ base, phone, sql }) => {
    const p = await phone();
    const copied = { ...(p.store.value as StoredSession) };
    // The phone refreshes normally.
    await sql`update phones set access_expires_at = now() - interval '1 second'`;
    await p.api.phones();
    // Someone else uses the copy.
    const thief = new MemoryStore();
    thief.value = copied;
    const theirs = new Api({ baseUrl: base, store: thief, onSignedOut: () => {} });
    await theirs.start();
    await assert.rejects(
      theirs.phones(),
      (e: unknown) => e instanceof ApiError && e.code === 'signed-out',
    );
    // And the phone is out too.
    await sql`update phones set access_expires_at = now() - interval '1 second'`;
    await assert.rejects(
      p.api.phones(),
      (e: unknown) => e instanceof ApiError && e.code === 'signed-out',
    );
    assert.equal(p.out(), 1);
  });
});

test('signing out clears the phone even when the API cannot be reached', async () => {
  await withEnv(async ({ phone }) => {
    const p = await phone();
    await p.api.signOut();
    assert.equal(p.store.value, null);

    const offline = new MemoryStore();
    offline.value = { refreshToken: 'abc', personId: 'x', phoneId: 'y' };
    const api = new Api({
      baseUrl: 'http://127.0.0.1:1',
      store: offline,
      onSignedOut: () => {},
    });
    await api.start();
    await assert.rejects(
      api.phones(),
      (e: unknown) => e instanceof ApiError && e.code === 'offline',
    );
    await api.signOut();
    assert.equal(offline.value, null);
  });
});
