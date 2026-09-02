import { describe, expect, it } from "vitest";
import { InstagramMockPublisher, InMemoryDistributedLock, PublishingScheduler, TikTokMockPublisher, YouTubeMockPublisher } from "./index.js";

describe("mock publishing", () => {
  it("schedules an approved video to all three independent publishers", async () => {
    const scheduler = new PublishingScheduler([new YouTubeMockPublisher(), new TikTokMockPublisher(), new InstagramMockPublisher()], new InMemoryDistributedLock(), () => new Date("2026-09-02T08:00:00.000Z"));
    const result = await scheduler.publishApprovedVideo({ id: "video-1", status: "APPROVED", rightsStatus: "OWNED" }, { id: "channel-1", timezone: "Europe/Rome", publishingSlots: ["09:00", "12:00", "15:00"] }, { title: "A reviewed short", description: "Description" });
    expect(result.status).toBe("SUCCESS");
    expect(result.publications).toHaveLength(3);
    expect(result.publications.every((publication) => publication.status === "SUCCESS")).toBe(true);
    expect(result.publications.map((publication) => publication.externalUrl)).toEqual(expect.arrayContaining([expect.stringContaining("youtube"), expect.stringContaining("tiktok"), expect.stringContaining("instagram")]));
  });

  it("reports partial failure without hiding successful publications", async () => {
    const scheduler = new PublishingScheduler([new YouTubeMockPublisher(), new TikTokMockPublisher({ failPublishes: true }), new InstagramMockPublisher()], new InMemoryDistributedLock(), () => new Date("2026-09-02T08:00:00.000Z"));
    const result = await scheduler.publishApprovedVideo({ id: "video-2", status: "APPROVED", rightsStatus: "OWNED" }, { id: "channel-1", timezone: "Europe/Rome", publishingSlots: ["09:00"] }, { title: "Reviewed", description: "Description" });
    expect(result.status).toBe("PARTIAL_FAILURE");
    expect(result.publications.filter((publication) => publication.status === "SUCCESS")).toHaveLength(2);
    expect(result.publications.find((publication) => publication.platform === "TIKTOK")?.status).toBe("FAILED");
  });
});
