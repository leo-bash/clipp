export const channelTypes = ["TUTORIAL", "STREAMER_COMMENTARY", "CREATOR_STORY", "CUSTOM"] as const;
export type ChannelType = (typeof channelTypes)[number];

export const channelStatuses = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ChannelStatus = (typeof channelStatuses)[number];

export const platforms = ["YOUTUBE", "TIKTOK", "INSTAGRAM"] as const;
export type Platform = (typeof platforms)[number];

export const defaultPublishingSlots = ["08:00", "10:30", "13:00", "15:30", "18:00", "20:30"] as const;

export const rightsStatuses = ["OWNED", "LICENSED", "CREATIVE_COMMONS", "PUBLIC_DOMAIN", "COMMENTARY_REVIEW", "UNKNOWN", "BLOCKED"] as const;
export type RightsStatus = (typeof rightsStatuses)[number];

export const candidateStatuses = ["DISCOVERED", "ANALYZING", "QUALIFIED", "REJECTED", "SELECTED", "PROCESSING", "COMPLETED"] as const;
export type CandidateStatus = (typeof candidateStatuses)[number];

export const videoStatuses = ["PLANNED", "RENDERING", "RENDERED", "QC_FAILED", "READY_FOR_REVIEW", "APPROVED", "REJECTED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL_FAILURE", "FAILED"] as const;
export type VideoStatus = (typeof videoStatuses)[number];

export const publicationStatuses = ["SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED", "CANCELLED"] as const;
export type PublicationStatus = (typeof publicationStatuses)[number];

export const roles = ["ADMIN", "EDITOR", "VIEWER"] as const;
export type Role = (typeof roles)[number];

export interface Channel {
  id: string;
  name: string;
  slug: string;
  type: ChannelType;
  language: string;
  timezone: string;
  status: ChannelStatus;
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
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  channelId: string;
  sourceAssetId?: string;
  status: CandidateStatus;
  topic: string;
  scoreTotal: number;
  analysis?: Record<string, unknown>;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Video {
  id: string;
  channelId: string;
  candidateId?: string;
  contentPlanId?: string;
  status: VideoStatus;
  storageKey?: string;
  thumbnailKey?: string;
  duration?: number;
  width?: number;
  height?: number;
  fileSize?: number;
  contentHash?: string;
  renderVersion: number;
  qualityScore?: number;
  rightsStatus: RightsStatus;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Publication {
  id: string;
  videoId: string;
  platformAccountId?: string;
  platform: Platform;
  status: PublicationStatus;
  scheduledAt?: string;
  publishedAt?: string;
  externalPostId?: string;
  externalUrl?: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cost {
  id: string;
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
  createdAt: string;
}

export interface Budget {
  id: string;
  scope: string;
  scopeId: string;
  period: string;
  budgetEur: number;
  spentEur: number;
  reservedEur: number;
  warningThreshold: number;
  hardStop: boolean;
  createdAt: string;
  updatedAt?: string;
}
