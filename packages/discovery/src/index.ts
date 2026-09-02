import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ValidationError, type Platform, type RightsStatus } from "@shortfactory/shared";

export interface DiscoveryQuery {
  sourceId: string;
  sourceUrl: string;
  keywords?: string[];
  limit?: number;
}

export interface DiscoveredAsset {
  sourceId: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  description?: string;
  platform?: Platform;
  durationSeconds?: number;
  publishedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  language?: string;
  rightsStatus: RightsStatus;
  metadata: Record<string, unknown>;
}

export interface DiscoveryProvider {
  discover(query: DiscoveryQuery): Promise<DiscoveredAsset[]>;
  getMetadata(externalId: string): Promise<DiscoveredAsset | undefined>;
  getStats(externalId: string): Promise<Pick<DiscoveredAsset, "views" | "likes" | "comments" | "shares">>;
}

export class ManualDiscoveryProvider implements DiscoveryProvider {
  public constructor(private readonly assets: DiscoveredAsset[] = []) {}

  public async discover(query: DiscoveryQuery): Promise<DiscoveredAsset[]> {
    const filtered = this.assets.filter((asset) => asset.sourceId === query.sourceId && (query.keywords ?? []).every((keyword) => `${asset.title} ${asset.description ?? ""}`.toLowerCase().includes(keyword.toLowerCase())));
    return filtered.slice(0, query.limit ?? 100);
  }

  public async getMetadata(externalId: string): Promise<DiscoveredAsset | undefined> {
    return this.assets.find((asset) => asset.externalId === externalId);
  }

  public async getStats(externalId: string): Promise<Pick<DiscoveredAsset, "views" | "likes" | "comments" | "shares">> {
    const asset = await this.getMetadata(externalId);
    if (!asset) throw new ValidationError(`asset ${externalId} was not found`);
    return { views: asset.views ?? 0, likes: asset.likes ?? 0, comments: asset.comments ?? 0, shares: asset.shares ?? 0 };
  }
}

export interface DuplicateKeySet {
  url: string;
  externalId: string;
  contentHash?: string;
}

export interface DuplicateCheckResult {
  duplicate: boolean;
  matchedBy?: "url" | "external_id" | "content_hash";
}

export class DuplicateDetector {
  private readonly urls = new Set<string>();
  private readonly externalIds = new Set<string>();
  private readonly contentHashes = new Set<string>();

  public check(keys: DuplicateKeySet): DuplicateCheckResult {
    if (this.urls.has(normalizeUrl(keys.url))) return { duplicate: true, matchedBy: "url" };
    if (this.externalIds.has(keys.externalId)) return { duplicate: true, matchedBy: "external_id" };
    if (keys.contentHash && this.contentHashes.has(keys.contentHash)) return { duplicate: true, matchedBy: "content_hash" };
    return { duplicate: false };
  }

  public remember(keys: DuplicateKeySet): DuplicateCheckResult {
    const result = this.check(keys);
    if (result.duplicate) return result;
    this.urls.add(normalizeUrl(keys.url));
    this.externalIds.add(keys.externalId);
    if (keys.contentHash) this.contentHashes.add(keys.contentHash);
    return result;
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeUrl(url: string): string {
  try { const parsed = new URL(url); parsed.hash = ""; return parsed.toString().replace(/\/$/u, ""); } catch { return url.trim(); }
}
