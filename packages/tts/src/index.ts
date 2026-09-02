import { createHash } from "node:crypto";
import { ProviderError } from "@shortfactory/shared";

export interface TtsInput { text: string; language: string; voice: string; }
export interface TtsResult { provider: string; audioPath: string; duration?: number; costEur: number; }
export interface TTSProvider { estimatedCost(input: TtsInput): Promise<number>; synthesize(input: TtsInput): Promise<TtsResult>; }

export interface TtsCostGate {
  reserve(input: TtsInput, estimatedCostEur: number): Promise<string>;
  commit(reservationId: string, actualCostEur: number): Promise<void>;
  release(reservationId: string): Promise<void>;
}

export class DisabledTtsProvider implements TTSProvider {
  public async estimatedCost(input: TtsInput): Promise<number> { void input; return 0; }
  public async synthesize(input: TtsInput): Promise<TtsResult> { void input; throw new ProviderError("TTS is disabled by configuration", false); }
}

export class CachedTtsProvider implements TTSProvider {
  private readonly cache = new Map<string, TtsResult>();

  public constructor(private readonly provider: TTSProvider) {}

  public estimatedCost(input: TtsInput): Promise<number> {
    const cached = this.cache.get(ttsCacheKey(input));
    return cached ? Promise.resolve(0) : this.provider.estimatedCost(input);
  }

  public async synthesize(input: TtsInput): Promise<TtsResult> {
    const key = ttsCacheKey(input);
    const cached = this.cache.get(key);
    if (cached) return { ...cached };
    const estimatedCost = await this.provider.estimatedCost(input);
    if (estimatedCost < 0 || !Number.isFinite(estimatedCost)) throw new ProviderError("TTS returned an invalid estimated cost", false);
    const result = await this.provider.synthesize(input);
    const parsed = { ...result, costEur: Number.isFinite(result.costEur) ? result.costEur : estimatedCost };
    this.cache.set(key, parsed);
    return { ...parsed };
  }
}

export class CostAwareTtsProvider implements TTSProvider {
  public constructor(private readonly provider: TTSProvider, private readonly gate: TtsCostGate) {}

  public estimatedCost(input: TtsInput): Promise<number> { return this.provider.estimatedCost(input); }

  public async synthesize(input: TtsInput): Promise<TtsResult> {
    const estimatedCost = await this.provider.estimatedCost(input);
    const reservationId = await this.gate.reserve(input, estimatedCost);
    try {
      const result = await this.provider.synthesize(input);
      await this.gate.commit(reservationId, result.costEur);
      return result;
    } catch (error) {
      await this.gate.release(reservationId);
      throw error;
    }
  }
}

export class DeterministicTtsProvider implements TTSProvider {
  public async estimatedCost(input: TtsInput): Promise<number> { return Math.max(0.001, input.text.trim().length * 0.00002); }

  public async synthesize(input: TtsInput): Promise<TtsResult> {
    const costEur = await this.estimatedCost(input);
    return { provider: "deterministic", audioPath: `tts://${ttsCacheKey(input)}.wav`, duration: Math.max(1, input.text.trim().split(/\s+/u).length / 2.5), costEur };
  }
}

function ttsCacheKey(input: TtsInput): string {
  return createHash("sha256").update(JSON.stringify({ text: input.text, language: input.language, voice: input.voice })).digest("hex");
}
