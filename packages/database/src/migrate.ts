import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { loadConfig } from "@shortfactory/config";

const config = loadConfig();
if (config.DATABASE_MODE !== "postgres") {
  throw new Error("DATABASE_MODE=postgres is required to run migrations");
}

const client = new Client({ connectionString: config.DATABASE_URL });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const migrationDir = path.resolve(process.cwd(), "drizzle");
  const migrationNames = (await readdir(migrationDir)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
  for (const migrationName of migrationNames) {
    const existing = await client.query<{ id: string }>("SELECT id FROM schema_migrations WHERE id = $1", [migrationName]);
    if (existing.rowCount !== 0) {
      console.log(`migration ${migrationName} already applied`);
      continue;
    }
    await client.query("BEGIN");
    await client.query(await readFile(path.join(migrationDir, migrationName), "utf8"));
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationName]);
    await client.query("COMMIT");
    console.log(`applied migration ${migrationName}`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
