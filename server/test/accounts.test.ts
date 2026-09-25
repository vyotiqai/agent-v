import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import type { Phone, Session } from '@agentv/shared/accounts.ts';
import { createApi } from '../src/api/app.ts';
import { tidy } from '../src/auth/accounts.ts';
import { createGoogleVerifier } from '../src/auth/google.ts';
import type { Sql } from '../src/db/connect.ts';
import { loadMigrations, MIGRATIONS, migrate } from '../src/db/migrate.ts';
import { createLogger } from '../src/log.ts';
import { withDatabase } from './db.ts';
import { TestIssuer } from './google-tokens.ts';

// Signing in, sessions and phones, end to end through the API, on a real Postgres (slice 1).
// Google's side is played by TestIssuer; everything on our side is the code that ships.

const issuer = new TestIssuer();

/** A P-256 public key, as a phone's secure chip would give it. */
function phoneKey(): string {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
}

interface Api {
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

async function withApi(fn: (api: Api) => Promise<void>): Promise<void> {
  await withDatabase(async (sql) => {
    const logs: string[] = [];
    const logger = createLogger({ write: (l) => logs.push(l) });
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

test('signing in makes the person once and a phone per sign-in, listed with this phone first', async () => {
  await withApi(async ({ call, signIn, sql }) => {
    const first = await signIn();
    assert.match(first.accessToken, /^[A-Za-z0-9_-]{43}$/);
    assert.match(first.refreshToken, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(Date.parse(first.accessExpiresAt) - Date.now() > 14 * 60_000);
    const second = await signIn(undefined, 'Pixel 6a');
    assert.equal(second.personId, first.personId);
    assert.notEqual(second.phoneId, first.phoneId);

    const { status, json } = await call('GET', '/v1/phones', undefined, second.accessToken);
    assert.equal(status, 200);
    const list = (json as { phones: Phone[] }).phones;
    assert.deepEqual(
      list.map((p) => [p.model, p.current]),
      [
        ['Pixel 6a', true],
        ['Pixel 8', false],
      ],
    );
    const [person] = await sql`select name, email from people`;
    assert.deepEqual({ ...person }, { name: 'Maya Rao', email: 'maya@example.com' });
  });
});

test('a sign-in needs a nonce we gave out, used once', async () => {
  await withApi(async ({ call }) => {
    const { json } = await call('POST', '/v1/auth/nonce', {});
    const nonce = (json as { nonce: string }).nonce;
    const body = {
      idToken: issuer.token({ nonce }),
      nonce,
      phone: { platform: 'android', model: 'Pixel 8', signingKey: phoneKey() },
    };
    assert.equal((await call('POST', '/v1/auth/google', body)).status, 200);
    const again = await call('POST', '/v1/auth/google', body);
    assert.deepEqual([again.status, again.json], [401, { error: 'sign-in-failed' }]);

    const made = 'bm90LWlzc3VlZC1ieS11cw';
    const invented = await call('POST', '/v1/auth/google', {
      ...body,
      idToken: issuer.token({ nonce: made }),
      nonce: made,
    });
    assert.deepEqual([invented.status, invented.json], [401, { error: 'sign-in-failed' }]);
  });
});

test('bad tokens, keys and bodies are refused', async () => {
  await withApi(async ({ call }) => {
    const nonceOf = async () =>
      ((await call('POST', '/v1/auth/nonce', {})).json as { nonce: string }).nonce;
    const phone = { platform: 'android', model: 'Pixel 8', signingKey: phoneKey() };

    let nonce = await nonceOf();
    const wrongApp = await call('POST', '/v1/auth/google', {
      idToken: issuer.token({ nonce, aud: 'someone-else' }),
      nonce,
      phone,
    });
    assert.equal(wrongApp.status, 401);

    nonce = await nonceOf();
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64');
    const notP256 = await call('POST', '/v1/auth/google', {
      idToken: issuer.token({ nonce }),
      nonce,
      phone: { ...phone, signingKey: rsa },
    });
    assert.deepEqual([notP256.status, notP256.json], [400, { error: 'bad-request' }]);

    assert.equal((await call('POST', '/v1/auth/google', { nonce })).status, 400);
  });
});

test('requests without a valid access token are unauthorized', async () => {
  await withApi(async ({ call, signIn, sql }) => {
    const none = await call('GET', '/v1/phones');
    assert.deepEqual([none.status, none.json], [401, { error: 'unauthorized' }]);
    assert.equal(none.headers.get('www-authenticate'), 'Bearer');
    assert.equal((await call('GET', '/v1/phones', undefined, 'made-up-token')).status, 401);

    const session = await signIn();
    assert.equal((await call('GET', '/v1/phones', undefined, session.accessToken)).status, 200);
    await sql`update phones set access_expires_at = now() - interval '1 second'`;
    assert.equal((await call('GET', '/v1/phones', undefined, session.accessToken)).status, 401);
  });
});

test('a refresh token is used once and replaced; the old access token stops working', async () => {
  await withApi(async ({ call, signIn }) => {
    const first = await signIn();
    const r = await call('POST', '/v1/auth/refresh', { refreshToken: first.refreshToken });
    assert.equal(r.status, 200);
    const next = r.json as Session;
    assert.notEqual(next.refreshToken, first.refreshToken);
    assert.equal(next.phoneId, first.phoneId);
    assert.equal((await call('GET', '/v1/phones', undefined, first.accessToken)).status, 401);
    assert.equal((await call('GET', '/v1/phones', undefined, next.accessToken)).status, 200);
  });
});

test('a copied refresh token signs that phone out, for the copy and the phone alike', async () => {
  await withApi(async ({ call, signIn, sql }) => {
    const first = await signIn();
    const next = (await call('POST', '/v1/auth/refresh', { refreshToken: first.refreshToken }))
      .json as Session;
    // Someone who copied the first refresh token tries it after the phone has moved on.
    const copy = await call('POST', '/v1/auth/refresh', { refreshToken: first.refreshToken });
    assert.deepEqual([copy.status, copy.json], [401, { error: 'signed-out' }]);
    // The phone is signed out too: its current tokens no longer work.
    assert.equal((await call('GET', '/v1/phones', undefined, next.accessToken)).status, 401);
    assert.equal(
      (await call('POST', '/v1/auth/refresh', { refreshToken: next.refreshToken })).status,
      401,
    );
    const [phone] = await sql`select signed_out_why from phones`;
    assert.equal(phone?.['signed_out_why'], 'token-reused');
    const events = await sql`select kind from security_events order by at`;
    assert.deepEqual(
      events.map((e) => e['kind']),
      ['signed-in', 'token-reused'],
    );
  });
});

test('signing out ends this phone’s session', async () => {
  await withApi(async ({ call, signIn }) => {
    const s = await signIn();
    assert.equal((await call('POST', '/v1/auth/sign-out', undefined, s.accessToken)).status, 204);
    assert.equal((await call('GET', '/v1/phones', undefined, s.accessToken)).status, 401);
    assert.equal(
      (await call('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken })).status,
      401,
    );
  });
});

test('one phone signs out another of the same person, never someone else’s', async () => {
  await withApi(async ({ call, signIn }) => {
    const mine = await signIn('1001', 'Pixel 8');
    const other = await signIn('1001', 'Pixel 6a');
    const stranger = await signIn('2002', 'Galaxy S24');

    assert.equal(
      (await call('DELETE', `/v1/phones/${stranger.phoneId}`, undefined, mine.accessToken)).status,
      404,
    );
    assert.equal(
      (await call('DELETE', '/v1/phones/not-an-id', undefined, mine.accessToken)).status,
      404,
    );
    assert.equal((await call('GET', '/v1/phones', undefined, stranger.accessToken)).status, 200);

    assert.equal(
      (await call('DELETE', `/v1/phones/${other.phoneId}`, undefined, mine.accessToken)).status,
      204,
    );
    assert.equal(
      (await call('DELETE', `/v1/phones/${other.phoneId}`, undefined, mine.accessToken)).status,
      404,
    );
    assert.equal((await call('GET', '/v1/phones', undefined, other.accessToken)).status, 401);
    assert.equal(
      (await call('POST', '/v1/auth/refresh', { refreshToken: other.refreshToken })).status,
      401,
    );
    const list = (
      (await call('GET', '/v1/phones', undefined, mine.accessToken)).json as { phones: Phone[] }
    ).phones;
    assert.deepEqual(
      list.map((p) => p.model),
      ['Pixel 8'],
    );
  });
});

test('sign-in attempts from one address are limited to 20 a minute', async () => {
  await withApi(async ({ call }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await call('POST', '/v1/auth/nonce', {})).status);
    assert.deepEqual(statuses.slice(0, 20), Array(20).fill(200));
    assert.equal(statuses[20], 429);
    // Another address is counted on its own (Cloud Run's front end puts it last in X-Forwarded-For).
    const elsewhere = await call('POST', '/v1/auth/nonce', {}, undefined, {
      'x-forwarded-for': '203.0.113.9',
    });
    assert.equal(elsewhere.status, 200);
  });
});

test('bodies must be JSON and small', async () => {
  await withApi(async ({ base }) => {
    const notJson = await fetch(`${base}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    assert.equal(notJson.status, 400);
    const broken = await fetch(`${base}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(broken.status, 400);
    const huge = await fetch(`${base}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'x'.repeat(20_000) }),
    });
    assert.equal(huge.status, 400);
  });
});

test('tokens are stored only as hashes, and never logged; neither are names or emails', async () => {
  await withApi(async ({ signIn, sql, logs, call }) => {
    const s = await signIn();
    await call('POST', '/v1/auth/refresh', { refreshToken: s.refreshToken });
    const dump = JSON.stringify(
      await sql`select (select json_agg(p) from phones p) as phones, (select json_agg(r) from refresh_tokens r) as refresh`,
    );
    for (const t of [s.accessToken, s.refreshToken]) {
      assert.ok(!dump.includes(t));
      assert.ok(!dump.includes(Buffer.from(t, 'base64url').toString('hex')));
    }
    const all = logs.join('');
    for (const secret of [
      s.accessToken,
      s.refreshToken,
      'Maya',
      'maya@example.com',
      '110248495921238986420',
    ]) {
      assert.ok(!all.includes(secret), secret);
    }
    assert.ok(all.includes('"message":"auth.signed-in"'));
  });
});

test('spent nonces and old rate-limit counts are tidied away', async () => {
  await withApi(async ({ call, sql }) => {
    await call('POST', '/v1/auth/nonce', {});
    await sql`update sign_in_nonces set expires_at = now() - interval '1 minute'`;
    await sql`update rate_limits set window_start = now() - interval '2 hours'`;
    await tidy(sql);
    const [n] =
      await sql`select (select count(*) from sign_in_nonces)::int as a, (select count(*) from rate_limits)::int as b`;
    assert.deepEqual({ ...n }, { a: 0, b: 0 });
  });
});
