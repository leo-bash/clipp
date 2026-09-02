import { describe, expect, it } from "vitest";
import { createQueue } from "@shortfactory/queue";
import { DailyOrchestrator, InMemoryIdempotencyStore } from "./index.js";

describe("daily orchestrator", () => {
  it("targets 18 videos, maintains a 36-video buffer and enqueues every pipeline stage", async () => {
    const queue = createQueue("mock", "redis://unused");
    const orchestrator = new DailyOrchestrator(queue);

    const result = await orchestrator.run({
      channels: [{ id: "channel-a" }, { id: "channel-b" }, { id: "channel-c" }],
      readyByChannel: { "channel-a": 0, "channel-b": 0, "channel-c": 0 },
      now: new Date("2026-09-02T06:00:00.000Z"),
      correlationId: "daily-correlation"
    });

    expect(result.targetVideos).toBe(18);
    expect(result.bufferTarget).toBe(36);
    expect(result.priority).toBe("HIGH");
    expect(result.enqueued).toHaveLength(36);
    expect(result.enqueued.every((job) => job.payload.targetCount === 12)).toBe(true);
    expect(new Set(result.enqueued.map((job) => job.queue))).toEqual(new Set([
      "discovery", "ingestion", "transcription", "analysis", "planning", "tts", "render", "qc", "review", "publish", "analytics", "cleanup"
    ]));
    await queue.close();
  });

  it("does not duplicate a day's jobs on a retry and reduces processing above the upper buffer", async () => {
    const queue = createQueue("mock", "redis://unused");
    const orchestrator = new DailyOrchestrator(queue, undefined, new InMemoryIdempotencyStore());
    const input = { channels: [{ id: "channel-a" }, { id: "channel-b" }, { id: "channel-c" }], readyByChannel: { "channel-a": 20, "channel-b": 20, "channel-c": 20 }, now: new Date("2026-09-02T06:00:00.000Z") };

    const first = await orchestrator.run({ ...input, readyByChannel: { "channel-a": 0, "channel-b": 0, "channel-c": 0 } });
    const second = await orchestrator.run({ ...input, readyByChannel: { "channel-a": 0, "channel-b": 0, "channel-c": 0 } });
    const reduced = await orchestrator.run(input);

    expect(first.enqueued).toHaveLength(36);
    expect(second.enqueued).toHaveLength(0);
    expect(second.skipped).toHaveLength(36);
    expect(reduced.processingMode).toBe("REDUCE");
    expect(reduced.enqueued).toHaveLength(0);
    await queue.close();
  });
});
