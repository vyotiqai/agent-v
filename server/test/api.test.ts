import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApi } from '../src/api/app.ts';
import { connect } from '../src/db/connect.ts';
import { loadMigrations, MIGRATIONS, migrate } from '../src/db/migrate.ts';
import { createLogger } from '../src/log.ts';
import { withDatabase } from './db.ts';

async function serve(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('liveness, readiness and the answers for unknown routes and methods', async () => {
  await withDatabase(async (sql) => {
    const shipped = await loadMigrations(MIGRATIONS);
    const lines: Record<string, unknown>[] = [];
    const logger = createLogger({ write: (l) => lines.push(JSON.parse(l)) });
    await migrate(sql, shipped, logger);
    const server = createApi({ sql, logger, schema: shipped.length });
    const base = await serve(server);
    try {
      const health = await fetch(`${base}/healthz`);
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ok' });
      assert.equal(health.headers.get('cache-control'), 'no-store');

      const ready = await fetch(`${base}/readyz`, {
        headers: { traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' },
      });
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: 'ready' });

      const missing = await fetch(`${base}/people/maya@example.com?note=dinner`);
      assert.equal(missing.status, 404);
      const post = await fetch(`${base}/healthz`, { method: 'POST' });
      assert.equal(post.status, 405);
      assert.equal(post.headers.get('allow'), 'GET, HEAD');
      const head = await fetch(`${base}/healthz`, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');

      const requests = lines.filter((l) => l['message'] === 'api.request');
      assert.equal(requests.length, 5);
      assert.equal(requests[1]?.['traceId'], '0af7651916cd43dd8448eb211c80319c');
      assert.equal(requests[2]?.['route'], 'not-found');
      const all = JSON.stringify(lines);
      assert.ok(!all.includes('maya') && !all.includes('dinner'), all);
    } finally {
      server.close();
    }
  });
});

test('not ready while the database is behind the code', async () => {
  await withDatabase(async (sql) => {
    const logger = createLogger({ write: () => {} });
    const server = createApi({ sql, logger, schema: 1 });
    const base = await serve(server);
    try {
      const r = await fetch(`${base}/readyz`);
      assert.equal(r.status, 503);
      assert.deepEqual(await r.json(), { status: 'not-ready', reason: 'schema' });
    } finally {
      server.close();
    }
  });
});

test('not ready when the database cannot be reached, and the error is logged by kind', async () => {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({ write: (l) => lines.push(JSON.parse(l)) });
  const sql = connect('postgres://nobody@127.0.0.1:1/none', { max: 1 });
  const server = createApi({ sql, logger, schema: 0 });
  const base = await serve(server);
  try {
    const r = await fetch(`${base}/readyz`);
    assert.equal(r.status, 503);
    assert.deepEqual(await r.json(), { status: 'not-ready', reason: 'database' });
    const error = lines.find((l) => l['message'] === 'api.error');
    assert.equal(error?.['errorKind'], 'database');
  } finally {
    server.close();
    await sql.end({ timeout: 1 });
  }
});
