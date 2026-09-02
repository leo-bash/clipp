import { afterAll, describe, expect, it } from "vitest";
import { createQueue, type QueueClient } from "./index.js";

const integration = process.env.RUN_REDIS_INTEGRATION === "1" ? describe : describe.skip;

integration("redis integration", () => {
  let queue: QueueClient | undefined;

  it("pings Redis and enqueues an idempotent BullMQ job", async () => {
    queue = createQueue("redis", process.env.REDIS_URL ?? "redis://localhost:6379");
    await queue.ping();
    await queue.enqueue("integration", { name: "smoke", payload: { source: "ci" }, correlationId: "redis-integration", idempotencyKey: `redis-integration:${Date.now()}` });
    expect(queue.mode).toBe("redis");
  });

  afterAll(async () => queue?.close());
});
