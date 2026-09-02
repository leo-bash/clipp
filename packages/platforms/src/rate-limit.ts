import IORedis from "ioredis";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface ProviderRateLimiter {
  consume(provider: string, accountId: string): Promise<RateLimitDecision>;
  close?(): Promise<void>;
}

export interface ProviderRateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export class InMemoryProviderRateLimiter implements ProviderRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  public constructor(private readonly options: ProviderRateLimitOptions, private readonly clock: () => number = () => Date.now()) {}

  public async consume(provider: string, accountId: string): Promise<RateLimitDecision> {
    const key = `${provider}:${accountId}`;
    const now = this.clock();
    const current = this.buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + this.options.windowMs } : current;
    if (bucket.count >= this.options.maxRequests) return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, bucket.resetAt - now) };
    bucket.count += 1;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: Math.max(0, this.options.maxRequests - bucket.count), retryAfterMs: Math.max(1, bucket.resetAt - now) };
  }
}

export class RedisProviderRateLimiter implements ProviderRateLimiter {
  private readonly connection: IORedis;

  public constructor(private readonly url: string, private readonly options: ProviderRateLimitOptions) {
    this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  }

  public async consume(provider: string, accountId: string): Promise<RateLimitDecision> {
    if (this.connection.status !== "ready") await this.connection.connect();
    const result = await this.connection.eval(
      "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end; local ttl = redis.call('PTTL', KEYS[1]); if count > tonumber(ARGV[2]) then return {0, 0, ttl} end; return {1, tonumber(ARGV[2]) - count, ttl}",
      1,
      `shortfactory:provider-rate:${provider}:${accountId}`,
      String(this.options.windowMs),
      String(this.options.maxRequests)
    ) as [number, number, number];
    return { allowed: result[0] === 1, remaining: result[1] ?? 0, retryAfterMs: Math.max(1, result[2] ?? this.options.windowMs) };
  }

  public async close(): Promise<void> {
    await this.connection.quit();
  }
}
