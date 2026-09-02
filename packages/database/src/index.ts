import { Pool } from "pg";
import type { ServiceMode } from "@shortfactory/shared";
import { MemoryDomainStore, createPostgresDomainStore, type DomainStore } from "./domain.js";

export * from "./domain.js";
export * from "./schema.js";

export interface DatabaseClient {
  readonly mode: ServiceMode;
  readonly domain: DomainStore;
  getPostgresPool(): Pool | undefined;
  ping(): Promise<void>;
  close(): Promise<void>;
}

class MemoryDatabase implements DatabaseClient {
  public readonly mode = "memory" as const;
  public readonly domain = new MemoryDomainStore();

  public getPostgresPool(): undefined { return undefined; }

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
  public readonly domain: DomainStore;

  public constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 5 });
    this.domain = createPostgresDomainStore({ pool: this.pool });
  }

  public getPostgresPool(): Pool { return this.pool; }

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
