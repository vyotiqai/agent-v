import { fileURLToPath } from "node:url";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { schema } from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;

export interface Database {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(url: string, max = 10): Database {
  const pool = new pg.Pool({ connectionString: url, max });
  // Idle clients can be dropped by a database restart; without a listener pg crashes the process.
  pool.on("error", (error) => console.error("[db] idle client error:", error.message));
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}
