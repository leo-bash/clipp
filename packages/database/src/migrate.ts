import { readFile } from "node:fs/promises";
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
  const migrationPath = path.resolve(process.cwd(), "drizzle/0000_core_domain.sql");
  const migrationId = path.basename(migrationPath);
  const existing = await client.query<{ id: string }>("SELECT id FROM schema_migrations WHERE id = $1", [migrationId]);
  if (existing.rowCount === 0) {
    await client.query("BEGIN");
    await client.query(await readFile(migrationPath, "utf8"));
    await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migrationId]);
    await client.query("COMMIT");
    console.log(`applied migration ${migrationId}`);
  } else {
    console.log(`migration ${migrationId} already applied`);
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
