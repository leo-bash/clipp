import { describe, expect, it } from "vitest";
import { AnalyticsCollector, InMemoryAnalyticsSnapshotStore, buildAnalyticsOverview, computePerformanceScore } from "./index.js";
import { YouTubeMockPublisher } from "@shortfactory/platforms";

describe("analytics", () => {
  it("collects independent publication snapshots", async () => {
    const collector = new AnalyticsCollector(new InMemoryAnalyticsSnapshotStore(), () => new Date("2026-09-02T12:00:00Z"));
    const result = await collector.collectMany([{ publicationId: "pub-1", platform: "YOUTUBE", externalPostId: "yt-1", publisher: new YouTubeMockPublisher() }]);
    expect(result.status).toBe("SUCCESS");
    expect(result.snapshots[0]).toMatchObject({ publicationId: "pub-1", platform: "YOUTUBE", views: 0, followersGained: 0 });
  });

  it("normalizes performance score and keeps blocked rights as a hard zero", () => {
    const signals = { views24h: 10000, views7d: 20000, engagementRate: 12, completionRate: 80, followerConversion: 4, recency: 90, relevance: 80, novelty: 70, historicalFormatPerformance: 75, rightsStatus: "OWNED" };
    expect(computePerformanceScore(signals)).toBeGreaterThan(0);
    expect(computePerformanceScore({ ...signals, rightsStatus: "BLOCKED" })).toBe(0);
  });

  it("aggregates analytics by channel and experiment format", () => {
    const overview = buildAnalyticsOverview([
      { id: "s-1", publicationId: "p-1", platform: "YOUTUBE", externalPostId: "yt-1", capturedAt: "2026-09-02T12:00:00Z", channelId: "channel-1", followersGained: 3, views: 100, likes: 10, comments: 2, shares: 1, metadata: { formatId: "tutorial-v1" } },
      { id: "s-2", publicationId: "p-2", platform: "TIKTOK", externalPostId: "tt-1", capturedAt: "2026-09-02T12:00:00Z", channelId: "channel-1", followersGained: 2, views: 50, likes: 5, comments: 1, shares: 1, metadata: { formatId: "tutorial-v1" } }
    ]);

    expect(overview.byChannel["channel-1"]).toMatchObject({ views: 150, followersGained: 5 });
    expect(overview.byFormat["tutorial-v1"]).toMatchObject({ views: 150, followersGained: 5 });
  });
});
