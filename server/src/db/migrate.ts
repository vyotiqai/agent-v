import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Logger } from '../log.ts';
import type { Sql } from './connect.ts';

/**
 * Database changes are numbered SQL files in `server/migrations`, applied in order, each once, by
 * our own small runner (rule 6). The rules, which the runner enforces:
 *
 * - Files are named `0001_what_it_does.sql`, numbered from 1 with no gaps.
 * - A file that has been applied is never edited: its checksum is stored, and a changed file
 *   stops the runner. A mistake is fixed by a new migration.
 * - Each file runs in one transaction, so it applies completely or not at all.
 * - Two runners can't apply the same migration: each migration's transaction holds a lock, and
 *   a second runner waits for it, then finds the migration applied and moves on.
 * - Changes are made in two steps (stage 6, section 21), so the running version and the new one
 *   both work during a deploy: add first, start using it in the next release, remove after.
 */

/** The migrations this server ships, in `server/migrations`. */
export const MIGRATIONS = new URL('../../migrations/', import.meta.url);

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** A reason the runner stops, with a kind the content-free log can carry. */
export class MigrationError extends Error {
  readonly kind: 'migration-edited' | 'migration-unknown';
  constructor(kind: 'migration-edited' | 'migration-unknown', message: string) {
    super(message);
    this.kind = kind;
  }
}

/** An arbitrary constant that names our lock among Postgres advisory locks. */
const LOCK = 7_310_424_001;

export async function loadMigrations(dir: URL | string): Promise<Migration[]> {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  const migrations: Migration[] = [];
  for (const [i, file] of names.entries()) {
    const m = FILE.exec(file);
    if (!m) throw new Error(`Migration file ${file} is not named like 0001_what_it_does.sql.`);
    const version = Number(m[1]);
    if (version !== i + 1) throw new Error(`Migration ${file} should be number ${i + 1}.`);
    const sql = await readFile(new URL(file, dirUrl(dir)), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    migrations.push({ version, name: m[2] as string, sql, checksum });
  }
  return migrations;
}

function dirUrl(dir: URL | string): URL {
  const url = dir instanceof URL ? dir : pathToFileURL(dir);
  return url.href.endsWith('/') ? url : new URL(`${url.href}/`);
}

/** Applies every migration not yet applied, in order. Returns the versions it applied. */
export async function migrate(
  sql: Sql,
  migrations: Migration[],
  logger: Logger,
): Promise<number[]> {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${LOCK})`;
    await tx`
      create table if not exists schema_migrations (
        version integer primary key,
        name text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )`;
    const applied = await tx<{ version: number; checksum: string }[]>`
      select version, checksum from schema_migrations order by version`;
    const known = new Map(migrations.map((m) => [m.version, m]));
    for (const row of applied) {
      const m = known.get(row.version);
      if (!m) {
        throw new MigrationError(
          'migration-unknown',
          `The database has migration ${row.version}, which this code doesn't know: it is older than the database.`,
        );
      }
      if (m.checksum !== row.checksum) {
        throw new MigrationError(
          'migration-edited',
          `Migration ${m.version} was edited after it was applied. Undo the edit and add a new migration.`,
        );
      }
    }
  });
  const ran: number[] = [];
  for (const m of migrations) {
    const started = performance.now();
    // Each migration takes the lock in its own transaction, so a second runner waits, then sees
    // the migration applied and moves on.
    const applied = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${LOCK})`;
      const done = await tx`select 1 from schema_migrations where version = ${m.version}`;
      if (done.length > 0) return false;
      await tx.unsafe(m.sql);
      await tx`insert into schema_migrations (version, name, checksum)
               values (${m.version}, ${m.name}, ${m.checksum})`;
      return true;
    });
    if (!applied) continue;
    logger.log('migrate.applied', { version: m.version, durationMs: performance.now() - started });
    ran.push(m.version);
  }
  return ran;
}

/** The highest migration applied, or 0 when none has been. */
export async function schemaVersion(sql: Sql): Promise<number> {
  const [table] = await sql<{ exists: boolean }[]>`
    select to_regclass('schema_migrations') is not null as exists`;
  if (!table?.exists) return 0;
  const [row] = await sql<{ version: number }[]>`
    select coalesce(max(version), 0)::integer as version from schema_migrations`;
  return row?.version ?? 0;
}
