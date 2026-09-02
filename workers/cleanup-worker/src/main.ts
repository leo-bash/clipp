import { loadConfig } from "@shortfactory/config";
import { createLogger } from "@shortfactory/logger";
import { createQueue, createQueueWorker } from "@shortfactory/queue";
import { createConfiguredStorageProvider } from "@shortfactory/storage";
import { asJobRecord, jobString } from "@shortfactory/shared";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL).child({ worker: "cleanup-worker" });
const queue = createQueue(config.QUEUE_MODE, config.REDIS_URL);
const storage = createConfiguredStorageProvider({ root: config.STORAGE_ROOT, endpoint: config.R2_ENDPOINT, bucket: config.R2_BUCKET, accessKeyId: config.R2_ACCESS_KEY, secretAccessKey: config.R2_SECRET_KEY, region: config.R2_REGION });
const worker = createQueueWorker(config.QUEUE_MODE, config.REDIS_URL, "cleanup", async (job) => {
  const payload = asJobRecord(job.payload);
  const policies = Array.isArray(payload?.policies) ? payload.policies.filter((value): value is { key: string; expiresAt: Date; legalHold?: boolean; preserve?: boolean } => {
    const policy = asJobRecord(value);
    return Boolean(policy && jobString(policy, "key") && jobString(policy, "expiresAt"));
  }).map((policy) => ({ ...policy, key: jobString(policy, "key") as string, expiresAt: new Date(jobString(policy, "expiresAt") as string) })) : [];
  const deleted = storage.cleanupExpired ? await storage.cleanupExpired(policies) : [];
  logger.info({ jobName: job.name, correlationId: job.correlationId, deletedCount: deleted.length }, "cleanup job processed");
});
logger.info({ mode: queue.mode, storage: storage.constructor.name, policy: "legal_hold_and_preserve_aware" }, "cleanup worker ready");

const shutdown = async (signal: string): Promise<void> => { logger.info({ signal }, "cleanup worker shutting down"); await worker.close(); await queue.close(); process.exit(0); };
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
