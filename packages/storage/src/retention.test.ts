import { describe, expect, it } from "vitest";
import { retentionDays, retentionExpiry } from "./index.js";

describe("storage lifecycle policy", () => {
  it("keeps the specification retention windows explicit", () => {
    expect(retentionDays).toEqual({ raw: 7, tempRender: 3, failedRender: 7, published: 30, thumbnail: 90 });
    expect(retentionExpiry("thumbnail", new Date("2026-01-01T00:00:00.000Z")).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});
