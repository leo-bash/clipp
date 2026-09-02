import { z } from "zod";
import { transcriptSchema, type Transcript, type TranscriptionInput, type TranscriptionProvider } from "@shortfactory/transcription";

const bestSegmentSchema = z.object({ start: z.number().finite().nonnegative(), end: z.number().finite().positive(), reason: z.string().trim().min(1) }).refine((segment) => segment.end > segment.start, "best segment end must be after start");
export const analysisSchema = z.object({
  summary: z.string(),
  topics: z.array(z.string().trim().min(1)),
  hookCandidates: z.array(z.string().trim().min(1)),
  bestSegments: z.array(bestSegmentSchema),
  viralityScore: z.number().finite().min(0).max(100),
  clarityScore: z.number().finite().min(0).max(100),
  noveltyScore: z.number().finite().min(0).max(100),
  recommendedFormat: z.string().trim().min(1),
  riskFlags: z.array(z.string()),
  costEur: z.number().finite().nonnegative(),
});

const voiceoverSegmentSchema = z.object({ type: z.literal("voiceover"), start: z.number().finite().nonnegative(), end: z.number().finite().positive(), text: z.string().trim().min(1) }).refine((segment) => segment.end > segment.start, "voiceover end must be after start");
const sourceClipSegmentSchema = z.object({ type: z.literal("source_clip"), sourceStart: z.number().finite().nonnegative(), sourceEnd: z.number().finite().positive() }).refine((segment) => segment.sourceEnd > segment.sourceStart, "source clip end must be after start");
export const editPlanSchema = z.object({ duration: z.number().finite().positive(), segments: z.array(z.union([voiceoverSegmentSchema, sourceClipSegmentSchema])), captions: z.boolean() });
export const contentPlanSchema = z.object({
  candidateId: z.string().trim().min(1),
  hook: z.string().trim().min(1),
  script: z.string().trim().min(1),
  editPlan: editPlanSchema,
  targetDuration: z.number().int().positive(),
  title: z.string().trim().min(1),
  description: z.string(),
  hashtags: z.array(z.string().trim().min(1)),
  voiceoverRequired: z.boolean(),
  costEur: z.number().finite().nonnegative(),
});

export type CandidateAnalysis = z.infer<typeof analysisSchema>;
export type ContentPlan = z.infer<typeof contentPlanSchema>;

export interface AnalysisInput { candidateId: string; metadata: Record<string, unknown>; transcript: Transcript; channelConfig: Record<string, unknown>; performanceContext?: Record<string, unknown>; }
export interface ContentPlanInput { candidateId: string; channelType: string; analysis: CandidateAnalysis; transcript: Transcript; minDuration: number; maxDuration: number; }
export interface AnalysisProvider { analyze(input: AnalysisInput): Promise<CandidateAnalysis>; }
export interface ContentPlanner { plan(input: ContentPlanInput): Promise<ContentPlan>; }

export interface AiCostMeasurement { idempotencyKey: string; provider: string; service: "transcription" | "llm" | "tts"; operation: string; estimatedCostEur: number; actualCostEur: number; quantity: number; unit: string; candidateId?: string; }
export interface AiCostMeter { measure(cost: AiCostMeasurement): Promise<void>; }

export type AiTask = "transcription" | "analysis" | "planning" | "tts";
export interface ModelRoute { task: AiTask; model: string; reason: "budget" | "quality" | "deterministic"; }

export class ModelRouter {
  public constructor(private readonly options: { preferredModel?: string; lowCostModel?: string; paidApisDisabled?: boolean } = {}) {}

  public route(task: AiTask, remainingBudgetEur: number): ModelRoute {
    if (this.options.paidApisDisabled || remainingBudgetEur <= 0) return { task, model: "deterministic", reason: "deterministic" };
    if (remainingBudgetEur < 1) return { task, model: this.options.lowCostModel ?? "low-cost", reason: "budget" };
    return { task, model: this.options.preferredModel ?? "quality", reason: "quality" };
  }
}

export class InMemoryAiCostMeter implements AiCostMeter {
  public readonly measurements: AiCostMeasurement[] = [];
  public async measure(cost: AiCostMeasurement): Promise<void> { this.measurements.push(cost); }
}

export class DeterministicAnalysisProvider implements AnalysisProvider {
  public async analyze(input: AnalysisInput): Promise<CandidateAnalysis> {
    const summary = input.transcript.fullText.slice(0, 180);
    return analysisSchema.parse({ summary, topics: ["practical idea"], hookCandidates: [`The useful idea hidden in ${input.candidateId}`], bestSegments: [{ start: 0, end: input.transcript.segments[0]?.end ?? 1, reason: "opening timestamped segment" }], viralityScore: 72, clarityScore: 88, noveltyScore: 64, recommendedFormat: "vertical_explainer", riskFlags: [], costEur: 0.02 });
  }
}

export class DeterministicContentPlanner implements ContentPlanner {
  public async plan(input: ContentPlanInput): Promise<ContentPlan> {
    const targetDuration = Math.max(input.minDuration, Math.min(input.maxDuration, Math.round(input.analysis.bestSegments[0]?.end ?? input.minDuration)));
    const hook = input.analysis.hookCandidates[0] ?? "Here is the practical idea in one minute.";
    return contentPlanSchema.parse({ candidateId: input.candidateId, hook, script: `${hook} ${input.transcript.fullText}`, editPlan: { duration: targetDuration, segments: [{ type: "voiceover", start: 0, end: targetDuration, text: input.transcript.fullText }], captions: true }, targetDuration, title: hook, description: input.analysis.summary, hashtags: ["#shorts", "#howto"], voiceoverRequired: true, costEur: 0.02 });
  }
}

export class ValidatedAnalysisProvider implements AnalysisProvider {
  public constructor(private readonly generate: (input: AnalysisInput) => Promise<unknown>, private readonly maxRetries = 2) {}
  public async analyze(input: AnalysisInput): Promise<CandidateAnalysis> { return parseWithRetries(() => this.generate(input), analysisSchema, this.maxRetries, "analysis"); }
}

export class ValidatedContentPlanner implements ContentPlanner {
  public constructor(private readonly generate: (input: ContentPlanInput) => Promise<unknown>, private readonly maxRetries = 2) {}
  public async plan(input: ContentPlanInput): Promise<ContentPlan> { return parseWithRetries(() => this.generate(input), contentPlanSchema, this.maxRetries, "content plan"); }
}

export interface AiPipelineInput {
  candidateId: string;
  mediaHash: string;
  language: string;
  transcriptionModel: string;
  sourceText?: string;
  metadata: Record<string, unknown>;
  channelConfig: { type: string; minDuration: number; maxDuration: number; [key: string]: unknown };
  performanceContext?: Record<string, unknown>;
}
export interface AiPipelineResult { transcript: Transcript; analysis: CandidateAnalysis; contentPlan: ContentPlan; }

export class AiPipeline {
  public constructor(private readonly transcriber: TranscriptionProvider, private readonly analyzer: AnalysisProvider, private readonly planner: ContentPlanner, private readonly costMeter: AiCostMeter = new InMemoryAiCostMeter()) {}

  public async run(input: AiPipelineInput): Promise<AiPipelineResult> {
    const transcriptionInput: TranscriptionInput = { mediaHash: input.mediaHash, language: input.language, model: input.transcriptionModel, sourceText: input.sourceText };
    const transcript = transcriptSchema.parse(await this.transcriber.transcribe(transcriptionInput));
    await this.measure(input.candidateId, transcript.provider, "transcription", "transcribe", transcript.costEur);
    const analysis = analysisSchema.parse(await this.analyzer.analyze({ candidateId: input.candidateId, metadata: input.metadata, transcript, channelConfig: input.channelConfig, performanceContext: input.performanceContext }));
    await this.measure(input.candidateId, "llm", "llm", "analysis", analysis.costEur);
    const contentPlan = contentPlanSchema.parse(await this.planner.plan({ candidateId: input.candidateId, channelType: input.channelConfig.type, analysis, transcript, minDuration: input.channelConfig.minDuration, maxDuration: input.channelConfig.maxDuration }));
    await this.measure(input.candidateId, "llm", "llm", "planning", contentPlan.costEur);
    return { transcript, analysis, contentPlan };
  }

  private async measure(candidateId: string, provider: string, service: AiCostMeasurement["service"], operation: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    await this.costMeter.measure({ idempotencyKey: `${candidateId}:${service}:${operation}`, provider, service, operation, estimatedCostEur: amount, actualCostEur: amount, quantity: 1, unit: "request", candidateId });
  }
}

async function parseWithRetries<T>(generate: () => Promise<unknown>, schema: z.ZodType<T>, maxRetries: number, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= Math.max(0, maxRetries); attempt += 1) {
    try { return schema.parse(await generate()); } catch (error) { lastError = error; }
  }
  throw new Error(`${label} output failed Zod validation after ${Math.max(0, maxRetries) + 1} attempts: ${lastError instanceof Error ? lastError.message : "invalid output"}`);
}
