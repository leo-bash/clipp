import { loadConfig } from "@shortfactory/config";
import { createDatabase } from "./index.js";

const config = loadConfig();
if (config.DATABASE_MODE !== "postgres") {
  throw new Error("DATABASE_MODE=postgres is required to seed PostgreSQL");
}

const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
await database.domain.ensureSeedData();
await database.close();
console.log("database seed completed");
