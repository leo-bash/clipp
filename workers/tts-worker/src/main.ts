import { createHash } from "node:crypto";
import path from "node:path";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { CostControlService, createPostgresCostControlLedger, InMemoryCostControlLedger } from "@shortfactory/cost-control";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";
import { CachedTtsProvider, CostAwareTtsProvider, DeterministicTtsProvider, DisabledTtsProvider, ElevenLabsTtsProvider, type TTSProvider, type TtsCostGate } from "@shortfactory/tts";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "tts-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const postgresPool = database.getPostgresPool();
const costControl = new CostControlService(postgresPool ? createPostgresCostControlLedger(postgresPool) : new InMemoryCostControlLedger(), { monthlyBudgetEur: config.MONTHLY_BUDGET_EUR });
const provider = new CachedTtsProvider(new CostAwareTtsProvider(createProvider(config.TTS_PROVIDER), createTtsCostGate(costControl, config.TTS_PROVIDER)));
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "tts", async (job) => {
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
  const providerConfigured = config.TTS_PROVIDER === "mock" || config.TTS_PROVIDER === "deterministic" || (config.TTS_PROVIDER === "elevenlabs" && Boolean(config.TTS_API_KEY && config.TTS_VOICE_ID));
  if (!providerConfigured) {
    logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, estimatedCost }, "tts provider is not configured for execution");
    return;
  }
  const result = await provider.synthesize(input);
  await queue.enqueue("render", { name: "tts-ready", payload: { ...payload, candidateId, tts: result }, correlationId: job.correlationId, idempotencyKey: `render:${candidateId}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, provider: result.provider, costEur: result.costEur }, "tts job processed");
});

logger.info({ mode: queue.mode, provider: provider.constructor.name }, "tts worker ready");

function createProvider(providerName: string): TTSProvider {
  if (providerName === "mock" || providerName === "deterministic") return new DeterministicTtsProvider();
  if (providerName === "elevenlabs") return new ElevenLabsTtsProvider({ apiKey: config.TTS_API_KEY, voiceId: config.TTS_VOICE_ID, modelId: config.TTS_MODEL_ID, outputFormat: config.TTS_OUTPUT_FORMAT, outputDirectory: path.resolve(config.TTS_OUTPUT_ROOT), costPerThousandCharactersEur: config.TTS_COST_PER_1000_CHARS_EUR });
  return new DisabledTtsProvider();
}

function createTtsCostGate(service: CostControlService, provider: string): TtsCostGate {
  return {
    async reserve(input, estimatedCostEur) { const idempotencyKey = `tts:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`; const reservation = await service.reserve({ scope: "GLOBAL", scopeId: "global", period: currentPeriod(), idempotencyKey, amount: estimatedCostEur, provider, service: "tts", operation: "synthesize" }); return reservation.id; },
    async commit(reservationId, actualCostEur) { await service.commit(reservationId, actualCostEur, { provider, service: "tts", operation: "synthesize", quantity: 1, unit: "request", estimatedCostEur: actualCostEur }); },
    async release(reservationId) { await service.release(reservationId); }
  };
}

function currentPeriod(): string { const date = new Date(); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`; }

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "tts worker shutting down");
  await worker.close();
  await queue.close();
  await database.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
