import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";
import { CachedTtsProvider, DeterministicTtsProvider, DisabledTtsProvider, type TTSProvider } from "@shortfactory/tts";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "tts-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = createProvider(config.TTS_PROVIDER);
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "tts", async (job) => {
  const payload = asJobRecord(job.payload);
  const text = jobString(payload, "text") ?? jobString(payload, "script");
  const language = jobString(payload, "language") ?? "en";
  const voice = jobString(payload, "voice") ?? "default";
  const candidateId = jobString(payload, "candidateId");
  if (!text || !candidateId) {
    logger.info({ jobName: job.name, correlationId: job.correlationId }, "tts job waiting for candidate and text");
    return;
  }
  const input = { text, language, voice };
  const estimatedCost = await provider.estimatedCost(input);
  if (config.TTS_PROVIDER !== "mock" && config.TTS_PROVIDER !== "deterministic") {
    logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, estimatedCost }, "tts provider is not configured for execution");
    return;
  }
  const result = await provider.synthesize(input);
  await queue.enqueue("render", { name: "tts-ready", payload: { ...payload, candidateId, tts: result }, correlationId: job.correlationId, idempotencyKey: `render:${candidateId}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, provider: result.provider, costEur: result.costEur }, "tts job processed");
});

logger.info({ mode: queue.mode, provider: provider.constructor.name }, "tts worker ready");

function createProvider(providerName: string): TTSProvider {
  if (providerName === "mock" || providerName === "deterministic") return new CachedTtsProvider(new DeterministicTtsProvider());
  return new DisabledTtsProvider();
}

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "tts worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
