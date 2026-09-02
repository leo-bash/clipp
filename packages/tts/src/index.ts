import { ProviderError } from "@shortfactory/shared";

export interface TtsInput { text: string; language: string; voice: string; }
export interface TtsResult { provider: string; audioPath: string; duration?: number; costEur: number; }
export interface TTSProvider { synthesize(input: TtsInput): Promise<TtsResult>; }

export class DisabledTtsProvider implements TTSProvider {
  public async synthesize(input: TtsInput): Promise<TtsResult> { void input; throw new ProviderError("TTS is disabled by configuration", false); }
}
