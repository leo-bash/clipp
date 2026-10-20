import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTikTokChunkPlan, InstagramMockPublisher, InstagramPublisher, InMemoryDistributedLock, PublishingScheduler, TikTokMockPublisher, TikTokPublisher, YouTubeMockPublisher, YouTubePublisher } from "./index.js";
import { InMemoryProviderRateLimiter } from "./rate-limit.js";

afterEach(() => { vi.unstubAllGlobals(); });

describe("mock publishing", () => {
  it("keeps TikTok chunks within the documented minimum size", () => {
    expect(getTikTokChunkPlan(84_810_400)).toEqual({ chunkSize: 10_000_000, totalChunkCount: 8 });
    expect(getTikTokChunkPlan(4_194_304)).toEqual({ chunkSize: 4_194_304, totalChunkCount: 1 });
  });

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

  it("applies one centralized provider/account limiter before publishing", async () => {
    const limiter = new InMemoryProviderRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const scheduler = new PublishingScheduler([new YouTubeMockPublisher()], new InMemoryDistributedLock(), () => new Date("2026-09-02T08:00:00.000Z"), limiter);
    const video = { id: "video-rate-limit", status: "APPROVED" as const, rightsStatus: "OWNED" as const };
    const channel = { id: "channel-rate-limit", timezone: "Europe/Rome", publishingSlots: ["09:00"] };
    await expect(scheduler.publishApprovedVideo(video, channel, { title: "First", description: "" })).resolves.toMatchObject({ status: "SUCCESS" });
    await expect(scheduler.publishApprovedVideo({ ...video, id: "video-rate-limit-2" }, channel, { title: "Second", description: "" })).resolves.toMatchObject({ status: "PARTIAL_FAILURE", publications: [expect.objectContaining({ error: expect.stringContaining("RATE_LIMITED") })] });
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
      if (String(input).includes("/v2/post/publish/creator_info/query/")) return new Response(JSON.stringify({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, error: { code: "ok" } }), { status: 200 });
      if (String(input).includes("/v2/post/publish/video/init/")) return new Response(JSON.stringify({ data: { publish_id: "tiktok-publish-1", upload_url: "https://upload.test/tiktok" }, error: { code: "ok" } }), { status: 200 });
      if (String(input) === "https://upload.test/tiktok") return new Response("", { status: 201 });
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await new TikTokPublisher({ clientKey: "key", clientSecret: "secret", accessToken: "token", mode: "DIRECT_POST", apiBaseUrl: "https://api.test" }).publish({ videoId: "video-1", title: "Title", description: "Description", filePath, scheduledAt: "2099-01-01T09:00:00Z" });
      expect(result).toMatchObject({ platform: "TIKTOK", status: "SUCCESS", externalPostId: "tiktok-publish-1" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("does not require creator_info scope when validating an upload-draft account", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const publisher = new TikTokPublisher({ clientKey: "key", clientSecret: "secret", accessToken: "token", mode: "UPLOAD_DRAFT" });
    await expect(publisher.validateAccount()).resolves.toMatchObject({ ok: true, detail: "TikTok upload-draft token available" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the official Instagram Reels container, status and publish flow", async () => {
    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/ig-user-1?fields=id,username")) return new Response(JSON.stringify({ id: "ig-user-1", username: "shortfactory" }), { status: 200 });
      if (url.endsWith("/ig-user-1/media") && init?.method === "POST") return new Response(JSON.stringify({ id: "ig-container-1" }), { status: 200 });
      if (url.includes("/ig-container-1?fields=status_code,status")) return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      if (url.endsWith("/ig-user-1/media_publish")) return new Response(JSON.stringify({ id: "ig-media-1" }), { status: 200 });
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new InstagramPublisher({ accessToken: "token", instagramUserId: "ig-user-1", apiBaseUrl: "https://graph.test", apiVersion: "v23.0", statusPollIntervalMs: 0 }).publish({ videoId: "video-1", title: "Title", description: "Description", publicMediaUrl: "https://cdn.test/video.mp4", scheduledAt: "2099-01-01T09:00:00Z" });
    expect(result).toMatchObject({ platform: "INSTAGRAM", status: "SUCCESS", externalPostId: "ig-media-1" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reports missing Instagram prerequisites without making an API call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const publisher = new InstagramPublisher();
    await expect(publisher.validateAccount()).resolves.toMatchObject({ ok: false, detail: "NEEDS_CONFIGURATION" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
