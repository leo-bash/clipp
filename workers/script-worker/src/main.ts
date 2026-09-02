import { DeterministicContentPlanner } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobNumber, jobString } from "@shortfactory/shared";
import { transcriptSchema } from "@shortfactory/transcription";
import { analysisSchema } from "@shortfactory/ai";
import type { RenderPlan } from "@shortfactory/video";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "script-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const planner = new DeterministicContentPlanner();
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "planning", async (job) => {
  const payload = asJobRecord(job.payload);
  const candidateId = jobString(payload, "candidateId");
  const transcriptResult = payload?.transcript;
  const analysisResult = payload?.analysis;
  if (!candidateId || !transcriptResult || !analysisResult) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "planning job waiting for analysis inputs"); return; }
  const transcript = transcriptSchema.parse(transcriptResult);
  const analysis = analysisSchema.parse(analysisResult);
  const channelConfig = asJobRecord(payload?.channelConfig) ?? {};
  const plan = await planner.plan({ candidateId, channelType: jobString(channelConfig, "type") ?? "CUSTOM", analysis, transcript, minDuration: jobNumber(channelConfig, "minDuration") ?? 1, maxDuration: jobNumber(channelConfig, "maxDuration") ?? 60 });
  const inputPath = jobString(payload, "inputPath");
  const outputPath = jobString(payload, "outputPath");
  if (inputPath && outputPath) {
    const renderPlan: RenderPlan = { inputPath, outputPath, captions: plan.editPlan.captions ? [{ start: 0, end: plan.editPlan.duration, text: plan.script }] : [], metadata: { title: plan.title, description: plan.description } };
    await queue.enqueue("render", { name: "content-plan-ready", payload: { ...payload, plan: renderPlan }, correlationId: job.correlationId, idempotencyKey: `render:${candidateId}` });
  }
  logger.info({ jobName: job.name, correlationId: job.correlationId, candidateId, targetDuration: plan.targetDuration }, "planning job processed");
});
logger.info({ mode: queue.mode, planner: planner.constructor.name }, "script worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "script worker shutting down"); await worker.close(); await queue.close(); await database.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
