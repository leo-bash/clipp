import { AiPipeline, DeterministicAnalysisProvider, DeterministicContentPlanner } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { CachedTranscriptionProvider, DeterministicTranscriptionProvider } from "@shortfactory/transcription";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "worker-light" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const aiPipeline = new AiPipeline(new CachedTranscriptionProvider(new DeterministicTranscriptionProvider()), new DeterministicAnalysisProvider(), new DeterministicContentPlanner());
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "ingestion", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "ingestion job processed"); void aiPipeline; });

logger.info({ mode: queue.mode, aiPipeline: aiPipeline.constructor.name }, "light worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "light worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
