import { Pool } from "pg";
import type { ServiceMode } from "@shortfactory/shared";
import type { QueueProcessor, QueueWorkerHandle } from "@shortfactory/queue";
import { createQueueWorker } from "@shortfactory/queue";
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

export function createAuditedQueueWorker(database: DatabaseClient, mode: "mock" | "redis", redisUrl: string, queueName: string, processor: QueueProcessor): QueueWorkerHandle {
  return createQueueWorker(mode, redisUrl, queueName, createAuditedProcessor(database, queueName, processor));
}

export function createAuditedProcessor(database: DatabaseClient, queueName: string, processor: QueueProcessor): QueueProcessor {
  return async (job) => {
    const jobId = job.jobId ?? job.idempotencyKey ?? job.correlationId;
    const metadata = { correlationId: job.correlationId, idempotencyKey: job.idempotencyKey };
    const startedAt = new Date().toISOString();
    await writeJobAudit(database.domain, { queue: queueName, jobId, type: job.name, entityId: jobEntityId(job.payload), status: "RUNNING", attempt: job.attempt ?? 0, startedAt, metadata });
    try {
      await processor(job);
      await writeJobAudit(database.domain, { queue: queueName, jobId, type: job.name, entityId: jobEntityId(job.payload), status: "COMPLETED", attempt: job.attempt ?? 0, startedAt, completedAt: new Date().toISOString(), metadata });
    } catch (error) {
      await writeJobAudit(database.domain, { queue: queueName, jobId, type: job.name, entityId: jobEntityId(job.payload), status: "FAILED", attempt: job.attempt ?? 0, startedAt, completedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "job failed", metadata });
      throw error;
    }
  };
}

async function writeJobAudit(domain: DomainStore, input: Parameters<DomainStore["createJobAudit"]>[0]): Promise<void> { try { await domain.createJobAudit(input); } catch { /* audit persistence must not hide the original queue outcome */ } }
function jobEntityId(payload: unknown): string | undefined { const value = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : undefined; const candidates = [value?.entityId, value?.candidateId, value?.videoId, value?.publicationId, value?.sourceAssetId]; return candidates.find((candidate): candidate is string => typeof candidate === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(candidate)); }
