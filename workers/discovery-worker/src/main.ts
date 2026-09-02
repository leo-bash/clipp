import { loadConfig } from "@shortfactory/config";
import { ManualDiscoveryProvider } from "@shortfactory/discovery";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { asJobRecord, jobNumber, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "discovery-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const provider = new ManualDiscoveryProvider();
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "discovery", async (job) => {
  const payload = asJobRecord(job.payload);
  const sourceId = jobString(payload, "sourceId");
  const sourceUrl = jobString(payload, "sourceUrl");
  if (!sourceId || !sourceUrl) { logger.info({ jobName: job.name, correlationId: job.correlationId }, "discovery job waiting for source metadata"); return; }
  const assets = await provider.discover({ sourceId, sourceUrl, keywords: Array.isArray(payload?.keywords) ? payload.keywords.filter((value): value is string => typeof value === "string") : [], limit: jobNumber(payload, "limit") });
  for (const asset of assets) await queue.enqueue("ingestion", { name: "discovered-asset", payload: asset, correlationId: job.correlationId, idempotencyKey: `ingestion:${asset.sourceId}:${asset.externalId}` });
  logger.info({ jobName: job.name, correlationId: job.correlationId, assetCount: assets.length }, "discovery job processed");
});
logger.info({ mode: queue.mode, provider: provider.constructor.name, strategy: "metadata-first" }, "discovery worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "discovery worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
