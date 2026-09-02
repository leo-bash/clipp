import type { Pool } from "pg";
import { desc, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AnalyticsSnapshot, PlatformPublisher } from "@shortfactory/platforms";
import { analyticsSnapshots, schema } from "@shortfactory/database";
import { AppError } from "@shortfactory/shared";

export interface AnalyticsSnapshotRecord extends AnalyticsSnapshot { id: string; publicationId: string; platform: string; externalPostId: string; capturedAt: string; followersGained: number; }
export interface AnalyticsSnapshotStore { save(snapshot: Omit<AnalyticsSnapshotRecord, "id">): Promise<AnalyticsSnapshotRecord>; list(publicationId?: string): Promise<AnalyticsSnapshotRecord[]>; }
export interface AnalyticsOverview { snapshotCount: number; totals: Pick<AnalyticsSnapshot, "views" | "likes" | "comments" | "shares"> & { followersGained: number }; byPlatform: Record<string, Pick<AnalyticsSnapshot, "views" | "likes" | "comments" | "shares">>; }

export function buildAnalyticsOverview(snapshots: AnalyticsSnapshotRecord[]): AnalyticsOverview {
  const totals = { views: 0, likes: 0, comments: 0, shares: 0, followersGained: 0 };
  const byPlatform: Record<string, Pick<AnalyticsSnapshot, "views" | "likes" | "comments" | "shares">> = {};
  for (const snapshot of snapshots) { totals.views += snapshot.views; totals.likes += snapshot.likes; totals.comments += snapshot.comments; totals.shares += snapshot.shares; totals.followersGained += snapshot.followersGained; const current = byPlatform[snapshot.platform] ?? { views: 0, likes: 0, comments: 0, shares: 0 }; current.views += snapshot.views; current.likes += snapshot.likes; current.comments += snapshot.comments; current.shares += snapshot.shares; byPlatform[snapshot.platform] = current; }
  return { snapshotCount: snapshots.length, totals, byPlatform };
}

export class InMemoryAnalyticsSnapshotStore implements AnalyticsSnapshotStore {
  private readonly snapshots: AnalyticsSnapshotRecord[] = [];
  public async save(snapshot: Omit<AnalyticsSnapshotRecord, "id">): Promise<AnalyticsSnapshotRecord> { const record = { id: `${snapshot.publicationId}:${snapshot.capturedAt}`, ...snapshot }; this.snapshots.push(record); return record; }
  public async list(publicationId?: string): Promise<AnalyticsSnapshotRecord[]> { return publicationId ? this.snapshots.filter((snapshot) => snapshot.publicationId === publicationId) : [...this.snapshots]; }
}

type PgDb = NodePgDatabase<typeof schema>;
export class PostgresAnalyticsSnapshotStore implements AnalyticsSnapshotStore {
  public constructor(private readonly db: PgDb) {}
  public async save(snapshot: Omit<AnalyticsSnapshotRecord, "id">): Promise<AnalyticsSnapshotRecord> { const [row] = await this.db.insert(analyticsSnapshots).values({ publicationId: snapshot.publicationId, capturedAt: new Date(snapshot.capturedAt), views: snapshot.views, likes: snapshot.likes, comments: snapshot.comments, shares: snapshot.shares, watchTime: snapshot.watchTime, metadataJson: { platform: snapshot.platform, externalPostId: snapshot.externalPostId, followersGained: snapshot.followersGained } }).returning(); if (!row) throw new AppError("ANALYTICS_SAVE_FAILED", "analytics snapshot was not saved"); return toSnapshot(row); }
  public async list(publicationId?: string): Promise<AnalyticsSnapshotRecord[]> { const rows = publicationId ? await this.db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.publicationId, publicationId)).orderBy(desc(analyticsSnapshots.capturedAt)) : await this.db.select().from(analyticsSnapshots).orderBy(desc(analyticsSnapshots.capturedAt)); return rows.map(toSnapshot); }
}

export function createPostgresAnalyticsSnapshotStore(pool: Pool): PostgresAnalyticsSnapshotStore { return new PostgresAnalyticsSnapshotStore(drizzle(pool, { schema })); }

export interface AnalyticsPublication { publicationId: string; platform: string; externalPostId: string; publisher: PlatformPublisher; }
export interface CollectionResult { status: "SUCCESS" | "PARTIAL_FAILURE"; snapshots: AnalyticsSnapshotRecord[]; failures: Array<{ platform: string; error: string }>; }

export class AnalyticsCollector {
  public constructor(private readonly store: AnalyticsSnapshotStore, private readonly clock: () => Date = () => new Date()) {}
  public async collect(publication: AnalyticsPublication): Promise<AnalyticsSnapshotRecord> { const metrics = await publication.publisher.getAnalytics(publication.externalPostId); return this.store.save({ ...metrics, publicationId: publication.publicationId, platform: publication.platform, externalPostId: publication.externalPostId, capturedAt: this.clock().toISOString(), followersGained: 0 }); }
  public async collectMany(publications: AnalyticsPublication[]): Promise<CollectionResult> { const settled = await Promise.allSettled(publications.map((publication) => this.collect(publication))); const snapshots: AnalyticsSnapshotRecord[] = []; const failures: Array<{ platform: string; error: string }> = []; settled.forEach((result, index) => { const publication = publications[index]; if (result.status === "fulfilled") snapshots.push(result.value); else failures.push({ platform: publication?.platform ?? "unknown", error: result.reason instanceof Error ? result.reason.message : "analytics collection failed" }); }); return { status: failures.length === 0 ? "SUCCESS" : "PARTIAL_FAILURE", snapshots, failures }; }
}

export interface PerformanceSignals { views24h: number; views7d: number; engagementRate: number; completionRate: number; followerConversion: number; recency: number; relevance: number; novelty: number; historicalFormatPerformance: number; rightsStatus: string; }
export interface PerformanceWeights { views: number; engagement: number; completion: number; followerConversion: number; recency: number; relevance: number; novelty: number; historicalFormatPerformance: number; }
export const defaultPerformanceWeights: PerformanceWeights = { views: 0.2, engagement: 0.2, completion: 0.15, followerConversion: 0.1, recency: 0.1, relevance: 0.1, novelty: 0.05, historicalFormatPerformance: 0.1 };

export function computePerformanceScore(signals: PerformanceSignals, weights: PerformanceWeights = defaultPerformanceWeights): number {
  if (signals.rightsStatus === "BLOCKED") return 0;
  const viewsScore = Math.min(100, Math.max(0, Math.log10(Math.max(1, signals.views24h)) * 25));
  const engagementScore = clampPercent(signals.engagementRate);
  const completionScore = clampPercent(signals.completionRate);
  const followerScore = clampPercent(signals.followerConversion);
  const weighted = viewsScore * weights.views + engagementScore * weights.engagement + completionScore * weights.completion + followerScore * weights.followerConversion + clampPercent(signals.recency) * weights.recency + clampPercent(signals.relevance) * weights.relevance + clampPercent(signals.novelty) * weights.novelty + clampPercent(signals.historicalFormatPerformance) * weights.historicalFormatPerformance;
  return Math.round(Math.min(100, Math.max(0, weighted)) * 100) / 100;
}

function clampPercent(value: number): number { return Math.min(100, Math.max(0, value)); }
function toSnapshot(row: typeof analyticsSnapshots.$inferSelect): AnalyticsSnapshotRecord { const metadata = row.metadataJson ?? {}; return { id: row.id, publicationId: row.publicationId, platform: typeof metadata.platform === "string" ? metadata.platform : "unknown", externalPostId: typeof metadata.externalPostId === "string" ? metadata.externalPostId : "unknown", capturedAt: row.capturedAt.toISOString(), views: row.views, likes: row.likes, comments: row.comments, shares: row.shares, watchTime: row.watchTime ?? undefined, followersGained: typeof metadata.followersGained === "number" ? metadata.followersGained : 0 }; }
