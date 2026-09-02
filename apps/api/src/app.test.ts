import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "@shortfactory/config";
import { LocalStorageProvider } from "@shortfactory/storage";
import { buildApp } from "./app.js";

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("api foundation", () => {
  it("reports liveness", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const response = await app.server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "api" });
  });

  it("returns request correlation headers and Prometheus-compatible metrics", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const response = await app.server.inject({ method: "GET", url: "/metrics", headers: { "x-correlation-id": "test-correlation" } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-correlation-id"]).toBe("test-correlation");
    expect(response.headers["x-request-id"]).toBeDefined();
    expect(response.body).toContain("shortfactory_http_requests_total");
  });

  it("enforces configured API-key RBAC while keeping health endpoints public", async () => {
    const app = await buildApp(loadConfig({ AUTH_MODE: "api-key", ADMIN_API_KEY: "admin-key-123456789", VIEWER_API_KEY: "viewer-key-123456789" }));
    apps.push(app);
    const health = await app.server.inject({ method: "GET", url: "/health" });
    const unauthenticated = await app.server.inject({ method: "GET", url: "/api/v1/channels" });
    const authenticated = await app.server.inject({ method: "GET", url: "/api/v1/channels", headers: { "x-api-key": "admin-key-123456789" } });
    const viewerMutation = await app.server.inject({ method: "POST", url: "/api/v1/channels", headers: { "x-api-key": "viewer-key-123456789" }, payload: {} });

    expect(health.statusCode).toBe(200);
    expect(unauthenticated.statusCode).toBe(401);
    expect(authenticated.statusCode).toBe(200);
    expect(viewerMutation.statusCode).toBe(403);
  });

  it("reports explicit degraded local adapters without claiming real dependencies", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const response = await app.server.inject({ method: "GET", url: "/ready" });
    const body = response.json<{ status: string; dependencies: Array<{ mode: string; status: string }> }>();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: "memory", status: "degraded" }),
      expect.objectContaining({ mode: "mock", status: "degraded" }),
      expect.objectContaining({ name: "workers", status: "degraded" }),
      expect.objectContaining({ name: "budget", status: "ok" })
    ]));
  });

  it("serves seeded channels and validates CRUD input", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const channels = await app.server.inject({ method: "GET", url: "/api/v1/channels" });
    const invalid = await app.server.inject({ method: "POST", url: "/api/v1/channels", payload: { name: "missing fields" } });

    expect(channels.statusCode).toBe(200);
    expect(channels.json<{ total: number }>().total).toBe(3);
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<{ error: string }>().error).toBe("VALIDATION_ERROR");
  });

  it("exposes operational records for accounts, assets, transcripts, plans and job audit", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const channels = await app.server.inject({ method: "GET", url: "/api/v1/channels?pageSize=1" });
    const sources = await app.server.inject({ method: "GET", url: "/api/v1/sources?pageSize=1" });
    const candidates = await app.server.inject({ method: "GET", url: "/api/v1/candidates?pageSize=1" });
    const channelId = channels.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    const sourceId = sources.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    const candidateId = candidates.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    if (!channelId || !sourceId || !candidateId) throw new Error("seed records missing");

    const account = await app.server.inject({ method: "POST", url: "/api/v1/platform-accounts", payload: { channelId, platform: "YOUTUBE", externalAccountId: "youtube-test-account", displayName: "Test channel" } });
    const accountId = account.json<{ id: string }>().id;
    const accountUpdate = await app.server.inject({ method: "PATCH", url: `/api/v1/platform-accounts/${accountId}`, payload: { status: "CONNECTED" } });
    const asset = await app.server.inject({ method: "POST", url: "/api/v1/source-assets", payload: { sourceId, externalId: "asset-1", sourceUrl: "https://example.com/asset-1", title: "Test asset", rightsStatus: "OWNED" } });
    const assetId = asset.json<{ id: string }>().id;
    const transcript = await app.server.inject({ method: "POST", url: "/api/v1/transcripts", payload: { sourceAssetId: assetId, provider: "deterministic", language: "en", text: "Test transcript", segments: [{ start: 0, end: 1, text: "Test transcript" }] } });
    const plan = await app.server.inject({ method: "POST", url: "/api/v1/content-plans", payload: { candidateId, channelId, hook: "Test hook", script: "Test script", title: "Test title", description: "Test description", editPlan: { duration: 1 }, targetDuration: 1 } });
    const audit = await app.server.inject({ method: "POST", url: "/api/v1/jobs-audit", payload: { queue: "render", jobId: "job-1", type: "render-video", status: "COMPLETED", entityId: candidateId } });

    expect(account.statusCode).toBe(200);
    expect(accountUpdate.json<{ status: string }>().status).toBe("CONNECTED");
    expect(asset.statusCode).toBe(200);
    expect(transcript.statusCode).toBe(200);
    expect(plan.statusCode).toBe(200);
    expect(audit.statusCode).toBe(200);
    await expect(app.server.inject({ method: "GET", url: "/api/v1/platform-accounts" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.server.inject({ method: "GET", url: "/api/v1/source-assets" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.server.inject({ method: "GET", url: "/api/v1/transcripts" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.server.inject({ method: "GET", url: "/api/v1/content-plans" })).resolves.toMatchObject({ statusCode: 200 });
    await expect(app.server.inject({ method: "GET", url: "/api/v1/jobs-audit" })).resolves.toMatchObject({ statusCode: 200 });
  });

  it("enforces the cost-control gate through the API", async () => {
    const app = await buildApp(loadConfig({ MONTHLY_BUDGET_EUR: "1" }));
    apps.push(app);
    const payload = { scope: "GLOBAL", scopeId: "global", period: "2026-09", idempotencyKey: "api-reservation", amount: 1, provider: "test", service: "tts", operation: "generate" };
    const first = await app.server.inject({ method: "POST", url: "/api/v1/cost-control/reserve", payload });
    const second = await app.server.inject({ method: "POST", url: "/api/v1/cost-control/reserve", payload: { ...payload, idempotencyKey: "api-reservation-2", amount: 0.01 } });
    const forecast = await app.server.inject({ method: "GET", url: "/api/v1/costs/forecast?period=2026-09" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.json<{ error: string }>().error).toBe("BUDGET_EXCEEDED");
    expect(forecast.statusCode).toBe(200);
  });

  it("automatically stops paid API reservations when the month-end forecast exceeds the budget", async () => {
    const app = await buildApp(loadConfig({ MONTHLY_BUDGET_EUR: "50" }));
    apps.push(app);
    const reservation = await app.server.inject({ method: "POST", url: "/api/v1/cost-control/reserve", payload: { scope: "GLOBAL", scopeId: "global", period: "2026-09", idempotencyKey: "forecast-auto-stop", amount: 10, provider: "test", service: "llm", operation: "analysis" } });
    const reservationId = reservation.json<{ id: string }>().id;
    await app.server.inject({ method: "POST", url: `/api/v1/cost-control/${reservationId}/commit`, payload: { actualAmount: 10, provider: "test", service: "llm", operation: "analysis", quantity: 1, unit: "request", estimatedCostEur: 10 } });
    const forecast = await app.server.inject({ method: "GET", url: "/api/v1/costs/forecast?period=2026-09" });
    const blocked = await app.server.inject({ method: "POST", url: "/api/v1/cost-control/reserve", payload: { scope: "GLOBAL", scopeId: "global", period: "2026-09", idempotencyKey: "forecast-auto-stop-next", amount: 0.01, provider: "test", service: "tts", operation: "generate" } });

    expect(forecast.json<{ warnings: string[] }>().warnings).toContain("PAID_APIS_AUTO_STOPPED");
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json<{ error: string }>().error).toBe("PAID_APIS_STOPPED");
  });

  it("blocks forbidden media before render and prevents unknown media from auto-publishing", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const channels = await app.server.inject({ method: "GET", url: "/api/v1/channels?pageSize=1" });
    const channelId = channels.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    if (!channelId) throw new Error("seed channel missing");
    const blocked = await app.server.inject({ method: "POST", url: "/api/v1/videos", payload: { channelId, rightsStatus: "BLOCKED" } });
    const unknown = await app.server.inject({ method: "POST", url: "/api/v1/videos", payload: { channelId, rightsStatus: "UNKNOWN" } });
    const videoId = unknown.json<{ id: string }>().id;
    const publication = await app.server.inject({ method: "POST", url: "/api/v1/publications", payload: { videoId, platform: "YOUTUBE" } });

    expect(blocked.statusCode).toBe(400);
    expect(blocked.json<{ error: string }>().error).toBe("RIGHTS_BLOCKED");
    expect(unknown.statusCode).toBe(200);
    expect(publication.statusCode).toBe(400);
    expect(publication.json<{ error: string }>().error).toBe("RIGHTS_REVIEW_REQUIRED");
  });

  it("lets an operator edit metadata, rerender and approve a review item", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const channels = await app.server.inject({ method: "GET", url: "/api/v1/channels?pageSize=1" });
    const channelId = channels.json<{ items: Array<{ id: string }> }>().items[0]?.id;
    if (!channelId) throw new Error("seed channel missing");
    const created = await app.server.inject({ method: "POST", url: "/api/v1/videos", payload: { channelId, rightsStatus: "OWNED", metadata: { title: "Draft" }, experiment: { formatId: "tutorial-v1", hookType: "DIRECT_VALUE", captionStyle: "clean", durationBucket: "18-30", topic: "metadata" } } });
    const videoId = created.json<{ id: string }>().id;
    expect(created.json<{ experiment: { formatId: string; hookType: string } }>()).toMatchObject({ experiment: { formatId: "tutorial-v1", hookType: "DIRECT_VALUE" } });
    const edited = await app.server.inject({ method: "PATCH", url: `/api/v1/videos/${videoId}`, payload: { metadata: { title: "Edited" } } });
    const rerendered = await app.server.inject({ method: "POST", url: `/api/v1/videos/${videoId}/rerender` });
    const approved = await app.server.inject({ method: "POST", url: `/api/v1/videos/${videoId}/approve` });
    const scheduled = await app.server.inject({ method: "POST", url: "/api/v1/publications", payload: { videoId, platform: "YOUTUBE" } });

    expect(edited.statusCode).toBe(200);
    expect(edited.json<{ metadata: Record<string, string> }>().metadata.title).toBe("Edited");
    expect(rerendered.json<{ status: string; renderVersion: number }>()).toMatchObject({ status: "RENDERING", renderVersion: 2 });
    expect(approved.json<{ status: string }>().status).toBe("APPROVED");
    expect(scheduled.statusCode).toBe(200);
  });

  it("runs the one-click test pipeline and serves its stored preview", async () => {
    const storageRoot = await mkdtemp(path.join(os.tmpdir(), "shortfactory-api-test-storage-"));
    try {
      const app = await buildApp(loadConfig({}), { storage: new LocalStorageProvider(storageRoot) });
      apps.push(app);
      const candidates = await app.server.inject({ method: "GET", url: "/api/v1/candidates?pageSize=1" });
      const candidateId = candidates.json<{ items: Array<{ id: string }> }>().items[0]?.id;
      if (!candidateId) throw new Error("seed candidate missing");
      const pipeline = await app.server.inject({ method: "POST", url: "/api/v1/pipeline/test", payload: { candidateId } });
      const result = pipeline.json<{ video: { status: string; storageKey?: string; thumbnailKey?: string }; previewUrl?: string }>();
      const preview = result.previewUrl ? await app.server.inject({ method: "GET", url: `/api/v1${result.previewUrl}` }) : undefined;

      expect(pipeline.statusCode).toBe(200);
      expect(result.video).toMatchObject({ status: "READY_FOR_REVIEW" });
      expect(result.video.storageKey).toBeDefined();
      expect(result.video.thumbnailKey).toBeDefined();
      expect(preview?.statusCode).toBe(200);
      expect(preview?.headers["content-type"]).toContain("video/mp4");
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });

  it("exposes an analytics overview without direct dashboard database access", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const response = await app.server.inject({ method: "GET", url: "/api/v1/analytics/overview" });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ snapshotCount: number; totals: { views: number } }>()).toMatchObject({ snapshotCount: 0, totals: { views: 0 } });
  });
});
