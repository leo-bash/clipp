import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "@shortfactory/config";
import { createDatabase, type DatabaseClient } from "@shortfactory/database";
import { createLogger } from "@shortfactory/logger";
import { createQueue, type QueueClient } from "@shortfactory/queue";
import type { DependencyHealth, HealthStatus, ReadinessResponse } from "@shortfactory/shared";

export interface AppDependencies {
  database: DatabaseClient;
  queue: QueueClient;
}

export interface ShortFactoryApp {
  server: FastifyInstance;
  dependencies: AppDependencies;
  close(): Promise<void>;
}

function statusFromChecks(checks: DependencyHealth[]): HealthStatus {
  if (checks.some((check) => check.status === "down")) return "down";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  return "ok";
}

export async function buildApp(config: AppConfig, supplied?: Partial<AppDependencies>): Promise<ShortFactoryApp> {
  const logger = createLogger(config.LOG_LEVEL);
  const dependencies: AppDependencies = {
    database: supplied?.database ?? createDatabase(config.DATABASE_MODE, config.DATABASE_URL),
    queue: supplied?.queue ?? createQueue(config.QUEUE_MODE, config.REDIS_URL)
  };
  // Fastify's logger generic is intentionally narrower than Pino's runtime logger.
  // The unknown boundary keeps the shared redacting logger without weakening the rest of the app types.
  const server = Fastify({ loggerInstance: logger }) as unknown as FastifyInstance;

  await server.register(helmet);
  await server.register(cors, { origin: config.CORS_ORIGIN });

  server.get("/health", async () => ({
    status: "ok",
    service: "api",
    version: config.APP_VERSION,
    timestamp: new Date().toISOString()
  }));

  server.get<{ Reply: ReadinessResponse }>("/ready", async (_request, reply) => {
    const checks = await Promise.all([
      dependencies.database.ping().then(
        () => ({ name: "postgres", status: dependencies.database.mode === "memory" ? "degraded" : "ok", mode: dependencies.database.mode } as const),
        (error: unknown) => ({ name: "postgres", status: "down", mode: dependencies.database.mode, detail: error instanceof Error ? error.message : "database ping failed" } as const)
      ),
      dependencies.queue.ping().then(
        () => ({ name: "redis", status: dependencies.queue.mode === "mock" ? "degraded" : "ok", mode: dependencies.queue.mode } as const),
        (error: unknown) => ({ name: "redis", status: "down", mode: dependencies.queue.mode, detail: error instanceof Error ? error.message : "queue ping failed" } as const)
      )
    ]);
    const status = statusFromChecks(checks);
    const response: ReadinessResponse = {
      status,
      service: "api",
      version: config.APP_VERSION,
      dependencies: checks,
      timestamp: new Date().toISOString()
    };

    if (status === "down") return reply.code(503).send(response);
    return response;
  });

  server.get("/api/v1/health", async () => ({
    status: "ok",
    service: "api",
    version: config.APP_VERSION,
    timestamp: new Date().toISOString()
  }));

  return {
    server,
    dependencies,
    async close() {
      await server.close();
      await dependencies.queue.close();
      await dependencies.database.close();
    }
  };
}
