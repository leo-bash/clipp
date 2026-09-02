import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { ServiceMode } from "@shortfactory/shared";

export interface QueueJob<TPayload> {
  name: string;
  payload: TPayload;
  correlationId: string;
}

export interface QueueClient {
  readonly mode: ServiceMode;
  ping(): Promise<void>;
  enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void>;
  close(): Promise<void>;
}

class MockQueue implements QueueClient {
  public readonly mode = "mock" as const;
  private readonly jobs: Array<QueueJob<unknown>> = [];

  public async ping(): Promise<void> {
    return Promise.resolve();
  }

  public async enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void> {
    this.jobs.push({ ...job, name: `${queueName}:${job.name}` });
  }

  public async close(): Promise<void> {
    this.jobs.length = 0;
  }
}

class RedisQueue implements QueueClient {
  public readonly mode = "redis" as const;
  private readonly connection: IORedis;
  private readonly queues = new Map<string, Queue>();

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
      jobId: `${job.name}:${job.correlationId}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 100
    });
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    await this.connection.quit();
  }
}

export function createQueue(mode: "mock" | "redis", url: string): QueueClient {
  return mode === "redis" ? new RedisQueue(url) : new MockQueue();
}
