import { describe, expect, it } from "vitest";
import { createQueue } from "./index.js";

describe("queue foundation", () => {
  it("supports deterministic mock jobs", async () => {
    const queue = createQueue("mock", "redis://unused");

    await expect(queue.ping()).resolves.toBeUndefined();
    await expect(queue.enqueue("analysis", { name: "analyze", payload: { candidateId: "candidate-1" }, correlationId: "correlation-1", idempotencyKey: "candidate-1:analysis:v1" })).resolves.toBeUndefined();
    expect(queue.getJobs?.()[0]?.idempotencyKey).toBe("candidate-1:analysis:v1");
    await queue.enqueueDeadLetter?.({ originalQueue: "analysis", job: { name: "analyze", payload: { candidateId: "candidate-1" }, correlationId: "correlation-1", idempotencyKey: "candidate-1:analysis:v1" }, error: "permanent failure", failedAt: new Date().toISOString() });
    expect(queue.getDeadLetters?.()).toHaveLength(1);
    await queue.close();
  });

  it.skipIf(process.env.RUN_REDIS_INTEGRATION !== "1")("keeps a Redis readiness probe idempotent after the first connection", async () => {
    const queue = createQueue("redis", process.env.REDIS_URL ?? "redis://localhost:6379");
    await queue.ping();
    await expect(queue.ping()).resolves.toBeUndefined();
    await queue.close();
  }, 10_000);
});
