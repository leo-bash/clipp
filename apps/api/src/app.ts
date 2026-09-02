import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "@shortfactory/config";
import { createDatabase, type DatabaseClient } from "@shortfactory/database";
import { createPostgresCostControlLedger, CostControlService, InMemoryCostControlLedger, type CostControlService as CostControlServiceType } from "@shortfactory/cost-control";
import { RightsGate } from "@shortfactory/rights";
import { createLogger } from "@shortfactory/logger";
import { createQueue, type QueueClient } from "@shortfactory/queue";
import type { DependencyHealth, HealthStatus, ReadinessResponse } from "@shortfactory/shared";
import { AppError } from "@shortfactory/shared";
import { registerDomainRoutes, isRequestValidationError } from "./domain-routes.js";

export interface AppDependencies {
  database: DatabaseClient;
  queue: QueueClient;
  costControl: CostControlServiceType;
  rightsGate: RightsGate;
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
  const database = supplied?.database ?? createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
  const dependencies: AppDependencies = {
    database,
    queue: supplied?.queue ?? createQueue(config.QUEUE_MODE, config.REDIS_URL),
    costControl: supplied?.costControl ?? new CostControlService(
      dependenciesLedger(database),
      { monthlyBudgetEur: config.MONTHLY_BUDGET_EUR }
    ),
    rightsGate: supplied?.rightsGate ?? new RightsGate()
  };
  await dependencies.database.domain.ensureSeedData();
  // Fastify's logger generic is intentionally narrower than Pino's runtime logger.
  // The unknown boundary keeps the shared redacting logger without weakening the rest of the app types.
  const server = Fastify({ loggerInstance: logger }) as unknown as FastifyInstance;

  await server.register(helmet);
  await server.register(cors, { origin: config.CORS_ORIGIN });
  server.setErrorHandler((error, request, reply) => {
    if (isRequestValidationError(error)) return reply.code(400).send({ error: "VALIDATION_ERROR", details: error.issues });
    if (error instanceof Error && error.message === "NOT_FOUND") return reply.code(404).send({ error: "NOT_FOUND" });
    if (error instanceof AppError) return reply.code(400).send({ error: error.code, message: error.message });
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  await registerDomainRoutes(server, dependencies.database.domain, dependencies.costControl, dependencies.rightsGate);
  await registerDomainRoutes(server, dependencies.database.domain, dependencies.costControl, dependencies.rightsGate, "/api/v1");

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

function dependenciesLedger(database: DatabaseClient) {
  const pool = database.getPostgresPool();
  return pool ? createPostgresCostControlLedger(pool) : new InMemoryCostControlLedger();
}
