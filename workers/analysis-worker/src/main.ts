import { DeterministicAnalysisProvider } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";
import { transcriptSchema } from "@shortfactory/transcription";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "analysis-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new DeterministicAnalysisProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "analysis", async (job) => {
  const payload = asJobRecord(job.payload);
  const candidateId = jobString(payload, "candidateId");
  const transcriptResult = payload?.transcript;
  const transcript = transcriptResult ? transcriptSchema.parse(transcriptResult) : undefined;
  if (!candidateId || !transcript) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "analysis job waiting for candidate transcript"); return; }
  const analysis = await provider.analyze({ candidateId, metadata: asJobRecord(payload?.metadata) ?? {}, transcript, channelConfig: asJobRecord(payload?.channelConfig) ?? {} });
  await queue.enqueue("planning", { name: "analysis-ready", payload: { ...payload, analysis }, correlationId: job.correlationId, idempotencyKey: `planning:${candidateId}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, riskFlags: analysis.riskFlags }, "analysis job processed");
});
logger.info({ mode: queue.mode, provider: provider.constructor.name, maxRetries: 2 }, "analysis worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "analysis worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
