import { describe, expect, it } from "vitest";
import { MemoryDomainStore } from "./domain.js";

describe("core domain store", () => {
  it("seeds three channels and five sources idempotently", async () => {
    const store = new MemoryDomainStore();

    await store.ensureSeedData();
    await store.ensureSeedData();

    await expect(store.listChannels({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 3 });
    await expect(store.listSources({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 5 });
  });

  it("supports a candidate-to-video approval state transition", async () => {
    const store = new MemoryDomainStore();
    await store.ensureSeedData();
    const channels = await store.listChannels({ page: 1, pageSize: 1 });
    const channel = channels.items[0];
    if (!channel) throw new Error("seed channel missing");

    const candidate = await store.createCandidate({ channelId: channel.id, topic: "A validated test topic", scoreTotal: 75 });
    expect((await store.selectCandidate(candidate.id))?.status).toBe("SELECTED");
    const video = await store.createVideo({ channelId: channel.id, candidateId: candidate.id, rightsStatus: "OWNED" });
    expect((await store.approveVideo(video.id))?.status).toBe("APPROVED");
  });
});
