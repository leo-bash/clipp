import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "@shortfactory/config";
import { createDatabase, type DatabaseClient } from "@shortfactory/database";
import { createPostgresAnalyticsSnapshotStore, InMemoryAnalyticsSnapshotStore, type AnalyticsSnapshotStore } from "@shortfactory/analytics";
import { createPostgresCostControlLedger, CostControlService, InMemoryCostControlLedger, type CostControlService as CostControlServiceType } from "@shortfactory/cost-control";
import { RightsGate } from "@shortfactory/rights";
import { createLogger } from "@shortfactory/logger";
import { createQueue, type QueueClient } from "@shortfactory/queue";
import type { DependencyHealth, HealthStatus, ReadinessResponse } from "@shortfactory/shared";
import { AppError, type OperationalControls } from "@shortfactory/shared";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { registerDomainRoutes, isRequestValidationError } from "./domain-routes.js";
import { registerAnalyticsRoutes } from "./analytics-routes.js";
import { MetricsRegistry } from "./metrics.js";
import { createConfiguredStorageProvider, type StorageProvider } from "@shortfactory/storage";
import { registerPipelineRoutes } from "./pipeline-routes.js";

const execFileAsync = promisify(execFile);

export interface AppDependencies {
  database: DatabaseClient;
  queue: QueueClient;
  costControl: CostControlServiceType;
  rightsGate: RightsGate;
  analyticsStore: AnalyticsSnapshotStore;
  storage: StorageProvider;
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
  const metrics = new MetricsRegistry();
  const controls: OperationalControls = { stopAllPublishing: config.STOP_ALL_PUBLISHING, stopRendering: config.STOP_RENDERING, stopPaidApis: config.STOP_PAID_APIS };
  const database = supplied?.database ?? createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
  const dependencies: AppDependencies = {
    database,
    queue: supplied?.queue ?? createQueue(config.QUEUE_MODE, config.REDIS_URL),
    costControl: supplied?.costControl ?? new CostControlService(
      dependenciesLedger(database),
      { monthlyBudgetEur: config.MONTHLY_BUDGET_EUR }
    ),
    rightsGate: supplied?.rightsGate ?? new RightsGate(),
    analyticsStore: supplied?.analyticsStore ?? createAnalyticsStore(database),
    storage: supplied?.storage ?? createConfiguredStorageProvider({ root: config.STORAGE_ROOT, endpoint: config.R2_ENDPOINT, bucket: config.R2_BUCKET, accessKeyId: config.R2_ACCESS_KEY, secretAccessKey: config.R2_SECRET_KEY, region: config.R2_REGION })
  };
  await dependencies.database.domain.ensureSeedData();
  // Fastify's logger generic is intentionally narrower than Pino's runtime logger.
  // The unknown boundary keeps the shared redacting logger without weakening the rest of the app types.
  const server = Fastify({ loggerInstance: logger, bodyLimit: 1_048_576 }) as unknown as FastifyInstance;

  await server.register(helmet);
  await server.register(cors, { origin: config.CORS_ORIGIN });
  await server.register(rateLimit, { max: config.API_RATE_LIMIT_MAX, timeWindow: config.API_RATE_LIMIT_WINDOW_MS, errorResponseBuilder: () => ({ error: "RATE_LIMITED", message: "request rate limit exceeded" }) });
  server.addHook("onRequest", async (request, reply) => {
    if (config.AUTH_MODE === "api-key" && request.method !== "OPTIONS" && !request.url.startsWith("/health") && !request.url.startsWith("/ready") && !request.url.startsWith("/metrics")) {
      const role = roleForApiKey(request.headers["x-api-key"], config);
      if (!role) return reply.code(401).send({ error: "UNAUTHENTICATED", message: "a configured x-api-key is required" });
      if (request.method !== "GET" && request.method !== "HEAD" && role === "VIEWER") return reply.code(403).send({ error: "FORBIDDEN", message: "viewer role cannot mutate resources" });
    }
    const supplied = request.headers["x-correlation-id"];
    const correlationId = typeof supplied === "string" && supplied.length <= 128 ? supplied : request.id;
    reply.header("x-request-id", request.id);
    reply.header("x-correlation-id", correlationId);
  });
  server.addHook("onResponse", async (request, reply) => {
    metrics.recordRequest(reply.statusCode);
    request.log.info({ requestId: request.id, correlationId: reply.getHeader("x-correlation-id"), method: request.method, url: request.url, statusCode: reply.statusCode }, "request completed");
  });
  server.setErrorHandler((error, request, reply) => {
    if (isRequestValidationError(error)) return reply.code(400).send({ error: "VALIDATION_ERROR", details: error.issues });
    if (error instanceof Error && error.message === "NOT_FOUND") return reply.code(404).send({ error: "NOT_FOUND" });
    if (error instanceof AppError) return reply.code(400).send({ error: error.code, message: error.message });
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  await registerDomainRoutes(server, dependencies.database.domain, dependencies.costControl, dependencies.rightsGate, "", controls, config.AUTH_MODE, config.ADMIN_API_KEY);
  await registerDomainRoutes(server, dependencies.database.domain, dependencies.costControl, dependencies.rightsGate, "/api/v1", controls, config.AUTH_MODE, config.ADMIN_API_KEY);
  await registerAnalyticsRoutes(server, dependencies.analyticsStore);
  await registerAnalyticsRoutes(server, dependencies.analyticsStore, "/api/v1");
  await registerPipelineRoutes(server, dependencies.database.domain, dependencies.storage, "/api/v1");

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
      ),
      checkFfmpeg(),
      Promise.resolve({ name: "storage", status: config.R2_ENDPOINT && config.R2_BUCKET ? "ok" : "degraded", mode: "mock", detail: config.R2_ENDPOINT && config.R2_BUCKET ? "R2/S3-compatible storage configured" : "local storage adapter active" } as const),
      Promise.resolve({ name: "llm", status: "degraded", mode: "mock", detail: "deterministic adapter active; configure a paid provider before production" } as const),
      Promise.resolve({ name: "tts", status: "degraded", mode: "mock", detail: "TTS is disabled until a provider is configured" } as const),
      Promise.resolve({ name: "workers", status: "degraded", mode: dependencies.queue.mode, detail: "worker liveness is supervised by queue consumers; inspect worker logs" } as const),
      Promise.resolve({ name: "auth", status: config.AUTH_MODE === "api-key" && config.ADMIN_API_KEY ? "ok" : "degraded", mode: "mock", detail: config.AUTH_MODE === "api-key" && config.ADMIN_API_KEY ? "admin API key configured" : "configure AUTH_MODE=api-key and ADMIN_API_KEY" } as const),
      Promise.resolve({ name: "budget", status: "ok", mode: "mock", detail: `monthly budget €${config.MONTHLY_BUDGET_EUR.toFixed(2)}` } as const),
      Promise.resolve({ name: "platforms", status: "degraded", mode: "mock", detail: "platform credentials are validated at publish time" } as const)
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

  server.get("/metrics", async (_request, reply) => reply.type("text/plain; version=0.0.4").send(metrics.renderPrometheus()));

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

async function checkFfmpeg(): Promise<DependencyHealth> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { maxBuffer: 64 * 1024 });
    return { name: "ffmpeg", status: "ok", mode: "mock", detail: "local FFmpeg available" };
  } catch {
    return { name: "ffmpeg", status: "down", mode: "mock", detail: "FFmpeg is required for rendering" };
  }
}

function dependenciesLedger(database: DatabaseClient) {
  const pool = database.getPostgresPool();
  return pool ? createPostgresCostControlLedger(pool) : new InMemoryCostControlLedger();
}

function createAnalyticsStore(database: DatabaseClient): AnalyticsSnapshotStore {
  const pool = database.getPostgresPool();
  return pool ? createPostgresAnalyticsSnapshotStore(pool) : new InMemoryAnalyticsSnapshotStore();
}

function roleForApiKey(value: string | string[] | undefined, config: AppConfig): "ADMIN" | "EDITOR" | "VIEWER" | undefined {
  if (typeof value !== "string" || value.length < 16) return undefined;
  if (config.ADMIN_API_KEY && value === config.ADMIN_API_KEY) return "ADMIN";
  if (config.EDITOR_API_KEY && value === config.EDITOR_API_KEY) return "EDITOR";
  if (config.VIEWER_API_KEY && value === config.VIEWER_API_KEY) return "VIEWER";
  return undefined;
}
