import { describe, expect, it, vi } from "vitest";
import { CachedTranscriptionProvider, DeterministicTranscriptionProvider, type TranscriptionProvider } from "./index.js";

describe("transcription adapters", () => {
  it("caches by media hash, language and model", async () => {
    const provider: TranscriptionProvider = { transcribe: vi.fn(new DeterministicTranscriptionProvider().transcribe.bind(new DeterministicTranscriptionProvider())) };
    const cached = new CachedTranscriptionProvider(provider);
    const input = { mediaHash: "sha256:one", language: "en", model: "small", sourceText: "Cache this" };
    await cached.transcribe(input);
    await cached.transcribe(input);
    expect(provider.transcribe).toHaveBeenCalledTimes(1);
  });

  it("returns timestamped segments", async () => {
    const transcript = await new DeterministicTranscriptionProvider().transcribe({ mediaHash: "sha256:two", language: "en", model: "small", sourceText: "Explain the useful idea." });
    expect(transcript.segments[0]).toMatchObject({ start: 0, text: "Explain the useful idea." });
    expect(transcript.segments[0]?.end).toBeGreaterThan(0);
  });
});
