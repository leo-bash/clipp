import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { ProviderError, ValidationError, type Platform, type RightsStatus } from "@shortfactory/shared";

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

export const redditThemeSubreddits = {
  highschool: ["AskReddit", "CasualConversation", "TrueOffMyChest"],
  romance: ["relationship_advice", "AskReddit", "confession"],
  embarrassing: ["TIFU", "confession", "AskReddit"],
  bullies: ["TrueOffMyChest", "offmychest", "AskReddit"],
  family: ["TrueOffMyChest", "offmychest", "confession"],
  scary: ["nosleep", "shortscarystories", "CreepyEncounters"],
  money: ["povertyfinance", "TrueOffMyChest", "AskReddit"],
  tinder: ["Tinder", "dating_advice", "AskReddit"],
  prank: ["prankstories", "TIFU", "AskReddit"],
  divorce: ["Divorce", "relationship_advice", "TrueOffMyChest"],
  betrayal: ["relationship_advice", "TrueOffMyChest", "offmychest"],
  revenge: ["pettyrevenge", "prorevenge", "TrueOffMyChest"],
} as const;

export const redditThemes = Object.keys(redditThemeSubreddits) as Array<keyof typeof redditThemeSubreddits>;

export interface RedditStoryProposal {
  id: string;
  title: string;
  selftext: string;
  subreddit: string;
  score: number;
  over18: boolean;
  author: string;
  createdUtc: number;
  permalink: string;
  theme: string;
}

export interface RedditDiscoveryConfig {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  userAgent?: string;
  oauthBaseUrl?: string;
  publicBaseUrl?: string;
  minScore?: number;
  maxSourceCharacters?: number;
  allowNsfw?: boolean;
}

const redditBlockedContent = /\b(?:suicide|suicidal|self[- ]?harm|rape|sexual assault|child porn|csam|doxx(?:ing)?|doxxed|social security number|credit card number|home address|phone number|blood and gore|graphic gore)\b/iu;

export class RedditDiscoveryProvider {
  public constructor(private readonly config: RedditDiscoveryConfig = {}) {}

  public async discover(theme: string, requestedLimit = 12): Promise<RedditStoryProposal[]> {
    const normalizedTheme = theme.trim().toLowerCase() as keyof typeof redditThemeSubreddits;
    if (!redditThemes.includes(normalizedTheme)) throw new ValidationError(`Unknown Reddit theme: ${theme}. Use one of ${redditThemes.join(", ")}.`);
    const limit = Math.max(5, Math.min(50, requestedLimit));
    const accessToken = await this.getAccessToken();
    const subreddits = redditThemeSubreddits[normalizedTheme];
    const results = await Promise.allSettled(subreddits.map((subreddit) => this.fetchSubreddit(subreddit, limit, accessToken)));
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    const proposals = results.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter((post) => this.isUsable(post));
    const unique = new Map<string, RedditStoryProposal>();
    for (const proposal of proposals) unique.set(proposal.id, { ...proposal, theme: normalizedTheme });
    const sorted = [...unique.values()].sort((left, right) => right.score - left.score || right.createdUtc - left.createdUtc);
    if (sorted.length === 0) {
      const detail = failures.length ? ` Errors: ${failures.join(" | ")}` : "";
      throw new ProviderError(`No new eligible Reddit stories found for theme ${normalizedTheme}.${detail}`, false);
    }
    return sorted.slice(0, limit);
  }

  private async getAccessToken(): Promise<string> {
    if (this.config.accessToken) return this.config.accessToken;
    if (!this.config.clientId || !this.config.clientSecret) return "";
    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": this.config.userAgent ?? "shortfactory-reddit-discovery/0.1",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new ProviderError(`Reddit OAuth returned HTTP ${response.status}; check Reddit client credentials`, response.status >= 500);
    const body = await response.json() as { access_token?: string };
    if (!body.access_token) throw new ProviderError("Reddit OAuth did not return an access token", false);
    return body.access_token;
  }

  private async fetchSubreddit(subreddit: string, limit: number, accessToken: string): Promise<RedditStoryProposal[]> {
    const baseUrl = accessToken ? (this.config.oauthBaseUrl ?? "https://oauth.reddit.com") : (this.config.publicBaseUrl ?? "https://www.reddit.com");
    const suffix = accessToken ? "" : ".json";
    const url = `${baseUrl.replace(/\/$/u, "")}/r/${encodeURIComponent(subreddit)}/hot${suffix}?limit=${limit}&raw_json=1`;
    const response = await fetch(url, {
      headers: { accept: "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), "user-agent": this.config.userAgent ?? "shortfactory-reddit-discovery/0.1" },
    });
    if (!response.ok) throw new ProviderError(`Reddit r/${subreddit} returned HTTP ${response.status}${accessToken ? " via OAuth" : "; configure REDDIT_ACCESS_TOKEN or REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET"}`, response.status >= 500);
    const body = await response.json() as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
    return (body.data?.children ?? []).map((item) => item.data).filter((post): post is Record<string, unknown> => Boolean(post)).map((post) => ({
      id: String(post.id ?? ""),
      title: String(post.title ?? "").trim(),
      selftext: String(post.selftext ?? "").trim(),
      subreddit: String(post.subreddit ?? subreddit),
      score: Number(post.score ?? 0),
      over18: Boolean(post.over_18),
      author: String(post.author ?? "[deleted]"),
      createdUtc: Number(post.created_utc ?? 0),
      permalink: `https://www.reddit.com${String(post.permalink ?? `/r/${subreddit}/comments/${String(post.id ?? "")}`)}`,
      theme: "",
    }));
  }

  private isUsable(post: RedditStoryProposal): boolean {
    const combined = `${post.title}\n${post.selftext}`;
    const minScore = this.config.minScore ?? 10;
    const maxCharacters = this.config.maxSourceCharacters ?? 14_000;
    if (!post.id || !post.permalink || post.author === "[deleted]") return false;
    if (!post.title || !post.selftext || post.selftext.length < 240 || post.selftext.length > maxCharacters) return false;
    if (post.score < minScore || (!this.config.allowNsfw && post.over18)) return false;
    return !redditBlockedContent.test(combined);
  }
}

export async function sha256File(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeUrl(url: string): string {
  try { const parsed = new URL(url); parsed.hash = ""; return parsed.toString().replace(/\/$/u, ""); } catch { return url.trim(); }
}
