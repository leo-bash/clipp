import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "./index.js";

const integration = process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

integration("postgres integration", () => {
  const database = createDatabase("postgres", process.env.DATABASE_URL ?? "postgresql://shortfactory:shortfactory@localhost:5432/shortfactory");

  afterAll(async () => database.close());

  it("pings PostgreSQL and reads the migrated seeded domain", async () => {
    await database.ping();
    await database.domain.ensureSeedData();
    await expect(database.domain.listChannels({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 3 });
    await expect(database.domain.listSources({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 5 });
  });
});
