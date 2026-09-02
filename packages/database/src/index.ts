import { Pool } from "pg";
import type { ServiceMode } from "@shortfactory/shared";

export interface DatabaseClient {
  readonly mode: ServiceMode;
  ping(): Promise<void>;
  close(): Promise<void>;
}

class MemoryDatabase implements DatabaseClient {
  public readonly mode = "memory" as const;

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }
}

class PostgresDatabase implements DatabaseClient {
  public readonly mode = "postgres" as const;
  private readonly pool: Pool;

  public constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 5 });
  }

  public async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDatabase(mode: "memory" | "postgres", url: string): DatabaseClient {
  return mode === "postgres" ? new PostgresDatabase(url) : new MemoryDatabase();
}
