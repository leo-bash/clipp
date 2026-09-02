import { loadConfig } from "@shortfactory/config";
import { ManualDiscoveryProvider } from "@shortfactory/discovery";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "discovery-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new ManualDiscoveryProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "discovery", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "discovery job processed"); void provider; });
logger.info({ mode: queue.mode, provider: provider.constructor.name, strategy: "metadata-first" }, "discovery worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "discovery worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
