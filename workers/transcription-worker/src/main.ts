import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { DeterministicTranscriptionProvider } from "@shortfactory/transcription";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "transcription-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new DeterministicTranscriptionProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "transcription", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "transcription job processed"); void provider; });
logger.info({ mode: queue.mode, provider: provider.constructor.name, cacheKey: "media_hash:language:model" }, "transcription worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "transcription worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
