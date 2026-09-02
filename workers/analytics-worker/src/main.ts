import { AnalyticsCollector, InMemoryAnalyticsSnapshotStore } from "@shortfactory/analytics";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "analytics-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const collector = new AnalyticsCollector(new InMemoryAnalyticsSnapshotStore());

logger.info({ mode: queue.mode, collector: collector.constructor.name }, "analytics worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "analytics worker shutting down");
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
