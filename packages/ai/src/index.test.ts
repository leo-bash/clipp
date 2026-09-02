import { describe, expect, it } from "vitest";
import { AiPipeline, DeterministicAnalysisProvider, DeterministicContentPlanner, InMemoryAiCostMeter, ValidatedAnalysisProvider } from "./index.js";
import { CachedTranscriptionProvider, DeterministicTranscriptionProvider } from "@shortfactory/transcription";

describe("AI pipeline", () => {
  it("runs candidate through transcript, analysis and content plan", async () => {
    const meter = new InMemoryAiCostMeter();
    const result = await new AiPipeline(new CachedTranscriptionProvider(new DeterministicTranscriptionProvider()), new DeterministicAnalysisProvider(), new DeterministicContentPlanner(), meter).run({ candidateId: "candidate-1", mediaHash: "sha256:one", language: "en", transcriptionModel: "small", sourceText: "Three keyboard shortcuts save time.", metadata: { source: "manual" }, channelConfig: { type: "TUTORIAL", minDuration: 18, maxDuration: 45 }, performanceContext: { historicalFormatPerformance: 0.7 } });
    expect(result.transcript.segments.length).toBeGreaterThan(0);
    expect(result.analysis.riskFlags).toEqual([]);
    expect(result.contentPlan.editPlan.captions).toBe(true);
    expect(meter.measurements.map((measurement) => measurement.operation)).toEqual(["transcribe", "analysis", "planning"]);
  });

  it("retries invalid external output only within the configured limit", async () => {
    let calls = 0;
    const provider = new ValidatedAnalysisProvider(async () => { calls += 1; return calls === 2 ? { summary: "ok", topics: ["topic"], hookCandidates: ["hook"], bestSegments: [{ start: 0, end: 1, reason: "opening" }], viralityScore: 50, clarityScore: 50, noveltyScore: 50, recommendedFormat: "short", riskFlags: [], costEur: 0 } : { invalid: true }; }, 1);
    const transcript = await new CachedTranscriptionProvider(new DeterministicTranscriptionProvider()).transcribe({ mediaHash: "sha256:two", language: "en", model: "small" });
    await expect(provider.analyze({ candidateId: "candidate-2", metadata: {}, transcript, channelConfig: {} })).resolves.toMatchObject({ summary: "ok" });
    expect(calls).toBe(2);
  });
});
