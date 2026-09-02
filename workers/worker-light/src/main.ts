import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "worker-light" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);

logger.info({ mode: queue.mode }, "light worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "light worker shutting down");
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
