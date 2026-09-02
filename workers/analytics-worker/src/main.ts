import { AnalyticsCollector, createPostgresAnalyticsSnapshotStore, InMemoryAnalyticsSnapshotStore } from "@shortfactory/analytics";
import { createAuditedQueueWorker, createDatabase } from "@shortfactory/database";
import { InstagramMockPublisher, TikTokMockPublisher, YouTubeMockPublisher, type PlatformPublisher } from "@shortfactory/platforms";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "analytics-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const database = createDatabase(config.DATABASE_MODE, config.DATABASE_URL);
const postgresPool = database.getPostgresPool();
const analyticsStore = postgresPool ? createPostgresAnalyticsSnapshotStore(postgresPool) : new InMemoryAnalyticsSnapshotStore();
const collector = new AnalyticsCollector(analyticsStore);
const publishers: Record<string, PlatformPublisher> = { YOUTUBE: new YouTubeMockPublisher(), TIKTOK: new TikTokMockPublisher(), INSTAGRAM: new InstagramMockPublisher() };
const worker = createAuditedQueueWorker(database, config.QUEUE_MODE, config.REDIS_URL, "analytics", async (job) => {
  const payload = asJobRecord(job.payload);
  const publicationId = jobString(payload, "publicationId");
  const externalPostId = jobString(payload, "externalPostId");
  const platform = jobString(payload, "platform");
  const publisher = platform ? publishers[platform] : undefined;
  if (!publicationId || !externalPostId || !publisher) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "analytics job waiting for publication identity"); return; }
  const snapshot = await collector.collect({ publicationId, platform: platform as string, externalPostId, publisher, channelId: jobString(payload, "channelId") });
  logger.info({ jobName: job.name, correlationId: job.correlationId, publicationId, platform: snapshot.platform, views: snapshot.views }, "analytics job processed");
});

logger.info({ mode: queue.mode, collector: collector.constructor.name }, "analytics worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "analytics worker shutting down");
  await worker.close();
  await queue.close();
  await database.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
