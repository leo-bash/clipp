import { DeterministicContentPlanner } from "@shortfactory/ai";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "script-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const planner = new DeterministicContentPlanner();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "planning", async (job) => { logger.info({ jobName: job.name, correlationId: job.correlationId }, "planning job processed"); void planner; });
logger.info({ mode: queue.mode, planner: planner.constructor.name }, "script worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "script worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
