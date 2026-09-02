import { z } from "zod";

export const transcriptSegmentSchema = z.object({
  start: z.number().finite().nonnegative(),
  end: z.number().finite().positive(),
  text: z.string().trim().min(1),
}).refine((segment) => segment.end > segment.start, "segment end must be after start");

export const transcriptSchema = z.object({
  mediaHash: z.string().trim().min(1),
  model: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  language: z.string().trim().min(2).max(20),
  fullText: z.string(),
  segments: z.array(transcriptSegmentSchema),
  confidence: z.number().finite().min(0).max(1).optional(),
  costEur: z.number().finite().nonnegative(),
});

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;

export interface TranscriptionInput {
  mediaHash: string;
  language: string;
  model: string;
  sourceText?: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<Transcript>;
}

export class CachedTranscriptionProvider implements TranscriptionProvider {
  private readonly cache = new Map<string, Transcript>();

  public constructor(private readonly provider: TranscriptionProvider) {}

  public async transcribe(input: TranscriptionInput): Promise<Transcript> {
    const key = `${input.mediaHash}:${input.language}:${input.model}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const result = transcriptSchema.parse(await this.provider.transcribe(input));
    this.cache.set(key, result);
    return result;
  }
}

export class DeterministicTranscriptionProvider implements TranscriptionProvider {
  public async transcribe(input: TranscriptionInput): Promise<Transcript> {
    const fullText = input.sourceText?.trim() || "A practical idea worth explaining in a short video.";
    const midpoint = Math.max(0.5, Math.min(4, fullText.length / 18));
    return transcriptSchema.parse({
      mediaHash: input.mediaHash,
      model: input.model,
      provider: "deterministic",
      language: input.language,
      fullText,
      segments: [{ start: 0, end: midpoint, text: fullText }],
      confidence: 1,
      costEur: 0.01,
    });
  }
}
