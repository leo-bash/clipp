import { InstagramMockPublisher, PublishingScheduler, TikTokMockPublisher, YouTubeMockPublisher } from "@shortfactory/platforms";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "publisher-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const scheduler = new PublishingScheduler([new YouTubeMockPublisher(), new TikTokMockPublisher(), new InstagramMockPublisher()]);
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "publish", async (job) => {
  const payload = asJobRecord(job.payload);
  const video = asJobRecord(payload?.video) ?? payload;
  const channel = asJobRecord(payload?.channel);
  const videoId = jobString(video, "id") ?? jobString(payload, "videoId");
  const channelId = jobString(channel, "id") ?? jobString(payload, "channelId");
  const status = jobString(video, "status");
  const rightsStatus = jobString(video, "rightsStatus");
  const timezone = jobString(channel, "timezone");
  const slots = Array.isArray(channel?.publishingSlots) ? channel.publishingSlots.filter((value): value is string => typeof value === "string") : [];
  if (!videoId || !channelId || !status || !rightsStatus || !timezone || slots.length === 0) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "publish job waiting for approved video and channel configuration"); return; }
  const result = await scheduler.publishApprovedVideo({ id: videoId, status, rightsStatus }, { id: channelId, timezone, publishingSlots: slots }, { title: jobString(payload, "title") ?? videoId, description: jobString(payload, "description") ?? "", storageKey: jobString(video, "storageKey"), filePath: jobString(payload, "filePath"), publicMediaUrl: jobString(payload, "publicMediaUrl"), privacyStatus: "private" });
  logger.info({ jobName: job.name, correlationId: job.correlationId, videoId, status: result.status, publicationCount: result.publications.length }, "publish job processed");
});

logger.info({ mode: queue.mode, scheduler: scheduler.constructor.name }, "publisher worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "publisher worker shutting down");
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
