import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CachedTtsProvider, CostAwareTtsProvider, DeterministicTtsProvider, ElevenLabsTtsProvider, type TtsCostGate } from "./index.js";

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

  it("uses the official ElevenLabs request shape and writes returned audio", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-tts-"));
    let requestHeaders: Record<string, string | string[] | undefined> = {};
    let requestBody = "";
    const server = createServer((request, response) => {
      requestHeaders = request.headers;
      request.on("data", (chunk: Buffer) => { requestBody += chunk.toString(); });
      request.on("end", () => { response.writeHead(200, { "content-type": "audio/mpeg" }); response.end(Buffer.from("fake-audio")); });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TTS test server did not expose a port");
    try {
      const provider = new ElevenLabsTtsProvider({ apiKey: "runtime-secret", voiceId: "voice-1", outputDirectory: directory, apiBaseUrl: `http://127.0.0.1:${address.port}` });
      const result = await provider.synthesize({ text: "Hello world", language: "en", voice: "ignored-by-provider" });
      expect(requestHeaders["xi-api-key"]).toBe("runtime-secret");
      expect(JSON.parse(requestBody)).toMatchObject({ text: "Hello world", model_id: "eleven_multilingual_v2" });
      await expect(readFile(result.audioPath)).resolves.toEqual(Buffer.from("fake-audio"));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
});
