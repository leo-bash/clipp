import { InstagramMockPublisher, PublishingScheduler, TikTokMockPublisher, YouTubeMockPublisher } from "@shortfactory/platforms";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "publisher-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const scheduler = new PublishingScheduler([new YouTubeMockPublisher(), new TikTokMockPublisher(), new InstagramMockPublisher()]);

logger.info({ mode: queue.mode, scheduler: scheduler.constructor.name }, "publisher worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "publisher worker shutting down");
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
