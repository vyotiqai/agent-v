import { randomBytes } from 'node:crypto';
import { connect, type Sql } from '../src/db/connect.ts';

/**
 * Integration tests run against a real Postgres (stage 6, section 22). TEST_DATABASE_URL names a
 * server and a user that may create databases; each test gets a fresh, empty database of its own,
 * dropped afterwards. Without the setting the tests fail, rather than being skipped, so a run
 * can't look green without having run.
 */
export function testServerUrl(): string {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Integration tests need a real Postgres: see server/README.md.',
    );
  }
  return url;
}

export async function withDatabase<T>(fn: (sql: Sql, url: string) => Promise<T>): Promise<T> {
  const serverUrl = testServerUrl();
  const name = `agentv_test_${randomBytes(6).toString('hex')}`;
  const admin = connect(serverUrl, { max: 1 });
  await admin.unsafe(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const sql = connect(url.href);
  try {
    return await fn(sql, url.href);
  } finally {
    await sql.end();
    await admin.unsafe(`drop database ${name} with (force)`);
    await admin.end();
  }
}
