import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { withDatabase } from './db.ts';

/**
 * The processes as they are deployed: started from their entry points with real settings, used,
 * then stopped the way Cloud Run stops them (SIGTERM). Every line they print must be a log line.
 */

const SERVER = new URL('../', import.meta.url);

function start(
  entry: string,
  env: Record<string, string>,
): { child: ChildProcess; lines: () => Record<string, unknown>[] } {
  const child = spawn(process.execPath, [entry], {
    cwd: SERVER,
    env: { PATH: process.env['PATH'] ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout?.setEncoding('utf8').on('data', (c: string) => {
    out += c;
  });
  let err = '';
  child.stderr?.setEncoding('utf8').on('data', (c: string) => {
    err += c;
  });
  return {
    child,
    lines: () => {
      assert.equal(err, '', 'nothing may be written outside the logger');
      return out
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    },
  };
}

async function freePort(): Promise<number> {
  const s = createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const { port } = s.address() as { port: number };
  s.close();
  await once(s, 'close');
  return port;
}

async function waitFor(url: string): Promise<Response> {
  for (let i = 0; i < 100; i++) {
    try {
      return await fetch(url);
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`${url} never answered`);
}

test('migrate applies the schema and exits 0; the API then starts ready and stops on SIGTERM', async () => {
  await withDatabase(async (_sql, url) => {
    const migrate = start('src/migrate/main.ts', { DATABASE_URL: url });
    const [code] = await once(migrate.child, 'exit');
    assert.equal(code, 0);
    const done = migrate.lines().find((l) => l['message'] === 'migrate.done');
    assert.ok(done, 'migrate.done was logged');

    const port = await freePort();
    const api = start('src/api/main.ts', {
      DATABASE_URL: url,
      PORT: String(port),
      GOOGLE_CLIENT_ID: 'agent-v-test.apps.googleusercontent.com',
    });
    try {
      const ready = await waitFor(`http://127.0.0.1:${port}/readyz`);
      assert.equal(ready.status, 200);
    } finally {
      api.child.kill('SIGTERM');
    }
    const [apiCode] = await once(api.child, 'exit');
    assert.equal(apiCode, 0);
    const messages = api.lines().map((l) => l['message']);
    assert.deepEqual(
      messages.filter((m) => m !== 'api.request'),
      ['process.start', 'process.stop'],
    );
  });
});

test('migrate exits 1, logged by kind, when the database cannot be reached', async () => {
  const migrate = start('src/migrate/main.ts', {
    DATABASE_URL: 'postgres://nobody@127.0.0.1:1/none',
  });
  const [code] = await once(migrate.child, 'exit');
  assert.equal(code, 1);
  const failed = migrate.lines().find((l) => l['message'] === 'migrate.failed');
  assert.equal(failed?.['errorKind'], 'database');
});

test('a process with a missing setting stops at once and says nothing but a crash line', async () => {
  const api = start('src/api/main.ts', {});
  const [code] = await once(api.child, 'exit');
  assert.equal(code, 1);
  const crash = api.lines().find((l) => l['message'] === 'process.crash');
  assert.equal(crash?.['errorKind'], 'internal');
});

test('the egress gateway starts, answers its probe and refuses a private address', async () => {
  const port = await freePort();
  const gateway = start('src/egress/main.ts', { PORT: String(port) });
  try {
    const health = await waitFor(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    // A request for http://169.254.169.254/ (the cloud metadata server), sent to the gateway.
    const refused = await new Promise<{ status: number; kind: unknown }>((resolve, reject) => {
      request(
        { host: '127.0.0.1', port, path: 'http://169.254.169.254/computeMetadata/v1/' },
        (res) => {
          res.resume();
          resolve({ status: res.statusCode ?? 0, kind: res.headers['x-egress-refused'] });
        },
      )
        .on('error', reject)
        .end();
    });
    assert.deepEqual(refused, { status: 403, kind: 'private-address' });
  } finally {
    gateway.child.kill('SIGTERM');
  }
  const [code] = await once(gateway.child, 'exit');
  assert.equal(code, 0);
});
