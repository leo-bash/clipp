import { describe, expect, it, vi } from "vitest";
import { CachedTtsProvider, CostAwareTtsProvider, DeterministicTtsProvider, type TtsCostGate } from "./index.js";

describe("TTS safety and caching", () => {
  it("estimates before generating and caches by text, language, and voice", async () => {
    const provider = new DeterministicTtsProvider();
    const spy = vi.spyOn(provider, "synthesize");
    const cached = new CachedTtsProvider(provider);
    const input = { text: "hello world", language: "en", voice: "alloy" };

    expect(await cached.estimatedCost(input)).toBeGreaterThan(0);
    await cached.synthesize(input);
    await cached.synthesize(input);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(await cached.estimatedCost(input)).toBe(0);
  });

  it("reserves before synthesis and releases on failure", async () => {
    const events: string[] = [];
    const gate: TtsCostGate = { reserve: async () => { events.push("reserve"); return "r1"; }, commit: async () => { events.push("commit"); }, release: async () => { events.push("release"); } };
    const provider = new CostAwareTtsProvider(new DeterministicTtsProvider(), gate);
    await provider.synthesize({ text: "safe", language: "en", voice: "alloy" });
    expect(events).toEqual(["reserve", "commit"]);
  });
});
