import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RedditDiscoveryProvider, redditThemes } from "@shortfactory/discovery";
import type { AppConfig } from "@shortfactory/config";
import type { DomainStore } from "@shortfactory/database";
import type { QueueClient } from "@shortfactory/queue";
import { buildCorrelationId } from "@shortfactory/shared";

export const scheduleBands = {
  EUROPE_MORNING: { timezone: "Europe/Rome", time: "09:00", label: "Europe · morning (08:00–10:00)" },
  EUROPE_LUNCH: { timezone: "Europe/Rome", time: "13:00", label: "Europe · lunch (12:00–14:00)" },
  EUROPE_EVENING: { timezone: "Europe/Rome", time: "19:30", label: "Europe · evening (18:00–21:00)" },
  US_LUNCH: { timezone: "America/New_York", time: "13:00", label: "US Eastern · lunch (12:00–14:00)" },
  US_EVENING: { timezone: "America/New_York", time: "19:30", label: "US Eastern · evening (18:00–21:00)" },
  US_LATE: { timezone: "America/New_York", time: "22:00", label: "US Eastern · late evening (21:00–23:00)" },
} as const;
const scheduleBandNames = Object.keys(scheduleBands) as [keyof typeof scheduleBands, ...(keyof typeof scheduleBands)[]];

const proposalSchema = z.object({
  channelId: z.string().uuid(),
  theme: z.string().trim().min(1).max(40).default("rotation"),
  limit: z.number().int().min(5).max(30).default(10),
});

const dailyPlanSchema = z.object({
  channelId: z.string().uuid(),
  selectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  items: z.array(z.object({ candidateId: z.string().uuid(), band: z.enum(scheduleBandNames), platforms: z.array(z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM"])).min(1).max(3) })).length(5),
});

export async function registerRedditRoutes(server: FastifyInstance, config: AppConfig, store: DomainStore, queue: QueueClient, prefix = "/api/v1"): Promise<void> {
  server.post(`${prefix}/reddit/proposals`, async (request, reply) => {
    const input = proposalSchema.parse(request.body);
    if (!(await store.getChannel(input.channelId))) return reply.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const theme = input.theme.toLowerCase() === "rotation" ? (redditThemes[Math.floor(Math.random() * redditThemes.length)] ?? "highschool") : input.theme.toLowerCase();
    const provider = new RedditDiscoveryProvider({
      accessToken: config.REDDIT_ACCESS_TOKEN,
      clientId: config.REDDIT_CLIENT_ID,
      clientSecret: config.REDDIT_CLIENT_SECRET,
      userAgent: config.REDDIT_USER_AGENT,
      oauthBaseUrl: config.REDDIT_OAUTH_BASE_URL,
      publicBaseUrl: config.REDDIT_BASE_URL,
      minScore: config.REDDIT_MIN_SCORE,
      maxSourceCharacters: config.REDDIT_MAX_SOURCE_CHARACTERS,
      allowNsfw: config.REDDIT_ALLOW_NSFW,
    });
    const proposals = await provider.discover(theme, 10);
    const existing = await store.listCandidates({ page: 1, pageSize: 1000 });
    const existingPostIds = new Set(existing.items.map((candidate) => typeof candidate.analysis?.redditPostId === "string" ? candidate.analysis.redditPostId : ""));
    const existingTopics = new Set(existing.items.filter((candidate) => candidate.channelId === input.channelId).map((candidate) => candidate.topic));
    const created = [];
    for (const proposal of proposals) {
      if (existingPostIds.has(proposal.id) || existingTopics.has(proposal.title)) continue;
      const candidate = await store.createCandidate({
        channelId: input.channelId,
        topic: proposal.title,
        scoreTotal: Math.min(100, Math.max(0, proposal.score)),
        analysis: {
          provider: "reddit",
          redditPostId: proposal.id,
          subreddit: proposal.subreddit,
          permalink: proposal.permalink,
          score: proposal.score,
          createdUtc: proposal.createdUtc,
          theme: proposal.theme,
          sourceText: proposal.selftext,
          proposedAt: new Date().toISOString(),
        },
      });
      created.push(candidate);
      existingPostIds.add(proposal.id);
      existingTopics.add(proposal.title);
    }
    return { items: created, theme, fetched: proposals.length, created: created.length, skipped: proposals.length - created.length };
  });

  server.get(`${prefix}/reddit/schedule-options`, async () => ({ items: Object.entries(scheduleBands).map(([id, value]) => ({ id, ...value })) }));

  server.post(`${prefix}/reddit/daily-plan`, async (request, reply) => {
    const input = dailyPlanSchema.parse(request.body);
    if (!(await store.getChannel(input.channelId))) return reply.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const ids = new Set(input.items.map((item) => item.candidateId));
    if (ids.size !== input.items.length) return reply.code(400).send({ error: "DUPLICATE_CANDIDATE", message: "Choose five different Reddit stories." });
    const candidates = await store.listCandidates({ page: 1, pageSize: 1000 });
    const candidateById = new Map(candidates.items.map((candidate) => [candidate.id, candidate]));
    const planned = [];
    for (const item of input.items) {
      const candidate = candidateById.get(item.candidateId);
      const reddit = candidate?.analysis?.provider === "reddit" ? candidate.analysis : undefined;
      if (!candidate || candidate.channelId !== input.channelId || !reddit) return reply.code(400).send({ error: "INVALID_REDDIT_CANDIDATE", message: "All five choices must be Reddit proposals from the selected channel." });
      const band = scheduleBands[item.band];
      const scheduledAt = zonedLocalToIso(input.selectionDate, band.time, band.timezone);
      const scheduledCandidate = await store.scheduleCandidate(candidate.id, { selectionDate: input.selectionDate, scheduledAt, timezone: band.timezone, timeBand: item.band, platforms: item.platforms });
      if (!scheduledCandidate) return reply.code(404).send({ error: "CANDIDATE_NOT_FOUND" });
      const job = {
        name: "generate-reddit-story-and-schedule-upload",
        payload: {
          candidateId: candidate.id,
          channelId: input.channelId,
          selectionDate: input.selectionDate,
          scheduledAt,
          timezone: band.timezone,
          timeBand: item.band,
          platforms: item.platforms,
          title: candidate.topic,
          sourceUrl: typeof reddit.permalink === "string" ? reddit.permalink : undefined,
          sourceText: typeof reddit.sourceText === "string" ? reddit.sourceText : undefined,
        },
        correlationId: buildCorrelationId(),
        idempotencyKey: `reddit-daily:${input.selectionDate}:${candidate.id}`,
        priority: 5,
      };
      await queue.enqueue("reddit-generation", job);
      planned.push({ candidate: scheduledCandidate, scheduledAt, timezone: band.timezone, timeBand: band.label, platforms: item.platforms });
    }
    return { selectionDate: input.selectionDate, planned, queued: planned.length, queue: "reddit-generation" };
  });
}

export function zonedLocalToIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    const localAsUtc = Date.UTC(values.year ?? 1970, (values.month ?? 1) - 1, values.day ?? 1, values.hour ?? 0, values.minute ?? 0);
    candidate = target - (localAsUtc - candidate);
  }
  return new Date(candidate).toISOString();
}
