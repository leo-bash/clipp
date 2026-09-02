import { z } from "zod";

const booleanFromEnv = z.enum(["true", "false"]).transform((value) => value === "true");

export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_VERSION: z.string().default("0.1.0"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_MODE: z.enum(["memory", "postgres"]).default("memory"),
  DATABASE_URL: z.string().url().default("postgresql://shortfactory:shortfactory@localhost:5432/shortfactory"),
  QUEUE_MODE: z.enum(["mock", "redis"]).default("mock"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  MONTHLY_BUDGET_EUR: z.coerce.number().nonnegative().default(50),
  APP_ENCRYPTION_KEY: z.string().min(16).default("development-only-replace-me"),
  R2_ENDPOINT: z.string().url().or(z.literal("")).default(""),
  R2_BUCKET: z.string().default(""),
  R2_ACCESS_KEY: z.string().default(""),
  R2_SECRET_KEY: z.string().default(""),
  STORAGE_ROOT: z.string().default("./.data/storage"),
  R2_REGION: z.string().default("auto"),
  STOP_ALL_PUBLISHING: booleanFromEnv.default("false"),
  STOP_RENDERING: booleanFromEnv.default("false"),
  STOP_PAID_APIS: booleanFromEnv.default("false"),
  RENDER_CONCURRENCY: z.coerce.number().int().positive().default(1),
  AI_CONCURRENCY: z.coerce.number().int().positive().default(3),
  PUBLISH_CONCURRENCY: z.coerce.number().int().positive().default(1),
  ANALYTICS_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}

export { booleanFromEnv };
