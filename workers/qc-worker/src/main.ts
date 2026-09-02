import { loadConfig } from "@shortfactory/config";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobNumber, jobString } from "@shortfactory/shared";
import { defaultQcConfig, runQualityControl } from "@shortfactory/video";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "qc-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "qc", async (job) => {
  const payload = asJobRecord(job.payload);
  const outputPath = jobString(payload, "outputPath") ?? jobString(payload, "filePath");
  if (!outputPath) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "qc job waiting for rendered output path"); return; }
  const qc = await runQualityControl(outputPath, {
    width: jobNumber(asJobRecord(payload?.qcConfig), "width") ?? defaultQcConfig.width,
    height: jobNumber(asJobRecord(payload?.qcConfig), "height") ?? defaultQcConfig.height,
    minDuration: jobNumber(asJobRecord(payload?.qcConfig), "minDuration") ?? defaultQcConfig.minDuration,
    maxDuration: jobNumber(asJobRecord(payload?.qcConfig), "maxDuration") ?? defaultQcConfig.maxDuration,
    audioRequired: typeof asJobRecord(payload?.qcConfig)?.audioRequired === "boolean" ? asJobRecord(payload?.qcConfig)?.audioRequired as boolean : defaultQcConfig.audioRequired,
    maxFileSizeBytes: jobNumber(asJobRecord(payload?.qcConfig), "maxFileSizeBytes") ?? defaultQcConfig.maxFileSizeBytes
  });
  if (!qc.passed) { logger.warn({ jobName: job.name, correlationId: job.correlationId, outputPath, qualityScore: qc.score, checks: qc.checks }, "qc rejected rendered output"); return; }
  await queue.enqueue("review", { name: "qc-passed", payload: { ...payload, qc }, correlationId: job.correlationId, idempotencyKey: `review:${jobString(payload, "videoId") ?? outputPath}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, outputPath, qualityScore: qc.score }, "qc accepted rendered output");
});

logger.info({ mode: queue.mode, qc: "ffprobe_plus_black_video" }, "qc worker ready");
const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "qc worker shutting down"); await worker.close(); await queue.close(); await database.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
