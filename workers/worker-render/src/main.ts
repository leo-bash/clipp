import { execFileSync } from "node:child_process";
import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { FFmpegRenderer, type RenderPlan } from "@shortfactory/video";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "worker-render" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const renderer = new FFmpegRenderer();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "render", async (job) => {
  const payload = job.payload as { plan?: RenderPlan };
  if (payload.plan) {
    const result = await renderer.render(payload.plan);
    logger.info({ jobName: job.name, correlationId: job.correlationId, outputPath: result.outputPath, qcPassed: result.qc.passed }, "render job completed");
    return;
  }
  logger.info({ jobName: job.name, correlationId: job.correlationId }, "render job acknowledged without a render plan");
});

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
  await worker.close();
  await queue.close();
  process.exit(0);
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
