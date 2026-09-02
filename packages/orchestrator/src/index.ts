import { buildCorrelationId, type ChannelStatus } from "@shortfactory/shared";
import type { QueueClient, QueueJob } from "@shortfactory/queue";

export const pipelineQueues = [
  "discovery",
  "ingestion",
  "transcription",
  "analysis",
  "planning",
  "tts",
  "render",
  "qc",
  "review",
  "publish",
  "analytics",
  "cleanup"
] as const;

export type PipelineQueue = (typeof pipelineQueues)[number];
export type OrchestratorPriority = "LOW" | "NORMAL" | "HIGH";
export type ProcessingMode = "NORMAL" | "REDUCE";

export interface OrchestratorChannel {
  id: string;
  status?: ChannelStatus;
  videosPerDay?: number;
}

export interface DailyOrchestratorInput {
  channels: OrchestratorChannel[];
  readyByChannel: Record<string, number>;
  approvedOrScheduledByChannel?: Record<string, number>;
  now?: Date;
  correlationId?: string;
}

export interface PipelineJobPayload {
  orchestrationDate: string;
  channelId: string;
  targetCount: number;
  dailyTarget: number;
  readyCount: number;
  priority: OrchestratorPriority;
  bufferTarget: number;
}

export interface EnqueuedPipelineJob {
  queue: PipelineQueue;
  idempotencyKey: string;
  payload: PipelineJobPayload;
}

export interface DailyOrchestratorResult {
  orchestrationDate: string;
  targetVideos: number;
  readyVideos: number;
  bufferTarget: number;
  priority: OrchestratorPriority;
  processingMode: ProcessingMode;
  requiredByChannel: Record<string, number>;
  enqueued: EnqueuedPipelineJob[];
  skipped: string[];
  locked: boolean;
}

export interface DistributedLock {
  acquire(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}

export class InMemoryOrchestratorLock implements DistributedLock {
  private readonly keys = new Set<string>();

  public async acquire(key: string): Promise<boolean> {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  public async release(key: string): Promise<void> {
    this.keys.delete(key);
  }
}

export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  add(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly keys = new Set<string>();

  public async has(key: string): Promise<boolean> {
    return this.keys.has(key);
  }

  public async add(key: string): Promise<void> {
    this.keys.add(key);
  }
}

export interface DailyOrchestratorOptions {
  targetVideosPerChannel?: number;
  bufferDays?: number;
  discoveryMultiplier?: number;
  highPriorityBufferDays?: number;
  reduceProcessingBufferMultiplier?: number;
}

const defaultOptions: Required<DailyOrchestratorOptions> = {
  targetVideosPerChannel: 6,
  bufferDays: 2,
  discoveryMultiplier: 6,
  highPriorityBufferDays: 1,
  reduceProcessingBufferMultiplier: 1.5
};

export class DailyOrchestrator {
  private readonly options: Required<DailyOrchestratorOptions>;

  public constructor(
    private readonly queue: QueueClient,
    private readonly lock: DistributedLock = new InMemoryOrchestratorLock(),
    private readonly idempotency: IdempotencyStore = new InMemoryIdempotencyStore(),
    options: DailyOrchestratorOptions = {}
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  public async run(input: DailyOrchestratorInput): Promise<DailyOrchestratorResult> {
    const channels = input.channels.filter((channel) => channel.status !== "PAUSED" && channel.status !== "ARCHIVED");
    const now = input.now ?? new Date();
    const orchestrationDate = now.toISOString().slice(0, 10);
    const lockKey = `orchestrator:${orchestrationDate}`;
    const acquired = await this.lock.acquire(lockKey);
    if (!acquired) return this.emptyResult(orchestrationDate, channels, input, true);

    try {
      const targetVideos = channels.reduce((sum, channel) => sum + this.dailyTarget(channel), 0);
      const readyVideos = channels.reduce((sum, channel) => sum + Math.max(0, input.readyByChannel[channel.id] ?? 0), 0);
      const bufferTarget = targetVideos * this.options.bufferDays;
      const highPriorityThreshold = targetVideos * this.options.highPriorityBufferDays;
      const reduceThreshold = bufferTarget * this.options.reduceProcessingBufferMultiplier;
      const priority: OrchestratorPriority = readyVideos < highPriorityThreshold ? "HIGH" : readyVideos < bufferTarget ? "NORMAL" : "LOW";
      const processingMode: ProcessingMode = readyVideos > reduceThreshold ? "REDUCE" : "NORMAL";
      const requiredByChannel = this.calculateRequired(channels, input, targetVideos, bufferTarget, processingMode);
      const result: DailyOrchestratorResult = { orchestrationDate, targetVideos, readyVideos, bufferTarget, priority, processingMode, requiredByChannel, enqueued: [], skipped: [], locked: false };

      if (processingMode === "REDUCE") return result;
      for (const channel of channels) {
        const required = requiredByChannel[channel.id] ?? 0;
        if (required === 0) continue;
        await this.enqueueChannelPipeline(channel, required, orchestrationDate, priority, input, targetVideos, bufferTarget, result);
      }
      return result;
    } finally {
      await this.lock.release(lockKey);
    }
  }

  private calculateRequired(channels: OrchestratorChannel[], input: DailyOrchestratorInput, targetVideos: number, bufferTarget: number, mode: ProcessingMode): Record<string, number> {
    if (mode === "REDUCE") return Object.fromEntries(channels.map((channel) => [channel.id, 0]));
    const readyVideos = channels.reduce((sum, channel) => sum + Math.max(0, input.readyByChannel[channel.id] ?? 0), 0);
    const bufferDeficit = Math.max(0, bufferTarget - readyVideos);
    return Object.fromEntries(channels.map((channel) => {
      const dailyTarget = this.dailyTarget(channel);
      const approvedOrScheduled = Math.max(0, input.approvedOrScheduledByChannel?.[channel.id] ?? 0);
      const dailyDeficit = Math.max(0, dailyTarget - approvedOrScheduled);
      const share = targetVideos === 0 ? 0 : dailyTarget / targetVideos;
      const bufferAllocation = Math.ceil(bufferDeficit * share);
      return [channel.id, Math.max(dailyDeficit, bufferAllocation)];
    }));
  }

  private async enqueueChannelPipeline(channel: OrchestratorChannel, required: number, orchestrationDate: string, priority: OrchestratorPriority, input: DailyOrchestratorInput, targetVideos: number, bufferTarget: number, result: DailyOrchestratorResult): Promise<void> {
    const readyCount = Math.max(0, input.readyByChannel[channel.id] ?? 0);
    const dailyTarget = this.dailyTarget(channel);
    const payload: PipelineJobPayload = { orchestrationDate, channelId: channel.id, targetCount: required, dailyTarget, readyCount, priority, bufferTarget };
    for (const queue of pipelineQueues) {
      const idempotencyKey = `${orchestrationDate}:${channel.id}:${queue}`;
      if (await this.idempotency.has(idempotencyKey)) {
        result.skipped.push(idempotencyKey);
        continue;
      }
      const job: QueueJob<PipelineJobPayload> = { name: `daily-${queue}`, payload, correlationId: input.correlationId ?? buildCorrelationId(), idempotencyKey, priority: priorityNumber(priority) };
      await this.queue.enqueue(queue, job);
      await this.idempotency.add(idempotencyKey);
      result.enqueued.push({ queue, idempotencyKey, payload });
    }
  }

  private dailyTarget(channel: OrchestratorChannel): number {
    return Math.max(0, Math.floor(channel.videosPerDay ?? this.options.targetVideosPerChannel));
  }

  private emptyResult(orchestrationDate: string, channels: OrchestratorChannel[], input: DailyOrchestratorInput, locked: boolean): DailyOrchestratorResult {
    const targetVideos = channels.reduce((sum, channel) => sum + this.dailyTarget(channel), 0);
    const readyVideos = channels.reduce((sum, channel) => sum + Math.max(0, input.readyByChannel[channel.id] ?? 0), 0);
    return { orchestrationDate, targetVideos, readyVideos, bufferTarget: targetVideos * this.options.bufferDays, priority: "NORMAL", processingMode: "NORMAL", requiredByChannel: {}, enqueued: [], skipped: [], locked };
  }
}

function priorityNumber(priority: OrchestratorPriority): number {
  if (priority === "HIGH") return 1;
  if (priority === "NORMAL") return 5;
  return 10;
}
