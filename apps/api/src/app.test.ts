import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "@shortfactory/config";
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

  it("reports explicit degraded local adapters without claiming real dependencies", async () => {
    const app = await buildApp(loadConfig({}));
    apps.push(app);
    const response = await app.server.inject({ method: "GET", url: "/ready" });
    const body = response.json<{ status: string; dependencies: Array<{ mode: string; status: string }> }>();

    expect(response.statusCode).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ mode: "memory", status: "degraded" }),
      expect.objectContaining({ mode: "mock", status: "degraded" })
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
});
