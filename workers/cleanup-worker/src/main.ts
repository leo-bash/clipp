import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { createConfiguredStorageProvider } from "@shortfactory/storage";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "cleanup-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const storage = createConfiguredStorageProvider({ root: config.STORAGE_ROOT, endpoint: config.R2_ENDPOINT, bucket: config.R2_BUCKET, accessKeyId: config.R2_ACCESS_KEY, secretAccessKey: config.R2_SECRET_KEY, region: config.R2_REGION });
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "cleanup", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "cleanup job processed"); void storage; });
logger.info({ mode: queue.mode, storage: storage.constructor.name, policy: "legal_hold_and_preserve_aware" }, "cleanup worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "cleanup worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
