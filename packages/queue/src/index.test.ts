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
});
