import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadMigrations, migrate, schemaVersion } from '../src/db/migrate.ts';
import { createLogger } from '../src/log.ts';
import { withDatabase } from './db.ts';

const quiet = createLogger({ write: () => {} });

async function folder(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'migrations-'));
  for (const [name, body] of Object.entries(files)) await writeFile(join(dir, name), body);
  return dir;
}

const FIRST = 'create table notes (id integer primary key, body text not null);';
const SECOND = 'alter table notes add column done boolean not null default false;';

test('migrations apply in order, once each', async () => {
  const dir = await folder({ '0001_notes.sql': FIRST, '0002_notes_done.sql': SECOND });
  try {
    await withDatabase(async (sql) => {
      assert.equal(await schemaVersion(sql), 0);
      const migrations = await loadMigrations(dir);
      assert.deepEqual(await migrate(sql, migrations, quiet), [1, 2]);
      assert.equal(await schemaVersion(sql), 2);
      await sql`insert into notes (id, body) values (1, 'x')`;
      const [row] = await sql<{ done: boolean }[]>`select done from notes where id = 1`;
      assert.equal(row?.done, false);
      assert.deepEqual(await migrate(sql, migrations, quiet), []);
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('the migrations the server ships load and apply to an empty database', async () => {
  const shipped = await loadMigrations(new URL('../migrations/', import.meta.url));
  await withDatabase(async (sql) => {
    const ran = await migrate(sql, shipped, quiet);
    assert.deepEqual(
      ran,
      shipped.map((m) => m.version),
    );
    assert.equal(await schemaVersion(sql), shipped.length);
  });
});

test('a migration that fails leaves nothing behind', async () => {
  const dir = await folder({
    '0001_notes.sql': FIRST,
    '0002_broken.sql': 'create table half (id integer);\nselect * from no_such_table;',
  });
  try {
    await withDatabase(async (sql) => {
      await assert.rejects(migrate(sql, await loadMigrations(dir), quiet));
      assert.equal(await schemaVersion(sql), 1);
      const [row] = await sql<
        { exists: boolean }[]
      >`select to_regclass('half') is not null as exists`;
      assert.equal(row?.exists, false);
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('an applied migration that was edited stops the runner', async () => {
  const dir = await folder({ '0001_notes.sql': FIRST });
  try {
    await withDatabase(async (sql) => {
      await migrate(sql, await loadMigrations(dir), quiet);
      await writeFile(join(dir, '0001_notes.sql'), `${FIRST}\n-- a later edit`);
      await assert.rejects(migrate(sql, await loadMigrations(dir), quiet), /was edited/);
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('a database newer than the code stops the runner', async () => {
  const both = await folder({ '0001_notes.sql': FIRST, '0002_notes_done.sql': SECOND });
  const older = await folder({ '0001_notes.sql': FIRST });
  try {
    await withDatabase(async (sql) => {
      await migrate(sql, await loadMigrations(both), quiet);
      await assert.rejects(
        migrate(sql, await loadMigrations(older), quiet),
        /older than the database/,
      );
    });
  } finally {
    await rm(both, { recursive: true });
    await rm(older, { recursive: true });
  }
});

test('files must be numbered from 1 with no gaps, and named properly', async () => {
  const gap = await folder({ '0001_notes.sql': FIRST, '0003_notes_done.sql': SECOND });
  const badName = await folder({ '0001_Notes Table.sql': FIRST });
  try {
    await assert.rejects(loadMigrations(gap), /should be number 2/);
    await assert.rejects(loadMigrations(badName), /is not named like/);
  } finally {
    await rm(gap, { recursive: true });
    await rm(badName, { recursive: true });
  }
});

test('two runners at once apply each migration exactly once', async () => {
  const dir = await folder({ '0001_notes.sql': FIRST, '0002_notes_done.sql': SECOND });
  try {
    await withDatabase(async (sql) => {
      const migrations = await loadMigrations(dir);
      const [a, b] = await Promise.all([
        migrate(sql, migrations, quiet),
        migrate(sql, migrations, quiet),
      ]);
      assert.deepEqual([...a, ...b].sort(), [1, 2]);
      const rows = await sql`select version from schema_migrations`;
      assert.equal(rows.length, 2);
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});
