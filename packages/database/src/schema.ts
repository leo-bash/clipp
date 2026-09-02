import { relations } from "drizzle-orm";
import { boolean, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { candidateStatuses, channelStatuses, channelTypes, platforms, publicationStatuses, rightsStatuses, roles, videoStatuses } from "@shortfactory/shared";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const roleEnum = pgEnum("role", roles);
export const channelTypeEnum = pgEnum("channel_type", channelTypes);
export const channelStatusEnum = pgEnum("channel_status", channelStatuses);
export const platformEnum = pgEnum("platform", platforms);
export const rightsStatusEnum = pgEnum("rights_status", rightsStatuses);
export const candidateStatusEnum = pgEnum("candidate_status", candidateStatuses);
export const videoStatusEnum = pgEnum("video_status", videoStatuses);
export const publicationStatusEnum = pgEnum("publication_status", publicationStatuses);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("VIEWER"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ emailUnique: uniqueIndex("users_email_unique").on(table.email) }));

export const channels = pgTable("channels", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: channelTypeEnum("type").notNull(),
  language: text("language").notNull().default("en"),
  timezone: text("timezone").notNull().default("UTC"),
  status: channelStatusEnum("status").notNull().default("ACTIVE"),
  videosPerDay: integer("videos_per_day").notNull().default(6),
  minDuration: integer("min_duration").notNull().default(18),
  maxDuration: integer("max_duration").notNull().default(45),
  autoPublish: boolean("auto_publish").notNull().default(false),
  manualReviewRequired: boolean("manual_review_required").notNull().default(true),
  monthlyBudget: real("monthly_budget").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ slugUnique: uniqueIndex("channels_slug_unique").on(table.slug) }));

export const platformAccounts = pgTable("platform_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  platform: platformEnum("platform").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("DISCONNECTED"),
  credentialsReference: text("credentials_reference"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ accountUnique: uniqueIndex("platform_accounts_channel_platform_external_unique").on(table.channelId, table.platform, table.externalAccountId) }));

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  platform: platformEnum("platform"),
  rightsStatus: rightsStatusEnum("rights_status").notNull().default("UNKNOWN"),
  creator: text("creator"),
  notes: text("notes"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ urlUnique: uniqueIndex("sources_url_unique").on(table.url) }));

export const sourceAssets = pgTable("source_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  sourceUrl: text("source_url").notNull(),
  storageKey: text("storage_key"),
  title: text("title").notNull(),
  description: text("description"),
  durationSeconds: real("duration_seconds"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).defaultNow().notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  language: text("language"),
  rightsStatus: rightsStatusEnum("rights_status").notNull().default("UNKNOWN"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  contentHash: text("content_hash"),
  createdAt: createdAt()
}, (table) => ({ externalUnique: uniqueIndex("source_assets_source_external_unique").on(table.sourceId, table.externalId), hashUnique: uniqueIndex("source_assets_content_hash_unique").on(table.contentHash) }));

export const candidates = pgTable("candidates", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  sourceAssetId: uuid("source_asset_id").references(() => sourceAssets.id, { onDelete: "set null" }),
  status: candidateStatusEnum("status").notNull().default("DISCOVERED"),
  topic: text("topic").notNull(),
  scoreTotal: real("score_total").notNull().default(0),
  scoreRecency: real("score_recency").notNull().default(0),
  scoreEngagement: real("score_engagement").notNull().default(0),
  scoreVelocity: real("score_velocity").notNull().default(0),
  scoreRelevance: real("score_relevance").notNull().default(0),
  scoreNovelty: real("score_novelty").notNull().default(0),
  scoreRights: real("score_rights").notNull().default(0),
  analysisJson: jsonb("analysis_json").$type<Record<string, unknown>>(),
  rejectionReason: text("rejection_reason"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ channelTopicUnique: uniqueIndex("candidates_channel_topic_unique").on(table.channelId, table.topic) }));

export const transcripts = pgTable("transcripts", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceAssetId: uuid("source_asset_id").notNull().references(() => sourceAssets.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  language: text("language").notNull(),
  text: text("text").notNull(),
  segmentsJson: jsonb("segments_json").$type<unknown[]>().notNull(),
  confidence: real("confidence"),
  costEur: real("cost_eur").notNull().default(0),
  createdAt: createdAt()
});

export const contentPlans = pgTable("content_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  hook: text("hook").notNull(),
  script: text("script").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  hashtagsJson: jsonb("hashtags_json").$type<string[]>().notNull().default([]),
  editPlanJson: jsonb("edit_plan_json").$type<Record<string, unknown>>().notNull(),
  voiceoverRequired: boolean("voiceover_required").notNull().default(false),
  targetDuration: integer("target_duration").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const videos = pgTable("videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  channelId: uuid("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  contentPlanId: uuid("content_plan_id").references(() => contentPlans.id, { onDelete: "set null" }),
  status: videoStatusEnum("status").notNull().default("PLANNED"),
  storageKey: text("storage_key"),
  thumbnailKey: text("thumbnail_key"),
  duration: real("duration"),
  width: integer("width"),
  height: integer("height"),
  fileSize: integer("file_size"),
  contentHash: text("content_hash"),
  renderVersion: integer("render_version").notNull().default(1),
  qualityScore: real("quality_score"),
  rightsStatus: rightsStatusEnum("rights_status").notNull().default("UNKNOWN"),
  createdAt: createdAt(),
  updatedAt: updatedAt()
});

export const publications = pgTable("publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "cascade" }),
  platformAccountId: uuid("platform_account_id").references(() => platformAccounts.id, { onDelete: "set null" }),
  platform: platformEnum("platform").notNull(),
  status: publicationStatusEnum("status").notNull().default("SCHEDULED"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  externalPostId: text("external_post_id"),
  externalUrl: text("external_url"),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt()
}, (table) => ({ videoPlatformUnique: uniqueIndex("publications_video_platform_unique").on(table.videoId, table.platform) }));

export const analyticsSnapshots = pgTable("analytics_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicationId: uuid("publication_id").notNull().references(() => publications.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  watchTime: real("watch_time"),
  avgWatchDuration: real("avg_watch_duration"),
  completionRate: real("completion_rate"),
  followersGained: integer("followers_gained").notNull().default(0),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>()
});

export const costs = pgTable("costs", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  operation: text("operation").notNull(),
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
  videoId: uuid("video_id").references(() => videos.id, { onDelete: "set null" }),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull(),
  estimatedCostEur: real("estimated_cost_eur").notNull().default(0),
  actualCostEur: real("actual_cost_eur"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
  createdAt: createdAt()
});

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: text("scope").notNull(),
  scopeId: text("scope_id").notNull(),
  period: text("period").notNull(),
  budgetEur: real("budget_eur").notNull(),
  spentEur: real("spent_eur").notNull().default(0),
  reservedEur: real("reserved_eur").notNull().default(0),
  warningThreshold: real("warning_threshold").notNull().default(0.75),
  hardStop: boolean("hard_stop").notNull().default(true),
  createdAt: createdAt()
}, (table) => ({ scopePeriodUnique: uniqueIndex("budgets_scope_scope_id_period_unique").on(table.scope, table.scopeId, table.period) }));

export const jobsAudit = pgTable("jobs_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  queue: text("queue").notNull(),
  jobId: text("job_id").notNull(),
  type: text("type").notNull(),
  entityId: uuid("entity_id"),
  status: text("status").notNull(),
  attempt: integer("attempt").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
  metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>()
});

export const schema = { users, channels, platformAccounts, sources, sourceAssets, candidates, transcripts, contentPlans, videos, publications, analyticsSnapshots, costs, budgets, jobsAudit };

export const channelRelations = relations(channels, ({ many }) => ({ platformAccounts: many(platformAccounts), candidates: many(candidates), videos: many(videos) }));
