import { describe, expect, it } from "vitest";
import { loadConfig } from "./index.js";

describe("loadConfig", () => {
  it("uses explicit local adapters by default", () => {
    const config = loadConfig({});

    expect(config.DATABASE_MODE).toBe("memory");
    expect(config.QUEUE_MODE).toBe("mock");
    expect(config.MONTHLY_BUDGET_EUR).toBe(50);
  });

  it("coerces ports and budgets while validating URLs", () => {
    const config = loadConfig({ API_PORT: "4100", MONTHLY_BUDGET_EUR: "1.5", DATABASE_URL: "postgresql://db/app", REDIS_URL: "redis://cache" });

    expect(config.API_PORT).toBe(4100);
    expect(config.MONTHLY_BUDGET_EUR).toBe(1.5);
  });
});
