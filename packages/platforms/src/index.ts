import { randomUUID } from "node:crypto";
import { AppError, type Platform } from "@shortfactory/shared";

export interface PublishInput { videoId: string; title: string; description: string; storageKey?: string; scheduledAt: string; }
export interface AccountValidation { ok: boolean; detail?: string; }
export interface PublishResult { platform: Platform; status: "SUCCESS" | "FAILED"; externalPostId?: string; externalUrl?: string; error?: string; }
export interface PlatformStatus { externalPostId: string; status: "PROCESSING" | "PUBLISHED" | "FAILED"; }
export interface AnalyticsSnapshot { views: number; likes: number; comments: number; shares: number; watchTime?: number; }
export interface PlatformPublisher { readonly platform: Platform; validateAccount(): Promise<AccountValidation>; estimateCost(input: PublishInput): Promise<number>; publish(input: PublishInput): Promise<PublishResult>; getStatus(externalPostId: string): Promise<PlatformStatus>; getAnalytics(externalPostId: string): Promise<AnalyticsSnapshot>; }

export class MockPlatformPublisher implements PlatformPublisher {
  public readonly platform: Platform;
  private readonly failures: boolean;

  public constructor(platform: Platform, options: { failPublishes?: boolean } = {}) { this.platform = platform; this.failures = options.failPublishes ?? false; }
  public async validateAccount(): Promise<AccountValidation> { return { ok: true, detail: `${this.platform} mock account` }; }
  public async estimateCost(input: PublishInput): Promise<number> { void input; return 0; }
  public async publish(input: PublishInput): Promise<PublishResult> {
    void input;
    if (this.failures) return { platform: this.platform, status: "FAILED", error: `${this.platform} mock failure` };
    const externalPostId = `${this.platform.toLowerCase()}-${randomUUID()}`;
    return { platform: this.platform, status: "SUCCESS", externalPostId, externalUrl: `https://mock.shortfactory.local/${this.platform.toLowerCase()}/${externalPostId}` };
  }
  public async getStatus(externalPostId: string): Promise<PlatformStatus> { return { externalPostId, status: "PUBLISHED" }; }
  public async getAnalytics(externalPostId: string): Promise<AnalyticsSnapshot> { void externalPostId; return { views: 0, likes: 0, comments: 0, shares: 0 }; }
}

export class YouTubeMockPublisher extends MockPlatformPublisher { public constructor(options?: { failPublishes?: boolean }) { super("YOUTUBE", options); } }
export class TikTokMockPublisher extends MockPlatformPublisher { public constructor(options?: { failPublishes?: boolean }) { super("TIKTOK", options); } }
export class InstagramMockPublisher extends MockPlatformPublisher { public constructor(options?: { failPublishes?: boolean }) { super("INSTAGRAM", options); } }

export interface SchedulerChannel { id: string; timezone: string; publishingSlots: string[]; }
export interface SchedulableVideo { id: string; status: string; rightsStatus: string; }
export interface ScheduledPublication extends PublishResult { scheduledAt: string; }
export interface ScheduleResult { status: "SUCCESS" | "PARTIAL_FAILURE"; scheduledAt: string; publications: ScheduledPublication[]; }
export interface DistributedLock { acquire(key: string): Promise<boolean>; release(key: string): Promise<void>; }

export class InMemoryDistributedLock implements DistributedLock {
  private readonly held = new Set<string>();
  public async acquire(key: string): Promise<boolean> { if (this.held.has(key)) return false; this.held.add(key); return true; }
  public async release(key: string): Promise<void> { this.held.delete(key); }
}

export class PublishingScheduler {
  public constructor(private readonly publishers: PlatformPublisher[], private readonly lock: DistributedLock = new InMemoryDistributedLock(), private readonly clock: () => Date = () => new Date()) {}

  public async publishApprovedVideo(video: SchedulableVideo, channel: SchedulerChannel, metadata: { title: string; description: string; storageKey?: string }, scheduledAt = nextPublishingSlot(this.clock(), channel.timezone, channel.publishingSlots)): Promise<ScheduleResult> {
    if (video.status !== "APPROVED") throw new AppError("VIDEO_NOT_APPROVED", "only approved videos can be scheduled");
    if (video.rightsStatus === "BLOCKED") throw new AppError("RIGHTS_BLOCKED", "blocked videos cannot be published");
    const lockKey = `publication:${video.id}`;
    if (!await this.lock.acquire(lockKey)) throw new AppError("PUBLICATION_LOCKED", "publication is already being processed", true);
    try {
      const results = await Promise.all(this.publishers.map(async (publisher) => {
        const account = await publisher.validateAccount();
        if (!account.ok) return { platform: publisher.platform, status: "FAILED", error: account.detail ?? "account unavailable", scheduledAt } satisfies ScheduledPublication;
        return { ...await publisher.publish({ videoId: video.id, title: metadata.title, description: metadata.description, storageKey: metadata.storageKey, scheduledAt }), scheduledAt };
      }));
      return { status: results.every((result) => result.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_FAILURE", scheduledAt, publications: results };
    } finally { await this.lock.release(lockKey); }
  }
}

function nextPublishingSlot(now: Date, timezone: string, slots: string[]): string {
  if (slots.length === 0) throw new AppError("SCHEDULING_CONFIG", "publishing slots must be configured");
  const validSlots = slots.filter((slot) => /^([01]\d|2[0-3]):[0-5]\d$/u.test(slot)).sort();
  if (validSlots.length === 0) throw new AppError("SCHEDULING_CONFIG", "publishing slots must use HH:mm");
  const localParts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const current = `${localParts.find((part) => part.type === "hour")?.value ?? "00"}:${localParts.find((part) => part.type === "minute")?.value ?? "00"}`;
  const slot = validSlots.find((candidate) => candidate > current) ?? validSlots[0];
  const dayOffset = slot && slot <= current ? 1 : 0;
  const scheduled = new Date(now.getTime() + dayOffset * 86_400_000);
  return `${scheduled.toISOString().slice(0, 10)}T${slot}:00${offsetForTimezone(scheduled, timezone)}`;
}

function offsetForTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value.replace("GMT", "") ?? "+00:00";
  return offset === "" ? "+00:00" : offset;
}
