import { execFileSync } from "node:child_process";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue } from "@shortfactory/queue";
import { FFmpegRenderer } from "@shortfactory/video";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "worker-render" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const renderer = new FFmpegRenderer();

let ffmpegAvailable = false;
try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
  ffmpegAvailable = true;
} catch {
  logger.warn("ffprobe unavailable; render jobs will remain disabled until the render image is used");
}

logger.info({ mode: queue.mode, ffmpegAvailable, renderer: renderer.constructor.name }, "render worker ready");

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "render worker shutting down");
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
