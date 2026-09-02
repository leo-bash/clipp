import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { DeterministicTranscriptionProvider } from "@shortfactory/transcription";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "transcription-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new DeterministicTranscriptionProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "transcription", async (job) => {
  const payload = asJobRecord(job.payload);
  const mediaHash = jobString(payload, "mediaHash") ?? jobString(payload, "externalId");
  const language = jobString(payload, "language") ?? "en";
  const model = jobString(payload, "model") ?? "deterministic-transcription";
  if (!mediaHash) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "transcription job waiting for media hash"); return; }
  const transcript = await provider.transcribe({ mediaHash, language, model, sourceText: jobString(payload, "sourceText") ?? jobString(payload, "title") });
  await queue.enqueue("analysis", { name: "transcript-ready", payload: { ...payload, transcript }, correlationId: job.correlationId, idempotencyKey: `analysis:${mediaHash}:${language}:${model}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, mediaHash, segmentCount: transcript.segments.length }, "transcription job processed");
});
logger.info({ mode: queue.mode, provider: provider.constructor.name, cacheKey: "media_hash:language:model" }, "transcription worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "transcription worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
