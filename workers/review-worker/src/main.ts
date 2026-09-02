import { loadConfig } from "@shortfactory/config";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "review-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "review", async (job) => {
  const payload = asJobRecord(job.payload);
  logger.info({ jobName: job.name, correlationId: job.correlationId, videoId: jobString(payload, "videoId"), reviewRequired: true }, "review item queued for manual operator decision");
});

logger.info({ mode: queue.mode, reviewRequired: true }, "review worker ready");
const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "review worker shutting down"); await worker.close(); await queue.close(); await database.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
