import { describe, expect, it } from "vitest";
import { BudgetExceededError } from "@shortfactory/shared";
import { CostControlService, InMemoryCostControlLedger } from "./index.js";

const base = { scope: "GLOBAL", scopeId: "global", period: "2026-09" } as const;

describe("CostControlService", () => {
  it("hard-stops a second reservation after a one-euro budget is exhausted", async () => {
    const service = new CostControlService(new InMemoryCostControlLedger(), { monthlyBudgetEur: 1 }, () => new Date("2026-09-02T12:00:00Z"));
    await service.reserve({ ...base, idempotencyKey: "first", amount: 1, provider: "test", service: "tts", operation: "generate" });

    await expect(service.reserve({ ...base, idempotencyKey: "second", amount: 0.01, provider: "test", service: "tts", operation: "generate" })).rejects.toBeInstanceOf(BudgetExceededError);
    await expect(service.canSpend({ ...base, amount: 0.01 })).resolves.toBe(false);
  });

  it("is idempotent and releases reserved budget", async () => {
    const service = new CostControlService(new InMemoryCostControlLedger(), { monthlyBudgetEur: 1 }, () => new Date("2026-09-02T12:00:00Z"));
    const request = { ...base, idempotencyKey: "same", amount: 0.4, provider: "test", service: "llm", operation: "analysis" };
    const first = await service.reserve(request);
    const second = await service.reserve(request);
    expect(second.id).toBe(first.id);
    expect(await service.getRemainingBudget(base)).toBeCloseTo(0.6);
    await service.release(first.id);
    expect(await service.getRemainingBudget(base)).toBeCloseTo(1);
  });

  it("forecasts month-end spend and exposes threshold warnings", async () => {
    const service = new CostControlService(new InMemoryCostControlLedger(), { monthlyBudgetEur: 1 }, () => new Date("2026-09-15T12:00:00Z"));
    const reservation = await service.reserve({ ...base, idempotencyKey: "forecast", amount: 0.6, provider: "test", service: "llm", operation: "analysis" });
    await service.commit(reservation.id, 0.6, { provider: "test", service: "llm", operation: "analysis", quantity: 1, unit: "request", estimatedCostEur: 0.6 });

    const forecast = await service.getForecast(base);
    expect(forecast.forecastMonthEndEur).toBeCloseTo(1.2);
    expect(forecast.warnings).toEqual(expect.arrayContaining(["BUDGET_WARNING_50", "BUDGET_FORECAST_WARNING"]));
  });
});
