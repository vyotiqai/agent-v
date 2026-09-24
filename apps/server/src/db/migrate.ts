import { createDatabase, runMigrations } from "./client.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const database = createDatabase(url, 1);
await runMigrations(database.db);
await database.close();
console.log("Migrations applied");
