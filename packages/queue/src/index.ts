import { Queue, UnrecoverableError, Worker } from "bullmq";
import IORedis from "ioredis";
import { AppError, type ServiceMode } from "@shortfactory/shared";

export interface QueueJob<TPayload> {
  name: string;
  payload: TPayload;
  correlationId: string;
  idempotencyKey?: string;
  priority?: number;
  jobId?: string;
  attempt?: number;
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

export type QueueProcessor = (job: QueueJob<unknown>) => Promise<void>;
export interface QueueWorkerHandle { close(): Promise<void>; }

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
    await queue.add(job.name, job, {
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

class MockQueueWorker implements QueueWorkerHandle {
  public async close(): Promise<void> { return Promise.resolve(); }
}

class RedisQueueWorker implements QueueWorkerHandle {
  public constructor(private readonly worker: Worker, private readonly deadLetterQueue: Queue) {}
  public async close(): Promise<void> { await this.worker.close(); await this.deadLetterQueue.close(); }
}

export function createQueueWorker(mode: "mock" | "redis", url: string, queueName: string, processor: QueueProcessor, options: { concurrency?: number } = {}): QueueWorkerHandle {
  if (mode === "mock") return new MockQueueWorker();
  const connection = new IORedis(url, { maxRetriesPerRequest: null });
  const deadLetterQueue = new Queue(`${queueName}.dead-letter`, { connection });
  const worker = new Worker(queueName, async (job) => {
    const payload = job.data as QueueJob<unknown>;
    try {
    await processor({ ...payload, name: payload.name ?? job.name, jobId: job.id ?? undefined, attempt: job.attemptsMade + 1 });
    } catch (error) {
      if (error instanceof AppError && !error.retryable) throw new UnrecoverableError(error.message);
      throw error;
    }
  }, { connection, concurrency: options.concurrency ?? 1 });
  worker.on("failed", (job, error) => {
    const permanent = error instanceof UnrecoverableError || error?.name === "UnrecoverableError";
    if (!job || (!permanent && job.attemptsMade < 3)) return;
    void deadLetterQueue.add("dead-letter", { originalQueue: queueName, job: job.data, error: error instanceof Error ? error.message : "job failed", failedAt: new Date().toISOString() }, { jobId: `dlq:${queueName}:${job.id ?? job.name}`, removeOnComplete: false, removeOnFail: false });
  });
  worker.on("error", () => undefined);
  return new RedisQueueWorker(worker, deadLetterQueue);
}

export function createQueue(mode: "mock" | "redis", url: string): QueueClient {
  return mode === "redis" ? new RedisQueue(url) : new MockQueue();
}
