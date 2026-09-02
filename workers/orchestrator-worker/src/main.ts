import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { DailyOrchestrator } from "@shortfactory/orchestrator";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { asJobRecord, jobNumber, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "orchestrator-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const orchestrator = new DailyOrchestrator(queue);
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "orchestrator", async (job) => {
  const payload = asJobRecord(job.payload);
  const channelValues = Array.isArray(payload?.channels) ? payload.channels : [];
  const channels = channelValues.flatMap((value) => {
    const channel = asJobRecord(value);
    const id = jobString(channel, "id");
    if (!id) return [];
    return [{ id, status: jobString(channel, "status") as "ACTIVE" | "PAUSED" | "ARCHIVED" | undefined, videosPerDay: jobNumber(channel, "videosPerDay") }];
  });
  const readyByChannel = asJobRecord(payload?.readyByChannel);
  if (channels.length === 0 || !readyByChannel) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "orchestration job waiting for channel inventory"); return; }
  const result = await orchestrator.run({ channels, readyByChannel: Object.fromEntries(Object.entries(readyByChannel).map(([key, value]) => [key, typeof value === "number" ? value : 0])), approvedOrScheduledByChannel: asJobRecord(payload?.approvedOrScheduledByChannel) as Record<string, number> | undefined, correlationId: job.correlationId });
  logger.info({ jobName: job.name, correlationId: job.correlationId, priority: result.priority, enqueued: result.enqueued.length, processingMode: result.processingMode }, "orchestration job processed");
});

logger.info({ mode: queue.mode, orchestrator: orchestrator.constructor.name, schedule: "external cron or scheduler" }, "orchestrator worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "orchestrator worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
