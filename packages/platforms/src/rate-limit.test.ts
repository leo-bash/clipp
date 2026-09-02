import { describe, expect, it } from "vitest";
import { InMemoryProviderRateLimiter } from "./rate-limit.js";

describe("provider rate limiter", () => {
  it("coordinates limits per provider/account and honors a window reset", async () => {
    let now = 1_000;
    const limiter = new InMemoryProviderRateLimiter({ maxRequests: 2, windowMs: 1_000 }, () => now);

    await expect(limiter.consume("YOUTUBE", "account-a")).resolves.toMatchObject({ allowed: true, remaining: 1 });
    await expect(limiter.consume("YOUTUBE", "account-a")).resolves.toMatchObject({ allowed: true, remaining: 0 });
    await expect(limiter.consume("YOUTUBE", "account-a")).resolves.toMatchObject({ allowed: false, retryAfterMs: 1_000 });
    await expect(limiter.consume("TIKTOK", "account-a")).resolves.toMatchObject({ allowed: true });
    now = 2_001;
    await expect(limiter.consume("YOUTUBE", "account-a")).resolves.toMatchObject({ allowed: true, remaining: 1 });
  });
});
