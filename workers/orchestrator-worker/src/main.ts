import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { DailyOrchestrator } from "@shortfactory/orchestrator";
import { createQueue, createQueueWorker } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "orchestrator-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const orchestrator = new DailyOrchestrator(queue);
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "orchestrator", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "orchestration job processed"); void orchestrator; });

logger.info({ mode: queue.mode, orchestrator: orchestrator.constructor.name, schedule: "external cron or scheduler" }, "orchestrator worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "orchestrator worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
