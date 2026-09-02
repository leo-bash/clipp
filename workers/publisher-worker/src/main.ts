import { InstagramMockPublisher, InstagramPublisher, PublishingScheduler, TikTokMockPublisher, TikTokPublisher, YouTubeMockPublisher, YouTubePublisher } from "@shortfactory/platforms";
import { loadConfig } from "@shortfactory/config";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "publisher-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const youtube = config.YOUTUBE_CLIENT_ID && config.YOUTUBE_CLIENT_SECRET && config.YOUTUBE_REDIRECT_URI && config.YOUTUBE_ACCESS_TOKEN
  ? new YouTubePublisher({ clientId: config.YOUTUBE_CLIENT_ID, clientSecret: config.YOUTUBE_CLIENT_SECRET, redirectUri: config.YOUTUBE_REDIRECT_URI, accessToken: config.YOUTUBE_ACCESS_TOKEN, refreshToken: config.YOUTUBE_REFRESH_TOKEN || undefined })
  : new YouTubeMockPublisher();
const tiktok = config.TIKTOK_CLIENT_KEY && config.TIKTOK_CLIENT_SECRET && config.TIKTOK_ACCESS_TOKEN
  ? new TikTokPublisher({ clientKey: config.TIKTOK_CLIENT_KEY, clientSecret: config.TIKTOK_CLIENT_SECRET, accessToken: config.TIKTOK_ACCESS_TOKEN, openId: config.TIKTOK_OPEN_ID || undefined, mode: config.TIKTOK_MODE, fallbackToDraft: config.TIKTOK_FALLBACK_TO_DRAFT })
  : new TikTokMockPublisher();
const instagram = config.INSTAGRAM_ACCESS_TOKEN && config.INSTAGRAM_USER_ID
  ? new InstagramPublisher({ accessToken: config.INSTAGRAM_ACCESS_TOKEN, instagramUserId: config.INSTAGRAM_USER_ID, apiVersion: config.INSTAGRAM_API_VERSION })
  : new InstagramMockPublisher();
const publishers = [youtube, tiktok, instagram];
const scheduler = new PublishingScheduler(publishers);
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "publish", async (job) => {
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

logger.info({ mode: queue.mode, scheduler: scheduler.constructor.name, adapters: publishers.map((publisher) => `${publisher.platform}:${publisher.constructor.name}`) }, "publisher worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "publisher worker shutting down");
  await worker.close();
  await queue.close();
  await database.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
