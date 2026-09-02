import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { ServiceMode } from "@shortfactory/shared";

export interface QueueJob<TPayload> {
  name: string;
  payload: TPayload;
  correlationId: string;
  idempotencyKey?: string;
  priority?: number;
}

export interface DeadLetterJob {
  originalQueue: string;
  job: QueueJob<unknown>;
  error: string;
  failedAt: string;
}

export interface QueueClient {
  readonly mode: ServiceMode;
  ping(): Promise<void>;
  enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void>;
  getJobs?(): Array<QueueJob<unknown>>;
  enqueueDeadLetter?(deadLetter: DeadLetterJob): Promise<void>;
  getDeadLetters?(): Array<DeadLetterJob>;
  close(): Promise<void>;
}

class MockQueue implements QueueClient {
  public readonly mode = "mock" as const;
  private readonly jobs: Array<QueueJob<unknown>> = [];
  private readonly deadLetters: DeadLetterJob[] = [];

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void> {
    this.jobs.push({ ...job, name: `${queueName}:${job.name}` });
  }

  public getJobs(): Array<QueueJob<unknown>> {
    return [...this.jobs];
  }

  public async enqueueDeadLetter(deadLetter: DeadLetterJob): Promise<void> {
    this.deadLetters.push(deadLetter);
  }

  public getDeadLetters(): Array<DeadLetterJob> {
    return [...this.deadLetters];
  }

  public async close(): Promise<void> {
    this.jobs.length = 0;
  }
}

class RedisQueue implements QueueClient {
  public readonly mode = "redis" as const;
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();
  private readonly deadLetterQueues = new Map<string, Queue>();

  public constructor(url: string) {
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }

  public async ping(): Promise<void> {
    await this.connection.connect();
    await this.connection.ping();
  }

  public async enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void> {
    const queue = this.queues.get(queueName) ?? new Queue(queueName, { connection: this.connection });
    this.queues.set(queueName, queue);
    await queue.add(job.name, job.payload, {
      jobId: job.idempotencyKey ?? `${job.name}:${job.correlationId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      ...(job.priority === undefined ? {} : { priority: job.priority }),
      removeOnComplete: 100,
      removeOnFail: 100
    });
  }

  public async enqueueDeadLetter(deadLetter: DeadLetterJob): Promise<void> {
    const queueName = `${deadLetter.originalQueue}.dead-letter`;
    const queue = this.deadLetterQueues.get(queueName) ?? new Queue(queueName, { connection: this.connection });
    this.deadLetterQueues.set(queueName, queue);
    await queue.add(deadLetter.job.name, { ...deadLetter, failedAt: deadLetter.failedAt }, { jobId: `dlq:${deadLetter.job.idempotencyKey ?? deadLetter.job.correlationId}`, removeOnComplete: false, removeOnFail: false });
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values(), ...this.deadLetterQueues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }
}

export function createQueue(mode: "mock" | "redis", url: string): QueueClient {
  return mode === "redis" ? new RedisQueue(url) : new MockQueue();
}
