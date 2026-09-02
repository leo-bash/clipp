import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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

export interface ElevenLabsTtsProviderOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  outputFormat?: string;
  outputDirectory: string;
  apiBaseUrl?: string;
  costPerThousandCharactersEur?: number;
}

/** Official ElevenLabs text-to-speech REST adapter. It writes audio to an explicit local output directory. */
export class ElevenLabsTtsProvider implements TTSProvider {
  private readonly options: Required<ElevenLabsTtsProviderOptions>;

  public constructor(options: ElevenLabsTtsProviderOptions) {
    this.options = { apiKey: options.apiKey, voiceId: options.voiceId, modelId: options.modelId ?? "eleven_multilingual_v2", outputFormat: options.outputFormat ?? "mp3_44100_128", outputDirectory: options.outputDirectory, apiBaseUrl: options.apiBaseUrl ?? "https://api.elevenlabs.io", costPerThousandCharactersEur: options.costPerThousandCharactersEur ?? 0.30 };
  }

  public async estimatedCost(input: TtsInput): Promise<number> {
    if (!Number.isFinite(this.options.costPerThousandCharactersEur) || this.options.costPerThousandCharactersEur < 0) throw new ProviderError("TTS cost configuration is invalid", false);
    return Math.max(0.001, (input.text.trim().length / 1000) * this.options.costPerThousandCharactersEur);
  }

  public async synthesize(input: TtsInput): Promise<TtsResult> {
    if (!this.options.apiKey || !this.options.voiceId) throw new ProviderError("ElevenLabs requires TTS_API_KEY and TTS_VOICE_ID", false);
    const key = ttsCacheKey({ ...input, voice: this.options.voiceId });
    const extension = this.options.outputFormat.split("_")[0] || "mp3";
    const audioPath = path.join(this.options.outputDirectory, `${key}.${extension}`);
    await mkdir(this.options.outputDirectory, { recursive: true });
    const requestBody: Record<string, string> = { text: input.text, model_id: this.options.modelId };
    if (this.options.modelId !== "eleven_multilingual_v2") requestBody.language_code = input.language;
    const response = await fetch(`${this.options.apiBaseUrl}/v1/text-to-speech/${encodeURIComponent(this.options.voiceId)}?output_format=${encodeURIComponent(this.options.outputFormat)}`, { method: "POST", headers: { "xi-api-key": this.options.apiKey, "content-type": "application/json" }, body: JSON.stringify(requestBody) });
    if (!response.ok) throw new ProviderError(`ElevenLabs TTS request failed (${response.status})`, response.status === 429 || response.status >= 500);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) throw new ProviderError("ElevenLabs returned an empty audio response", false);
    await writeFile(audioPath, bytes, { flag: "wx" }).catch(async (error: unknown) => { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; });
    return { provider: "elevenlabs", audioPath, costEur: await this.estimatedCost(input) };
  }
}

function ttsCacheKey(input: TtsInput): string {
  return createHash("sha256").update(JSON.stringify({ text: input.text, language: input.language, voice: input.voice })).digest("hex");
}
