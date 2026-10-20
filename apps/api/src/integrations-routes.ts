import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "@shortfactory/config";
import type { DomainStore } from "@shortfactory/database";
import { TikTokPublisher, YouTubePublisher, readStoredPlatformCredentials, writeStoredPlatformCredentials, type StoredPlatformCredential } from "@shortfactory/platforms";
import type { Platform } from "@shortfactory/shared";

interface PendingOAuth { platform: "YOUTUBE" | "TIKTOK"; channelId: string; createdAt: number; codeVerifier?: string; }
interface OAuthQuery { code?: string; state?: string; error?: string; }

const channelIdSchema = z.string().uuid();
const pending = new Map<string, PendingOAuth>();
const stateLifetimeMs = 10 * 60 * 1000;

export async function registerIntegrationRoutes(server: FastifyInstance, config: AppConfig, store: DomainStore, prefix = "/api/v1"): Promise<void> {
  server.get<{ Querystring: { channelId?: string } }>(`${prefix}/integrations/youtube/start`, async (request, reply) => {
    const channelId = parseChannelId(request.query.channelId);
    if (!channelId) return reply.code(400).send({ error: "CHANNEL_ID_REQUIRED", message: "Select a channel before connecting YouTube." });
    if (!config.YOUTUBE_CLIENT_ID || !config.YOUTUBE_CLIENT_SECRET || !config.YOUTUBE_REDIRECT_URI) return reply.code(503).send({ error: "YOUTUBE_OAUTH_NOT_CONFIGURED", message: "Configure YouTube client credentials and redirect URI first." });
    if (!await store.getChannel(channelId)) return reply.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const state = remember("YOUTUBE", channelId);
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({ client_id: config.YOUTUBE_CLIENT_ID, redirect_uri: config.YOUTUBE_REDIRECT_URI, response_type: "code", access_type: "offline", prompt: "consent", include_granted_scopes: "true", scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly", state }).toString();
    return { authorizationUrl: authorizationUrl.toString() };
  });

  server.get<{ Querystring: { channelId?: string } }>(`${prefix}/integrations/tiktok/start`, async (request, reply) => {
    const channelId = parseChannelId(request.query.channelId);
    if (!channelId) return reply.code(400).send({ error: "CHANNEL_ID_REQUIRED", message: "Select a channel before connecting TikTok." });
    if (!config.TIKTOK_CLIENT_KEY || !config.TIKTOK_CLIENT_SECRET || !config.TIKTOK_REDIRECT_URI) return reply.code(503).send({ error: "TIKTOK_OAUTH_NOT_CONFIGURED", message: "Configure TikTok client credentials and redirect URI first." });
    if (!await store.getChannel(channelId)) return reply.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const codeVerifier = randomBytes(48).toString("base64url");
    const state = remember("TIKTOK", channelId, codeVerifier);
    // TikTok Desktop Login Kit requires the SHA-256 challenge encoded as hex.
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("hex");
    const scopes = config.TIKTOK_MODE === "DIRECT_POST" ? "user.info.basic,video.upload,video.publish" : "user.info.basic,video.upload";
    const authorizationUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
    authorizationUrl.search = new URLSearchParams({ client_key: config.TIKTOK_CLIENT_KEY, response_type: "code", scope: scopes, redirect_uri: config.TIKTOK_REDIRECT_URI, state, code_challenge: codeChallenge, code_challenge_method: "S256" }).toString();
    return { authorizationUrl: authorizationUrl.toString() };
  });

  server.get<{ Querystring: OAuthQuery }>(`${prefix}/integrations/youtube/callback`, async (request, reply) => {
    const state = consume(request.query.state, "YOUTUBE");
    if (!state || !request.query.code) return redirectToDashboard(config, reply, "YOUTUBE", false);
    try {
      const publisher = new YouTubePublisher({ clientId: config.YOUTUBE_CLIENT_ID, clientSecret: config.YOUTUBE_CLIENT_SECRET, redirectUri: config.YOUTUBE_REDIRECT_URI });
      const tokens = await publisher.connectAccount(request.query.code);
      const account = await publisher.getChannelInfo();
      await saveConnection(config, "YOUTUBE", { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokenExpiry(tokens.expiresIn), externalAccountId: account.id, displayName: account.title }, state.channelId, store);
      return redirectToDashboard(config, reply, "YOUTUBE", true);
    } catch (error) {
      request.log.error({ err: error instanceof Error ? error.message : "unknown YouTube OAuth callback error" }, "YouTube OAuth callback failed");
      return redirectToDashboard(config, reply, "YOUTUBE", false);
    }
  });

  server.get<{ Querystring: OAuthQuery }>(`${prefix}/integrations/tiktok/callback`, async (request, reply) => {
    const state = consume(request.query.state, "TIKTOK");
    if (!state || !request.query.code) return redirectToDashboard(config, reply, "TIKTOK", false);
    try {
      const publisher = new TikTokPublisher({ clientKey: config.TIKTOK_CLIENT_KEY, clientSecret: config.TIKTOK_CLIENT_SECRET });
      const tokens = await publisher.connectAccount(request.query.code, config.TIKTOK_REDIRECT_URI, state.codeVerifier);
      // The upload-draft flow only grants `video.upload`. Querying creator info
      // requires `video.publish`, so only call it for direct-post mode.
      let creator: Record<string, unknown> = {};
      if (config.TIKTOK_MODE === "DIRECT_POST") creator = await publisher.queryCreatorInfo();
      const externalAccountId = tokens.openId ?? stringValue(creator.open_id) ?? "tiktok-account";
      const displayName = stringValue(creator.display_name) ?? stringValue(creator.creator_nickname) ?? "TikTok account";
      await saveConnection(config, "TIKTOK", { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenExpiresAt: tokenExpiry(tokens.expiresIn), externalAccountId, displayName }, state.channelId, store);
      return redirectToDashboard(config, reply, "TIKTOK", true);
    } catch (error) {
      request.log.error({ err: error instanceof Error ? error.message : "unknown TikTok OAuth callback error" }, "TikTok OAuth callback failed");
      return redirectToDashboard(config, reply, "TIKTOK", false);
    }
  });
}

function remember(platform: PendingOAuth["platform"], channelId: string, codeVerifier?: string): string {
  const state = randomBytes(32).toString("hex");
  pending.set(state, { platform, channelId, createdAt: Date.now(), codeVerifier });
  return state;
}

function consume(value: string | undefined, platform: PendingOAuth["platform"]): PendingOAuth | undefined {
  if (!value) return undefined;
  const item = pending.get(value);
  pending.delete(value);
  if (!item || item.platform !== platform || Date.now() - item.createdAt > stateLifetimeMs) return undefined;
  return item;
}

async function saveConnection(config: AppConfig, platform: Extract<Platform, "YOUTUBE" | "TIKTOK">, credential: StoredPlatformCredential, channelId: string, store: DomainStore): Promise<void> {
  const credentials = await readStoredPlatformCredentials(config.PLATFORM_CREDENTIALS_FILE, config.APP_ENCRYPTION_KEY);
  credentials[platform] = credential;
  await writeStoredPlatformCredentials(config.PLATFORM_CREDENTIALS_FILE, config.APP_ENCRYPTION_KEY, credentials);
  const accounts = await store.listPlatformAccounts({ page: 1, pageSize: 100 });
  const existing = accounts.items.find((account) => account.channelId === channelId && account.platform === platform && account.externalAccountId === credential.externalAccountId);
  const input = { status: "CONNECTED", displayName: credential.displayName ?? `${platform} account`, credentialsReference: "local-encrypted-file", tokenExpiresAt: credential.tokenExpiresAt };
  if (existing) await store.updatePlatformAccount(existing.id, input);
  else await store.createPlatformAccount({ channelId, platform, externalAccountId: credential.externalAccountId ?? `${platform.toLowerCase()}-account`, ...input });
}

function parseChannelId(value: string | undefined): string | undefined {
  const parsed = channelIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function tokenExpiry(expiresIn: number | undefined): string | undefined { return typeof expiresIn === "number" ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined; }

function redirectToDashboard(config: AppConfig, reply: { redirect: (url: string) => unknown }, platform: "YOUTUBE" | "TIKTOK", connected: boolean): unknown {
  const url = new URL(config.DASHBOARD_URL);
  url.searchParams.set("integration", platform.toLowerCase());
  url.searchParams.set("connected", connected ? "1" : "0");
  return reply.redirect(url.toString());
}
