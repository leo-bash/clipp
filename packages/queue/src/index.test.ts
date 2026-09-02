import { describe, expect, it } from "vitest";
import { createQueue } from "./index.js";

describe("queue foundation", () => {
  it("supports deterministic mock jobs", async () => {
    const queue = createQueue("mock", "redis://unused");

    await expect(queue.ping()).resolves.toBeUndefined();
    await expect(queue.enqueue("analysis", { name: "analyze", payload: { candidateId: "candidate-1" }, correlationId: "correlation-1" })).resolves.toBeUndefined();
    await queue.close();
  });
});
