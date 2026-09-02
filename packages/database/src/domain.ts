import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { count, desc, eq, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { defaultPublishingSlots, type Budget, type Candidate, type CandidateStatus, type Channel, type ChannelStatus, type ChannelType, type Cost, type Platform, type Publication, type PublicationStatus, type RightsStatus, type Source, type Video, type VideoStatus } from "@shortfactory/shared";
import { AppError } from "@shortfactory/shared";
import { channels, candidates, costs, publications, schema, sources, videos } from "./schema.js";

export interface PageParams { page: number; pageSize: number; }
export interface Page<T> extends PageParams { items: T[]; total: number; }

export interface CreateChannelInput {
  name: string;
  slug: string;
  type: ChannelType;
  language: string;
  timezone: string;
  status?: ChannelStatus;
  videosPerDay: number;
  minDuration: number;
  maxDuration: number;
  autoPublish: boolean;
  manualReviewRequired: boolean;
  monthlyBudget: number;
  publishingSlots?: string[];
  keywords?: string[];
  priority?: number;
  settings?: Record<string, unknown>;
  killSwitches?: Record<string, boolean>;
}

export type UpdateChannelInput = Partial<Omit<CreateChannelInput, "slug">>;

export interface CreateSourceInput {
  name: string;
  type: string;
  url: string;
  platform?: Platform;
  rightsStatus: RightsStatus;
  creator?: string;
  notes?: string;
  licenseUrl?: string;
  attributionRequired?: boolean;
  attributionText?: string;
  keywords?: string[];
  enabled: boolean;
}

export type UpdateSourceInput = Partial<CreateSourceInput>;

export interface CreateCandidateInput {
  channelId: string;
  topic: string;
  sourceAssetId?: string;
  scoreTotal?: number;
}

export interface CreateVideoInput {
  channelId: string;
  candidateId?: string;
  contentPlanId?: string;
  rightsStatus: RightsStatus;
  metadata?: Record<string, unknown>;
}

export type UpdateVideoInput = Pick<Video, "metadata">;
export interface RenderedVideoInput { storageKey: string; thumbnailKey?: string; duration: number; width: number; height: number; fileSize: number; contentHash: string; qualityScore: number; metadata?: Record<string, unknown>; }

export interface CreatePublicationInput {
  videoId: string;
  platform: Platform;
  platformAccountId?: string;
  status?: PublicationStatus;
  scheduledAt?: string;
}

export interface CreateCostInput {
  provider: string;
  service: string;
  operation: string;
  channelId?: string;
  candidateId?: string;
  videoId?: string;
  quantity: number;
  unit: string;
  estimatedCostEur: number;
  actualCostEur?: number;
}

export interface CreateBudgetInput {
  scope: string;
  scopeId: string;
  period: string;
  budgetEur: number;
  warningThreshold: number;
  hardStop: boolean;
}

export interface DomainStore {
  readonly mode: "memory" | "postgres";
  ensureSeedData(): Promise<void>;
  listChannels(params: PageParams): Promise<Page<Channel>>;
  getChannel(id: string): Promise<Channel | undefined>;
  createChannel(input: CreateChannelInput): Promise<Channel>;
  updateChannel(id: string, input: UpdateChannelInput): Promise<Channel | undefined>;
  listSources(params: PageParams): Promise<Page<Source>>;
  createSource(input: CreateSourceInput): Promise<Source>;
  updateSource(id: string, input: UpdateSourceInput): Promise<Source | undefined>;
  listCandidates(params: PageParams): Promise<Page<Candidate>>;
  createCandidate(input: CreateCandidateInput): Promise<Candidate>;
  selectCandidate(id: string): Promise<Candidate | undefined>;
  analyzeCandidate(id: string): Promise<Candidate | undefined>;
  planCandidate(id: string): Promise<Candidate | undefined>;
  rejectCandidate(id: string, reason: string): Promise<Candidate | undefined>;
  listVideos(params: PageParams): Promise<Page<Video>>;
  getVideo(id: string): Promise<Video | undefined>;
  createVideo(input: CreateVideoInput): Promise<Video>;
  approveVideo(id: string): Promise<Video | undefined>;
  rejectVideo(id: string): Promise<Video | undefined>;
  updateVideo(id: string, input: UpdateVideoInput): Promise<Video | undefined>;
  rerenderVideo(id: string): Promise<Video | undefined>;
  markVideoRendered(id: string, input: RenderedVideoInput): Promise<Video | undefined>;
  listPublications(params: PageParams): Promise<Page<Publication>>;
  createPublication(input: CreatePublicationInput): Promise<Publication>;
  retryPublication(id: string): Promise<Publication | undefined>;
  listCosts(params: PageParams): Promise<Page<Cost>>;
  createCost(input: CreateCostInput): Promise<Cost>;
  listBudgets(params: PageParams): Promise<Page<Budget>>;
  createBudget(input: CreateBudgetInput): Promise<Budget>;
}

function pageSlice<T>(items: T[], params: PageParams): Page<T> {
  const offset = (params.page - 1) * params.pageSize;
  return { items: items.slice(offset, offset + params.pageSize), total: items.length, ...params };
}

function iso(date: Date | null | undefined): string | undefined {
  return date?.toISOString();
}

function requiredIso(date: Date): string {
  return date.toISOString();
}

const now = (): string => new Date().toISOString();

export class MemoryDomainStore implements DomainStore {
  public readonly mode = "memory" as const;
  private readonly channelItems: Channel[] = [];
  private readonly sourceItems: Source[] = [];
  private readonly candidateItems: Candidate[] = [];
  private readonly videoItems: Video[] = [];
  private readonly publicationItems: Publication[] = [];
  private readonly costItems: Cost[] = [];
  private readonly budgetItems: Budget[] = [];

  public async ensureSeedData(): Promise<void> {
    if (this.channelItems.length > 0) return;
    const timestamp = now();
    const channelSeed: CreateChannelInput[] = [
      { name: "Tech Tutorials", slug: "tech-tutorials", type: "TUTORIAL", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 20, publishingSlots: [...defaultPublishingSlots] },
      { name: "Streamer Commentary", slug: "streamer-commentary", type: "STREAMER_COMMENTARY", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 15, publishingSlots: [...defaultPublishingSlots] },
      { name: "Creator Stories", slug: "creator-stories", type: "CREATOR_STORY", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 15, publishingSlots: [...defaultPublishingSlots] }
    ];
    for (const input of channelSeed) {
      this.channelItems.push({ id: randomUUID(), ...input, status: "ACTIVE", createdAt: timestamp, updatedAt: timestamp });
    }
    const sourceSeed: CreateSourceInput[] = [
      { name: "Official Windows Blog", type: "MANUAL", url: "https://blogs.windows.com/", rightsStatus: "OWNED", enabled: true },
      { name: "MDN Web Docs", type: "MANUAL", url: "https://developer.mozilla.org/", rightsStatus: "COMMENTARY_REVIEW", enabled: true },
      { name: "Creator News Feed", type: "MANUAL", url: "https://example.com/creator-news", rightsStatus: "UNKNOWN", enabled: true },
      { name: "Public Domain Archive", type: "MANUAL", url: "https://archive.org/", rightsStatus: "PUBLIC_DOMAIN", enabled: true },
      { name: "Licensed Demo Footage", type: "MANUAL", url: "https://example.com/licensed-footage", rightsStatus: "LICENSED", enabled: false }
    ];
    for (const input of sourceSeed) {
      this.sourceItems.push({ id: randomUUID(), ...input, createdAt: timestamp, updatedAt: timestamp });
    }
    const techChannel = this.channelItems[0];
    if (techChannel) this.candidateItems.push({ id: randomUUID(), channelId: techChannel.id, topic: "Three keyboard shortcuts that save time", status: "DISCOVERED", scoreTotal: 82, createdAt: timestamp, updatedAt: timestamp });
  }

  public async listChannels(params: PageParams): Promise<Page<Channel>> { return pageSlice(this.channelItems, params); }
  public async getChannel(id: string): Promise<Channel | undefined> { return this.channelItems.find((item) => item.id === id); }
  public async createChannel(input: CreateChannelInput): Promise<Channel> { const item: Channel = { id: randomUUID(), ...input, status: input.status ?? "ACTIVE", createdAt: now(), updatedAt: now() }; this.channelItems.push(item); return item; }
  public async updateChannel(id: string, input: UpdateChannelInput): Promise<Channel | undefined> { const item = await this.getChannel(id); if (!item) return undefined; Object.assign(item, input, { updatedAt: now() }); return item; }
  public async listSources(params: PageParams): Promise<Page<Source>> { return pageSlice(this.sourceItems, params); }
  public async createSource(input: CreateSourceInput): Promise<Source> { const item: Source = { id: randomUUID(), ...input, createdAt: now(), updatedAt: now() }; this.sourceItems.push(item); return item; }
  public async updateSource(id: string, input: UpdateSourceInput): Promise<Source | undefined> { const item = this.sourceItems.find((candidate) => candidate.id === id); if (!item) return undefined; Object.assign(item, input, { updatedAt: now() }); return item; }
  public async listCandidates(params: PageParams): Promise<Page<Candidate>> { return pageSlice(this.candidateItems, params); }
  public async createCandidate(input: CreateCandidateInput): Promise<Candidate> { const item: Candidate = { id: randomUUID(), ...input, status: "DISCOVERED", scoreTotal: input.scoreTotal ?? 0, createdAt: now(), updatedAt: now() }; this.candidateItems.push(item); return item; }
  public async selectCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "SELECTED" }); }
  public async analyzeCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "QUALIFIED", analysis: { provider: "deterministic", analyzedAt: now(), decision: "qualified_for_planning" } }); }
  public async planCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "SELECTED", analysis: { ...(this.candidateItems.find((item) => item.id === id)?.analysis ?? {}), plannedAt: now() } }); }
  public async rejectCandidate(id: string, reason: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "REJECTED", rejectionReason: reason }); }
  private async updateCandidate(id: string, input: Partial<Candidate>): Promise<Candidate | undefined> { const item = this.candidateItems.find((candidate) => candidate.id === id); if (!item) return undefined; Object.assign(item, input, { updatedAt: now() }); return item; }
  public async listVideos(params: PageParams): Promise<Page<Video>> { return pageSlice(this.videoItems, params); }
  public async getVideo(id: string): Promise<Video | undefined> { return this.videoItems.find((item) => item.id === id); }
  public async createVideo(input: CreateVideoInput): Promise<Video> { const item: Video = { id: randomUUID(), ...input, status: "PLANNED", renderVersion: 1, createdAt: now(), updatedAt: now() }; this.videoItems.push(item); return item; }
  public async approveVideo(id: string): Promise<Video | undefined> { return this.updateVideoStatus(id, "APPROVED"); }
  public async rejectVideo(id: string): Promise<Video | undefined> { return this.updateVideoStatus(id, "REJECTED"); }
  public async updateVideo(id: string, input: UpdateVideoInput): Promise<Video | undefined> { const item = await this.getVideo(id); if (!item) return undefined; Object.assign(item, input, { updatedAt: now() }); return item; }
  public async rerenderVideo(id: string): Promise<Video | undefined> { const item = await this.getVideo(id); if (!item) return undefined; item.status = "RENDERING"; item.renderVersion += 1; item.updatedAt = now(); return item; }
  public async markVideoRendered(id: string, input: RenderedVideoInput): Promise<Video | undefined> { const item = await this.getVideo(id); if (!item) return undefined; Object.assign(item, input, { status: "READY_FOR_REVIEW", updatedAt: now() }); return item; }
  private async updateVideoStatus(id: string, status: VideoStatus): Promise<Video | undefined> { const item = await this.getVideo(id); if (!item) return undefined; Object.assign(item, { status, updatedAt: now() }); return item; }
  public async listPublications(params: PageParams): Promise<Page<Publication>> { return pageSlice(this.publicationItems, params); }
  public async createPublication(input: CreatePublicationInput): Promise<Publication> { const item: Publication = { id: randomUUID(), ...input, status: input.status ?? "SCHEDULED", attemptCount: 0, scheduledAt: input.scheduledAt, createdAt: now(), updatedAt: now() }; this.publicationItems.push(item); return item; }
  public async retryPublication(id: string): Promise<Publication | undefined> { const item = this.publicationItems.find((candidate) => candidate.id === id); if (!item) return undefined; Object.assign(item, { status: "SCHEDULED", scheduledAt: now(), attemptCount: item.attemptCount + 1, lastError: undefined, updatedAt: now() }); return item; }
  public async listCosts(params: PageParams): Promise<Page<Cost>> { return pageSlice(this.costItems, params); }
  public async createCost(input: CreateCostInput): Promise<Cost> { const item: Cost = { id: randomUUID(), ...input, createdAt: now() }; this.costItems.push(item); return item; }
  public async listBudgets(params: PageParams): Promise<Page<Budget>> { return pageSlice(this.budgetItems, params); }
  public async createBudget(input: CreateBudgetInput): Promise<Budget> { const item: Budget = { id: randomUUID(), ...input, spentEur: 0, reservedEur: 0, createdAt: now() }; this.budgetItems.push(item); return item; }
}

type PgDb = NodePgDatabase<typeof schema>;

export class PostgresDomainStore implements DomainStore {
  public readonly mode = "postgres" as const;
  public constructor(private readonly db: PgDb) {}

  public async ensureSeedData(): Promise<void> {
    const existing = await this.db.select({ id: channels.id }).from(channels).limit(1);
    if (existing.length > 0) return;
    const channelSeed: CreateChannelInput[] = [
      { name: "Tech Tutorials", slug: "tech-tutorials", type: "TUTORIAL", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 20, publishingSlots: [...defaultPublishingSlots] },
      { name: "Streamer Commentary", slug: "streamer-commentary", type: "STREAMER_COMMENTARY", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 15, publishingSlots: [...defaultPublishingSlots] },
      { name: "Creator Stories", slug: "creator-stories", type: "CREATOR_STORY", language: "en", timezone: "Europe/Rome", videosPerDay: 6, minDuration: 18, maxDuration: 45, autoPublish: false, manualReviewRequired: true, monthlyBudget: 15, publishingSlots: [...defaultPublishingSlots] }
    ];
    const seededChannels = await this.db.insert(channels).values(channelSeed).onConflictDoNothing({ target: channels.slug }).returning();
    const sourceSeed: CreateSourceInput[] = [
      { name: "Official Windows Blog", type: "MANUAL", url: "https://blogs.windows.com/", rightsStatus: "OWNED", enabled: true },
      { name: "MDN Web Docs", type: "MANUAL", url: "https://developer.mozilla.org/", rightsStatus: "COMMENTARY_REVIEW", enabled: true },
      { name: "Creator News Feed", type: "MANUAL", url: "https://example.com/creator-news", rightsStatus: "UNKNOWN", enabled: true },
      { name: "Public Domain Archive", type: "MANUAL", url: "https://archive.org/", rightsStatus: "PUBLIC_DOMAIN", enabled: true },
      { name: "Licensed Demo Footage", type: "MANUAL", url: "https://example.com/licensed-footage", rightsStatus: "LICENSED", enabled: false }
    ];
    await this.db.insert(sources).values(sourceSeed).onConflictDoNothing({ target: sources.url });
    const techChannel = seededChannels.find((channel) => channel.slug === "tech-tutorials");
    if (techChannel) await this.db.insert(candidates).values({ channelId: techChannel.id, topic: "Three keyboard shortcuts that save time", status: "DISCOVERED", scoreTotal: 82 }).onConflictDoNothing({ target: [candidates.channelId, candidates.topic] });
  }

  public async listChannels(params: PageParams): Promise<Page<Channel>> { const [items, total] = await Promise.all([this.db.select().from(channels).orderBy(desc(channels.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(channels)]); return { items: items.map(toChannel), total: Number(total[0]?.value ?? 0), ...params }; }
  public async getChannel(id: string): Promise<Channel | undefined> { const [item] = await this.db.select().from(channels).where(eq(channels.id, id)); return item ? toChannel(item) : undefined; }
  public async createChannel(input: CreateChannelInput): Promise<Channel> { const [item] = await this.db.insert(channels).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "channel was not created"); return toChannel(item); }
  public async updateChannel(id: string, input: UpdateChannelInput): Promise<Channel | undefined> { const [item] = await this.db.update(channels).set({ ...input, updatedAt: new Date() }).where(eq(channels.id, id)).returning(); return item ? toChannel(item) : undefined; }
  public async listSources(params: PageParams): Promise<Page<Source>> { const [items, total] = await Promise.all([this.db.select().from(sources).orderBy(desc(sources.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(sources)]); return { items: items.map(toSource), total: Number(total[0]?.value ?? 0), ...params }; }
  public async createSource(input: CreateSourceInput): Promise<Source> { const [item] = await this.db.insert(sources).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "source was not created"); return toSource(item); }
  public async updateSource(id: string, input: UpdateSourceInput): Promise<Source | undefined> { const [item] = await this.db.update(sources).set({ ...input, updatedAt: new Date() }).where(eq(sources.id, id)).returning(); return item ? toSource(item) : undefined; }
  public async listCandidates(params: PageParams): Promise<Page<Candidate>> { const [items, total] = await Promise.all([this.db.select().from(candidates).orderBy(desc(candidates.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(candidates)]); return { items: items.map(toCandidate), total: Number(total[0]?.value ?? 0), ...params }; }
  public async createCandidate(input: CreateCandidateInput): Promise<Candidate> { const [item] = await this.db.insert(candidates).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "candidate was not created"); return toCandidate(item); }
  public async selectCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "SELECTED" }); }
  public async analyzeCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "QUALIFIED", analysisJson: { provider: "deterministic", analyzedAt: new Date().toISOString(), decision: "qualified_for_planning" } }); }
  public async planCandidate(id: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "SELECTED", analysisJson: { plannedAt: new Date().toISOString() } }); }
  public async rejectCandidate(id: string, reason: string): Promise<Candidate | undefined> { return this.updateCandidate(id, { status: "REJECTED", rejectionReason: reason }); }
  private async updateCandidate(id: string, input: { status: CandidateStatus; rejectionReason?: string; analysisJson?: Record<string, unknown> }): Promise<Candidate | undefined> { const [item] = await this.db.update(candidates).set({ ...input, updatedAt: new Date() }).where(eq(candidates.id, id)).returning(); return item ? toCandidate(item) : undefined; }
  public async listVideos(params: PageParams): Promise<Page<Video>> { const [items, total] = await Promise.all([this.db.select().from(videos).orderBy(desc(videos.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(videos)]); return { items: items.map(toVideo), total: Number(total[0]?.value ?? 0), ...params }; }
  public async getVideo(id: string): Promise<Video | undefined> { const [item] = await this.db.select().from(videos).where(eq(videos.id, id)); return item ? toVideo(item) : undefined; }
  public async createVideo(input: CreateVideoInput): Promise<Video> { const [item] = await this.db.insert(videos).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "video was not created"); return toVideo(item); }
  public async approveVideo(id: string): Promise<Video | undefined> { return this.updateVideoStatus(id, "APPROVED"); }
  public async rejectVideo(id: string): Promise<Video | undefined> { return this.updateVideoStatus(id, "REJECTED"); }
  public async updateVideo(id: string, input: UpdateVideoInput): Promise<Video | undefined> { const [item] = await this.db.update(videos).set({ metadataJson: input.metadata, updatedAt: new Date() }).where(eq(videos.id, id)).returning(); return item ? toVideo(item) : undefined; }
  public async rerenderVideo(id: string): Promise<Video | undefined> { const [item] = await this.db.update(videos).set({ status: "RENDERING", renderVersion: sql`${videos.renderVersion} + 1`, updatedAt: new Date() }).where(eq(videos.id, id)).returning(); return item ? toVideo(item) : undefined; }
  public async markVideoRendered(id: string, input: RenderedVideoInput): Promise<Video | undefined> { const [item] = await this.db.update(videos).set({ storageKey: input.storageKey, thumbnailKey: input.thumbnailKey, duration: input.duration, width: input.width, height: input.height, fileSize: input.fileSize, contentHash: input.contentHash, qualityScore: input.qualityScore, metadataJson: input.metadata, status: "READY_FOR_REVIEW", updatedAt: new Date() }).where(eq(videos.id, id)).returning(); return item ? toVideo(item) : undefined; }
  private async updateVideoStatus(id: string, status: VideoStatus): Promise<Video | undefined> { const [item] = await this.db.update(videos).set({ status, updatedAt: new Date() }).where(eq(videos.id, id)).returning(); return item ? toVideo(item) : undefined; }
  public async listPublications(params: PageParams): Promise<Page<Publication>> { const [items, total] = await Promise.all([this.db.select().from(publications).orderBy(desc(publications.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(publications)]); return { items: items.map(toPublication), total: Number(total[0]?.value ?? 0), ...params }; }
  public async createPublication(input: CreatePublicationInput): Promise<Publication> { const [item] = await this.db.insert(publications).values({ ...input, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined }).returning(); if (!item) throw new AppError("CREATE_FAILED", "publication was not created"); return toPublication(item); }
  public async retryPublication(id: string): Promise<Publication | undefined> { const [item] = await this.db.update(publications).set({ status: "SCHEDULED", scheduledAt: new Date(), attemptCount: sql`${publications.attemptCount} + 1`, lastError: null, updatedAt: new Date() }).where(eq(publications.id, id)).returning(); return item ? toPublication(item) : undefined; }
  public async listCosts(params: PageParams): Promise<Page<Cost>> { const [items, total] = await Promise.all([this.db.select().from(costs).orderBy(desc(costs.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(costs)]); return { items: items.map(toCost), total: Number(total[0]?.value ?? 0), ...params }; }
  public async createCost(input: CreateCostInput): Promise<Cost> { const [item] = await this.db.insert(costs).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "cost was not created"); return toCost(item); }
  public async listBudgets(params: PageParams): Promise<Page<Budget>> { const [items, total] = await Promise.all([this.db.select().from(schema.budgets).orderBy(desc(schema.budgets.createdAt)).limit(params.pageSize).offset((params.page - 1) * params.pageSize), this.db.select({ value: count() }).from(schema.budgets)]); return { items: items.map(toBudget), total: Number(total[0]?.value ?? 0), ...params }; }
  public async createBudget(input: CreateBudgetInput): Promise<Budget> { const [item] = await this.db.insert(schema.budgets).values(input).returning(); if (!item) throw new AppError("CREATE_FAILED", "budget was not created"); return toBudget(item); }
}

function toChannel(row: typeof channels.$inferSelect): Channel { return { id: row.id, name: row.name, slug: row.slug, type: row.type, language: row.language, timezone: row.timezone, status: row.status, videosPerDay: row.videosPerDay, minDuration: row.minDuration, maxDuration: row.maxDuration, autoPublish: row.autoPublish, manualReviewRequired: row.manualReviewRequired, monthlyBudget: row.monthlyBudget, publishingSlots: row.publishingSlots, keywords: row.keywords, priority: row.priority, settings: row.settings, killSwitches: row.killSwitches, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }
function toSource(row: typeof sources.$inferSelect): Source { return { id: row.id, name: row.name, type: row.type, url: row.url, platform: row.platform ?? undefined, rightsStatus: row.rightsStatus, creator: row.creator ?? undefined, notes: row.notes ?? undefined, licenseUrl: row.licenseUrl ?? undefined, attributionRequired: row.attributionRequired, attributionText: row.attributionText ?? undefined, keywords: row.keywords, enabled: row.enabled, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }
function toCandidate(row: typeof candidates.$inferSelect): Candidate { return { id: row.id, channelId: row.channelId, sourceAssetId: row.sourceAssetId ?? undefined, status: row.status, topic: row.topic, scoreTotal: row.scoreTotal, analysis: row.analysisJson ?? undefined, rejectionReason: row.rejectionReason ?? undefined, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }
function toVideo(row: typeof videos.$inferSelect): Video { return { id: row.id, channelId: row.channelId, candidateId: row.candidateId ?? undefined, contentPlanId: row.contentPlanId ?? undefined, status: row.status, storageKey: row.storageKey ?? undefined, thumbnailKey: row.thumbnailKey ?? undefined, duration: row.duration ?? undefined, width: row.width ?? undefined, height: row.height ?? undefined, fileSize: row.fileSize ?? undefined, contentHash: row.contentHash ?? undefined, renderVersion: row.renderVersion, qualityScore: row.qualityScore ?? undefined, rightsStatus: row.rightsStatus, metadata: row.metadataJson ?? undefined, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }
function toPublication(row: typeof publications.$inferSelect): Publication { return { id: row.id, videoId: row.videoId, platformAccountId: row.platformAccountId ?? undefined, platform: row.platform, status: row.status, scheduledAt: iso(row.scheduledAt), publishedAt: iso(row.publishedAt), externalPostId: row.externalPostId ?? undefined, externalUrl: row.externalUrl ?? undefined, attemptCount: row.attemptCount, lastError: row.lastError ?? undefined, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }
function toCost(row: typeof costs.$inferSelect): Cost { return { id: row.id, provider: row.provider, service: row.service, operation: row.operation, channelId: row.channelId ?? undefined, candidateId: row.candidateId ?? undefined, videoId: row.videoId ?? undefined, quantity: row.quantity, unit: row.unit, estimatedCostEur: row.estimatedCostEur, actualCostEur: row.actualCostEur ?? undefined, createdAt: requiredIso(row.createdAt) }; }
function toBudget(row: typeof schema.budgets.$inferSelect): Budget { return { id: row.id, scope: row.scope, scopeId: row.scopeId, period: row.period, budgetEur: row.budgetEur, spentEur: row.spentEur, reservedEur: row.reservedEur, warningThreshold: row.warningThreshold, hardStop: row.hardStop, createdAt: requiredIso(row.createdAt), updatedAt: requiredIso(row.updatedAt) }; }

export function createPostgresDomainStore(client: { pool: Pool }): PostgresDomainStore { return new PostgresDomainStore(drizzle(client.pool, { schema })); }
