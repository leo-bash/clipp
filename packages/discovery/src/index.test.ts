import { describe, expect, it } from "vitest";
import { DuplicateDetector, ManualDiscoveryProvider, type DiscoveredAsset } from "./index.js";

const asset: DiscoveredAsset = { sourceId: "source-1", externalId: "external-1", sourceUrl: "https://example.com/video/1", title: "Keyboard shortcuts", rightsStatus: "OWNED", metadata: {} };

describe("discovery and duplicate detection", () => {
  it("discovers metadata without downloading media and filters by keywords", async () => {
    const provider = new ManualDiscoveryProvider([asset]);
    await expect(provider.discover({ sourceId: "source-1", sourceUrl: "https://example.com", keywords: ["keyboard"] })).resolves.toEqual([asset]);
    await expect(provider.getStats("external-1")).resolves.toEqual({ views: 0, likes: 0, comments: 0, shares: 0 });
  });

  it("protects URL, external ID and SHA-256 uniqueness", () => {
    const detector = new DuplicateDetector();
    expect(detector.remember({ url: "https://example.com/video/1#tracking", externalId: "external-1", contentHash: "hash-1" }).duplicate).toBe(false);
    expect(detector.check({ url: "https://example.com/video/1", externalId: "other", contentHash: "other" })).toMatchObject({ duplicate: true, matchedBy: "url" });
    expect(detector.check({ url: "https://example.com/other", externalId: "external-1", contentHash: "other" })).toMatchObject({ duplicate: true, matchedBy: "external_id" });
    expect(detector.check({ url: "https://example.com/other", externalId: "other", contentHash: "hash-1" })).toMatchObject({ duplicate: true, matchedBy: "content_hash" });
  });
});
