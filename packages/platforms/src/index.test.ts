import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstagramMockPublisher, InMemoryDistributedLock, PublishingScheduler, TikTokMockPublisher, TikTokPublisher, YouTubeMockPublisher, YouTubePublisher } from "./index.js";

afterEach(() => { vi.unstubAllGlobals(); });

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

  it("uses the official YouTube resumable upload flow with private default", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-youtube-"));
    const filePath = path.join(directory, "video.mp4");
    await writeFile(filePath, "fixture");
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      if (String(input).includes("upload.test") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { status?: { privacyStatus?: string } };
        expect(body.status?.privacyStatus).toBe("private");
        return new Response("", { status: 200, headers: { location: "https://upload.test/session" } });
      }
      if (String(input) === "https://upload.test/session") return new Response(JSON.stringify({ id: "youtube-video-1" }), { status: 200 });
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new YouTubePublisher({ clientId: "client", clientSecret: "secret", redirectUri: "http://localhost/callback", accessToken: "token", uploadBaseUrl: "https://upload.test/youtube/v3" }).publish({ videoId: "video-1", title: "Title", description: "Description", filePath, scheduledAt: "2099-01-01T09:00:00Z" });
      expect(result).toMatchObject({ platform: "YOUTUBE", status: "SUCCESS", externalPostId: "youtube-video-1" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("uses TikTok Content Posting API direct-post initialization and transfer", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-tiktok-"));
    const filePath = path.join(directory, "video.mp4");
    await writeFile(filePath, "fixture");
    const fetchMock = vi.fn(async (input: unknown): Promise<Response> => {
      if (String(input).includes("/v2/post/publish/video/init/")) return new Response(JSON.stringify({ data: { publish_id: "tiktok-publish-1", upload_url: "https://upload.test/tiktok" }, error: { code: "ok" } }), { status: 200 });
      if (String(input) === "https://upload.test/tiktok") return new Response("", { status: 201 });
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new TikTokPublisher({ clientKey: "key", clientSecret: "secret", accessToken: "token", mode: "DIRECT_POST", apiBaseUrl: "https://api.test" }).publish({ videoId: "video-1", title: "Title", description: "Description", filePath, scheduledAt: "2099-01-01T09:00:00Z" });
      expect(result).toMatchObject({ platform: "TIKTOK", status: "SUCCESS", externalPostId: "tiktok-publish-1" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
