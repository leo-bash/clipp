import { AiPipeline, DeterministicAnalysisProvider, DeterministicContentPlanner, ModelRouter } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { CachedTranscriptionProvider, DeterministicTranscriptionProvider } from "@shortfactory/transcription";
import { asJobRecord, jobString } from "@shortfactory/shared";
import type { RenderPlan } from "@shortfactory/video";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "worker-light" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const modelRouter = new ModelRouter({ paidApisDisabled: config.STOP_PAID_APIS });
const aiPipeline = new AiPipeline(new CachedTranscriptionProvider(new DeterministicTranscriptionProvider()), new DeterministicAnalysisProvider(), new DeterministicContentPlanner());
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "ingestion", async (job) => {
  const payload = asJobRecord(job.payload);
  const candidateId = jobString(payload, "candidateId");
  const mediaHash = jobString(payload, "mediaHash") ?? jobString(payload, "externalId");
  if (!candidateId || !mediaHash) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "ingestion job waiting for candidate and media hash"); return; }
  const channelConfig = asJobRecord(payload?.channelConfig) ?? { type: "CUSTOM", minDuration: 1, maxDuration: 60 };
  const remainingBudget = typeof payload?.remainingBudgetEur === "number" ? payload.remainingBudgetEur : config.MONTHLY_BUDGET_EUR;
  const transcriptionModel = jobString(payload, "transcriptionModel") ?? modelRouter.route("transcription", remainingBudget).model;
  const result = await aiPipeline.run({ candidateId, mediaHash, language: jobString(payload, "language") ?? "en", transcriptionModel, sourceText: jobString(payload, "sourceText") ?? jobString(payload, "title"), metadata: asJobRecord(payload?.metadata) ?? {}, channelConfig: { type: jobString(channelConfig, "type") ?? "CUSTOM", minDuration: typeof channelConfig.minDuration === "number" ? channelConfig.minDuration : 1, maxDuration: typeof channelConfig.maxDuration === "number" ? channelConfig.maxDuration : 60 } });
  const inputPath = jobString(payload, "inputPath");
  const outputPath = jobString(payload, "outputPath");
  if (inputPath && outputPath) {
    const renderPlan: RenderPlan = { inputPath, outputPath, captions: result.contentPlan.editPlan.captions ? [{ start: 0, end: result.contentPlan.editPlan.duration, text: result.contentPlan.script }] : [], metadata: { title: result.contentPlan.title, description: result.contentPlan.description } };
    await queue.enqueue("render", { name: "ai-plan-ready", payload: { ...payload, transcript: result.transcript, analysis: result.analysis, plan: renderPlan }, correlationId: job.correlationId, idempotencyKey: `render:${candidateId}` });
  }
  logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, targetDuration: result.contentPlan.targetDuration }, "ingestion AI pipeline completed");
});

logger.info({ mode: queue.mode, aiPipeline: aiPipeline.constructor.name, modelRouting: modelRouter.constructor.name }, "light worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "light worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
