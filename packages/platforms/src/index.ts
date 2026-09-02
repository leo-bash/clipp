import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AppError, type Platform } from "@shortfactory/shared";

export interface PublishInput { videoId: string; title: string; description: string; storageKey?: string; filePath?: string; scheduledAt: string; privacyStatus?: "private" | "unlisted" | "public"; }
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

export interface YouTubePublisherOptions {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  defaultPrivacyStatus?: "private" | "unlisted" | "public";
  tokenUrl?: string;
  apiBaseUrl?: string;
  uploadBaseUrl?: string;
}

export class YouTubePublisher implements PlatformPublisher {
  public readonly platform = "YOUTUBE" as const;
  private accessToken?: string;
  private refreshTokenValue?: string;
  private readonly options: Required<Pick<YouTubePublisherOptions, "clientId" | "clientSecret" | "redirectUri" | "defaultPrivacyStatus" | "tokenUrl" | "apiBaseUrl" | "uploadBaseUrl">>;

  public constructor(options: YouTubePublisherOptions) {
    this.options = { clientId: options.clientId, clientSecret: options.clientSecret, redirectUri: options.redirectUri, defaultPrivacyStatus: options.defaultPrivacyStatus ?? "private", tokenUrl: options.tokenUrl ?? "https://oauth2.googleapis.com/token", apiBaseUrl: options.apiBaseUrl ?? "https://www.googleapis.com/youtube/v3", uploadBaseUrl: options.uploadBaseUrl ?? "https://www.googleapis.com/upload/youtube/v3" };
    this.accessToken = options.accessToken;
    this.refreshTokenValue = options.refreshToken;
  }

  public async connectAccount(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const response = await fetch(this.options.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: this.options.clientId, client_secret: this.options.clientSecret, redirect_uri: this.options.redirectUri, grant_type: "authorization_code" }) });
    const payload = await jsonOrError(response, "YouTube OAuth exchange failed") as { access_token?: string; refresh_token?: string };
    if (!payload.access_token) throw new Error("YouTube OAuth response did not contain an access token");
    this.accessToken = payload.access_token;
    this.refreshTokenValue = payload.refresh_token ?? this.refreshTokenValue;
    return { accessToken: this.accessToken, refreshToken: this.refreshTokenValue };
  }

  public async refreshToken(): Promise<string> {
    if (!this.refreshTokenValue) throw new Error("YouTube refresh token is not configured");
    const response = await fetch(this.options.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ refresh_token: this.refreshTokenValue, client_id: this.options.clientId, client_secret: this.options.clientSecret, grant_type: "refresh_token" }) });
    const payload = await jsonOrError(response, "YouTube token refresh failed") as { access_token?: string };
    if (!payload.access_token) throw new Error("YouTube refresh response did not contain an access token");
    this.accessToken = payload.access_token;
    return this.accessToken;
  }

  public async validateCredentials(): Promise<AccountValidation> {
    if (!this.accessToken) return { ok: false, detail: "YOUTUBE_API_NOT_CONFIGURED" };
    const response = await fetch(`${this.options.apiBaseUrl}/channels?part=id&mine=true`, { headers: this.authHeaders() });
    if (!response.ok) return { ok: false, detail: `YOUTUBE_CREDENTIALS_INVALID_${response.status}` };
    const payload = await response.json() as { items?: unknown[] };
    return { ok: Boolean(payload.items?.length), detail: payload.items?.length ? "YouTube account validated" : "YOUTUBE_CHANNEL_NOT_FOUND" };
  }

  public async validateAccount(): Promise<AccountValidation> { try { return await this.validateCredentials(); } catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "YOUTUBE_VALIDATION_FAILED" }; } }
  public async estimateCost(input: PublishInput): Promise<number> { void input; return 0; }

  public async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.accessToken) return { platform: this.platform, status: "FAILED", error: "YOUTUBE_API_NOT_CONFIGURED" };
    if (!input.filePath || !path.isAbsolute(input.filePath)) return { platform: this.platform, status: "FAILED", error: "YOUTUBE_FILE_PATH_REQUIRED" };
    try {
      const bytes = await readFile(input.filePath);
      const privacyStatus = input.privacyStatus ?? this.options.defaultPrivacyStatus;
      const status: Record<string, unknown> = { privacyStatus, selfDeclaredMadeForKids: false };
      if (privacyStatus === "private" && new Date(input.scheduledAt).getTime() > Date.now()) status.publishAt = input.scheduledAt;
      const initiate = await fetch(`${this.options.uploadBaseUrl}/videos?part=snippet,status`, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(bytes.byteLength), "x-upload-content-type": "video/mp4" }, body: JSON.stringify({ snippet: { title: input.title, description: input.description }, status }) });
      const uploadUrl = initiate.headers.get("location");
      if (!initiate.ok || !uploadUrl) throw new Error(`YouTube resumable upload initialization failed (${initiate.status})`);
      const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { ...this.authHeaders(), "content-type": "video/mp4", "content-length": String(bytes.byteLength) }, body: bytes });
      const payload = await jsonOrError(uploaded, "YouTube video upload failed") as { id?: string };
      if (!payload.id) throw new Error("YouTube upload response did not contain a video ID");
      return { platform: this.platform, status: "SUCCESS", externalPostId: payload.id, externalUrl: `https://www.youtube.com/watch?v=${payload.id}` };
    } catch (error) { return { platform: this.platform, status: "FAILED", error: error instanceof Error ? error.message : "YOUTUBE_UPLOAD_FAILED" }; }
  }

  public async getStatus(externalPostId: string): Promise<PlatformStatus> {
    const response = await fetch(`${this.options.apiBaseUrl}/videos?part=status&id=${encodeURIComponent(externalPostId)}`, { headers: this.authHeaders() });
    const payload = await jsonOrError(response, "YouTube status request failed") as { items?: Array<{ status?: { uploadStatus?: string } }> };
    const uploadStatus = payload.items?.[0]?.status?.uploadStatus;
    return { externalPostId, status: uploadStatus === "processed" ? "PUBLISHED" : uploadStatus === "failed" ? "FAILED" : "PROCESSING" };
  }

  public async getAnalytics(externalPostId: string): Promise<AnalyticsSnapshot> {
    const response = await fetch(`${this.options.apiBaseUrl}/videos?part=statistics&id=${encodeURIComponent(externalPostId)}`, { headers: this.authHeaders() });
    const payload = await jsonOrError(response, "YouTube analytics request failed") as { items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }> };
    const statistics = payload.items?.[0]?.statistics;
    return { views: Number(statistics?.viewCount ?? 0), likes: Number(statistics?.likeCount ?? 0), comments: Number(statistics?.commentCount ?? 0), shares: 0 };
  }

  private authHeaders(): Record<string, string> { return this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}; }
}

export type TikTokMode = "DIRECT_POST" | "UPLOAD_DRAFT";
export interface TikTokPublisherOptions {
  clientKey: string;
  clientSecret: string;
  accessToken?: string;
  openId?: string;
  mode?: TikTokMode;
  fallbackToDraft?: boolean;
  tokenUrl?: string;
  apiBaseUrl?: string;
}

export class TikTokPublisher implements PlatformPublisher {
  public readonly platform = "TIKTOK" as const;
  private accessToken?: string;
  private openId?: string;
  private refreshTokenValue?: string;
  private readonly options: Required<Pick<TikTokPublisherOptions, "clientKey" | "clientSecret" | "mode" | "fallbackToDraft" | "tokenUrl" | "apiBaseUrl">>;

  public constructor(options: TikTokPublisherOptions) {
    this.options = { clientKey: options.clientKey, clientSecret: options.clientSecret, mode: options.mode ?? "UPLOAD_DRAFT", fallbackToDraft: options.fallbackToDraft ?? true, tokenUrl: options.tokenUrl ?? "https://open.tiktokapis.com/v2/oauth/token/", apiBaseUrl: options.apiBaseUrl ?? "https://open.tiktokapis.com" };
    this.accessToken = options.accessToken;
    this.openId = options.openId;
  }

  public async connectAccount(code: string, redirectUri: string): Promise<{ accessToken: string; openId?: string; refreshToken?: string }> {
    const response = await fetch(this.options.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: this.options.clientKey, client_secret: this.options.clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }) });
    const payload = await jsonOrError(response, "TikTok OAuth exchange failed") as { access_token?: string; open_id?: string; refresh_token?: string };
    if (!payload.access_token) throw new Error("TikTok OAuth response did not contain an access token");
    this.accessToken = payload.access_token;
    this.openId = payload.open_id ?? this.openId;
    this.refreshTokenValue = payload.refresh_token ?? this.refreshTokenValue;
    return { accessToken: this.accessToken, openId: this.openId, refreshToken: this.refreshTokenValue };
  }

  public async refreshToken(): Promise<string> {
    if (!this.refreshTokenValue) throw new Error("TikTok refresh token is not configured");
    const response = await fetch(this.options.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: this.options.clientKey, client_secret: this.options.clientSecret, grant_type: "refresh_token", refresh_token: this.refreshTokenValue }) });
    const payload = await jsonOrError(response, "TikTok token refresh failed") as { access_token?: string; refresh_token?: string };
    if (!payload.access_token) throw new Error("TikTok refresh response did not contain an access token");
    this.accessToken = payload.access_token;
    this.refreshTokenValue = payload.refresh_token ?? this.refreshTokenValue;
    return this.accessToken;
  }

  public async queryCreatorInfo(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.options.apiBaseUrl}/v2/post/publish/creator_info/query/`, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json; charset=UTF-8" }, body: "{}" });
    const payload = await jsonOrError(response, "TikTok creator info request failed") as { data?: Record<string, unknown>; error?: { code?: string; message?: string } };
    if (payload.error?.code && payload.error.code !== "ok") throw new Error(payload.error.message ?? payload.error.code);
    return payload.data ?? {};
  }

  public async validateAccount(): Promise<AccountValidation> {
    if (!this.accessToken) return { ok: false, detail: "TIKTOK_API_NOT_CONFIGURED" };
    try { const info = await this.queryCreatorInfo(); return { ok: Object.keys(info).length > 0, detail: Object.keys(info).length > 0 ? "TikTok creator validated" : "TIKTOK_CREATOR_NOT_FOUND" }; } catch (error) { return { ok: false, detail: error instanceof Error ? error.message : "TIKTOK_VALIDATION_FAILED" }; }
  }

  public async estimateCost(input: PublishInput): Promise<number> { void input; return 0; }

  public async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.accessToken) return { platform: this.platform, status: "FAILED", error: "TIKTOK_API_NOT_CONFIGURED" };
    if (!input.filePath || !path.isAbsolute(input.filePath)) return { platform: this.platform, status: "FAILED", error: "TIKTOK_FILE_PATH_REQUIRED" };
    try {
      const bytes = await readFile(input.filePath);
      const firstAttempt = await this.publishMode(input, bytes, this.options.mode);
      if (firstAttempt.status === "FAILED" && this.options.mode === "DIRECT_POST" && this.options.fallbackToDraft && firstAttempt.error?.includes("scope_not_authorized")) return this.publishMode(input, bytes, "UPLOAD_DRAFT");
      return firstAttempt;
    } catch (error) { return { platform: this.platform, status: "FAILED", error: error instanceof Error ? error.message : "TIKTOK_UPLOAD_FAILED" }; }
  }

  public async getStatus(externalPostId: string): Promise<PlatformStatus> {
    const response = await fetch(`${this.options.apiBaseUrl}/v2/post/publish/status/fetch/`, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ publish_id: externalPostId }) });
    const payload = await jsonOrError(response, "TikTok status request failed") as { data?: { status?: string; publicly_available_post_id?: string[] }; error?: { code?: string; message?: string } };
    if (payload.error?.code && payload.error.code !== "ok") throw new Error(payload.error.message ?? payload.error.code);
    const status = payload.data?.status;
    return { externalPostId, status: status === "PUBLISH_COMPLETE" ? "PUBLISHED" : status === "FAILED" ? "FAILED" : "PROCESSING" };
  }

  public async getAnalytics(externalPostId: string): Promise<AnalyticsSnapshot> { void externalPostId; return { views: 0, likes: 0, comments: 0, shares: 0 }; }

  private async publishMode(input: PublishInput, bytes: Buffer, mode: TikTokMode): Promise<PublishResult> {
    const chunkSize = 10_000_000;
    const endpoint = mode === "DIRECT_POST" ? "/v2/post/publish/video/init/" : "/v2/post/publish/inbox/video/init/";
    const totalChunkCount = Math.max(1, Math.ceil(bytes.byteLength / chunkSize));
    const response = await fetch(`${this.options.apiBaseUrl}${endpoint}`, { method: "POST", headers: { ...this.authHeaders(), "content-type": "application/json; charset=UTF-8" }, body: JSON.stringify({ ...(mode === "DIRECT_POST" ? { post_info: { title: input.title, privacy_level: "SELF_ONLY", disable_duet: false, disable_comment: false, disable_stitch: false } } : {}), source_info: { source: "FILE_UPLOAD", video_size: bytes.byteLength, chunk_size: chunkSize, total_chunk_count: totalChunkCount } }) });
    const payload = await response.json() as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } };
    if (!response.ok || payload.error?.code && payload.error.code !== "ok") return { platform: this.platform, status: "FAILED", error: payload.error?.code ?? `TIKTOK_INIT_FAILED_${response.status}` };
    const publishId = payload.data?.publish_id;
    const uploadUrl = payload.data?.upload_url;
    if (!publishId) return { platform: this.platform, status: "FAILED", error: "TIKTOK_PUBLISH_ID_MISSING" };
    if (uploadUrl) for (let start = 0; start < bytes.byteLength; start += chunkSize) { const end = Math.min(bytes.byteLength, start + chunkSize) - 1; const uploaded = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": "video/mp4", "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${bytes.byteLength}` }, body: bytes.subarray(start, end + 1) }); if (!uploaded.ok) return { platform: this.platform, status: "FAILED", externalPostId: publishId, error: `TIKTOK_TRANSFER_FAILED_${uploaded.status}` }; }
    return { platform: this.platform, status: "SUCCESS", externalPostId: publishId };
  }

  private authHeaders(): Record<string, string> { return this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}; }
}

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

  public async publishApprovedVideo(video: SchedulableVideo, channel: SchedulerChannel, metadata: { title: string; description: string; storageKey?: string; filePath?: string; privacyStatus?: PublishInput["privacyStatus"] }, scheduledAt = nextPublishingSlot(this.clock(), channel.timezone, channel.publishingSlots)): Promise<ScheduleResult> {
    if (video.status !== "APPROVED") throw new AppError("VIDEO_NOT_APPROVED", "only approved videos can be scheduled");
    if (video.rightsStatus === "BLOCKED") throw new AppError("RIGHTS_BLOCKED", "blocked videos cannot be published");
    const lockKey = `publication:${video.id}`;
    if (!await this.lock.acquire(lockKey)) throw new AppError("PUBLICATION_LOCKED", "publication is already being processed", true);
    try {
      const results = await Promise.all(this.publishers.map(async (publisher) => {
        const account = await publisher.validateAccount();
        if (!account.ok) return { platform: publisher.platform, status: "FAILED" as const, error: account.detail ?? "account unavailable", scheduledAt } satisfies ScheduledPublication;
        try { return { ...await publisher.publish({ videoId: video.id, title: metadata.title, description: metadata.description, storageKey: metadata.storageKey, filePath: metadata.filePath, privacyStatus: metadata.privacyStatus, scheduledAt }), scheduledAt }; } catch (error) { return { platform: publisher.platform, status: "FAILED" as const, error: error instanceof Error ? error.message : "publisher failed", scheduledAt }; }
      }));
      return { status: results.every((result) => result.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_FAILURE", scheduledAt, publications: results };
    } finally { await this.lock.release(lockKey); }
  }
}

async function jsonOrError(response: Response, message: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${message} (${response.status})`);
  return response.json();
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
