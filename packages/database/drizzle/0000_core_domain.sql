CREATE TYPE "public"."candidate_status" AS ENUM('DISCOVERED', 'ANALYZING', 'QUALIFIED', 'REJECTED', 'SELECTED', 'PROCESSING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."channel_status" AS ENUM('ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."channel_type" AS ENUM('TUTORIAL', 'STREAMER_COMMENTARY', 'CREATOR_STORY', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('YOUTUBE', 'TIKTOK', 'INSTAGRAM');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."rights_status" AS ENUM('OWNED', 'LICENSED', 'CREATIVE_COMMONS', 'PUBLIC_DOMAIN', 'COMMENTARY_REVIEW', 'UNKNOWN', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'EDITOR', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('PLANNED', 'RENDERING', 'RENDERED', 'QC_FAILED', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL_FAILURE', 'FAILED');--> statement-breakpoint
CREATE TABLE "analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"watch_time" real,
	"avg_watch_duration" real,
	"completion_rate" real,
	"followers_gained" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"scope_id" text NOT NULL,
	"period" text NOT NULL,
	"budget_eur" real NOT NULL,
	"spent_eur" real DEFAULT 0 NOT NULL,
	"reserved_eur" real DEFAULT 0 NOT NULL,
	"warning_threshold" real DEFAULT 0.75 NOT NULL,
	"hard_stop" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"source_asset_id" uuid,
	"status" "candidate_status" DEFAULT 'DISCOVERED' NOT NULL,
	"topic" text NOT NULL,
	"score_total" real DEFAULT 0 NOT NULL,
	"score_recency" real DEFAULT 0 NOT NULL,
	"score_engagement" real DEFAULT 0 NOT NULL,
	"score_velocity" real DEFAULT 0 NOT NULL,
	"score_relevance" real DEFAULT 0 NOT NULL,
	"score_novelty" real DEFAULT 0 NOT NULL,
	"score_rights" real DEFAULT 0 NOT NULL,
	"analysis_json" jsonb,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" "channel_type" NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "channel_status" DEFAULT 'ACTIVE' NOT NULL,
	"videos_per_day" integer DEFAULT 6 NOT NULL,
	"min_duration" integer DEFAULT 18 NOT NULL,
	"max_duration" integer DEFAULT 45 NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"manual_review_required" boolean DEFAULT true NOT NULL,
	"monthly_budget" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"hook" text NOT NULL,
	"script" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"hashtags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edit_plan_json" jsonb NOT NULL,
	"voiceover_required" boolean DEFAULT false NOT NULL,
	"target_duration" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"service" text NOT NULL,
	"operation" text NOT NULL,
	"channel_id" uuid,
	"candidate_id" uuid,
	"video_id" uuid,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text NOT NULL,
	"estimated_cost_eur" real DEFAULT 0 NOT NULL,
	"actual_cost_eur" real,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"job_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_id" uuid,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error" text,
	"metadata_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"external_account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"credentials_reference" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"platform_account_id" uuid,
	"platform" "platform" NOT NULL,
	"status" "publication_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_post_id" text,
	"external_url" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text NOT NULL,
	"storage_key" text,
	"title" text NOT NULL,
	"description" text,
	"duration_seconds" real,
	"published_at" timestamp with time zone,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"comments" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"language" text,
	"rights_status" "rights_status" DEFAULT 'UNKNOWN' NOT NULL,
	"metadata_json" jsonb,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"platform" "platform",
	"rights_status" "rights_status" DEFAULT 'UNKNOWN' NOT NULL,
	"creator" text,
	"notes" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_asset_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"language" text NOT NULL,
	"text" text NOT NULL,
	"segments_json" jsonb NOT NULL,
	"confidence" real,
	"cost_eur" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'VIEWER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"candidate_id" uuid,
	"content_plan_id" uuid,
	"status" "video_status" DEFAULT 'PLANNED' NOT NULL,
	"storage_key" text,
	"thumbnail_key" text,
	"duration" real,
	"width" integer,
	"height" integer,
	"file_size" integer,
	"content_hash" text,
	"render_version" integer DEFAULT 1 NOT NULL,
	"quality_score" real,
	"rights_status" "rights_status" DEFAULT 'UNKNOWN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_snapshots" ADD CONSTRAINT "analytics_snapshots_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_source_asset_id_source_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."source_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "costs" ADD CONSTRAINT "costs_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_assets" ADD CONSTRAINT "source_assets_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_source_asset_id_source_assets_id_fk" FOREIGN KEY ("source_asset_id") REFERENCES "public"."source_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_content_plan_id_content_plans_id_fk" FOREIGN KEY ("content_plan_id") REFERENCES "public"."content_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_scope_scope_id_period_unique" ON "budgets" USING btree ("scope","scope_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_channel_topic_unique" ON "candidates" USING btree ("channel_id","topic");--> statement-breakpoint
CREATE UNIQUE INDEX "channels_slug_unique" ON "channels" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_channel_platform_external_unique" ON "platform_accounts" USING btree ("channel_id","platform","external_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publications_video_platform_unique" ON "publications" USING btree ("video_id","platform");--> statement-breakpoint
CREATE UNIQUE INDEX "source_assets_source_external_unique" ON "source_assets" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_assets_content_hash_unique" ON "source_assets" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_url_unique" ON "sources" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");