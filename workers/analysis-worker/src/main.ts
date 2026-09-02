import { DeterministicAnalysisProvider } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "analysis-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new DeterministicAnalysisProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "analysis", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "analysis job processed"); void provider; });
logger.info({ mode: queue.mode, provider: provider.constructor.name, maxRetries: 2 }, "analysis worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "analysis worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
