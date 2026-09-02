import { describe, expect, it } from "vitest";
import { scheduleAnalyticsWindows } from "./index.js";

describe("analytics collection windows", () => {
  it("schedules the five required snapshots idempotently", () => {
    const jobs = scheduleAnalyticsWindows("publication-1", new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
    expect(jobs.map((job) => job.window)).toEqual(["1h", "6h", "24h", "72h", "7d"]);
    expect(new Set(jobs.map((job) => job.idempotencyKey)).size).toBe(5);
  });
});
