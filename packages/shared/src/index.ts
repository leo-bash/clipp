export type ServiceMode = "memory" | "postgres" | "mock" | "redis";

export interface OperationalControls {
  stopAllPublishing: boolean;
  stopRendering: boolean;
  stopPaidApis: boolean;
}

export const defaultOperationalControls: OperationalControls = { stopAllPublishing: false, stopRendering: false, stopPaidApis: false };

export * from "./domain.js";
export * from "./job-payload.js";

export type HealthStatus = "ok" | "degraded" | "down";

export interface DependencyHealth {
  name: string;
  status: HealthStatus;
  mode: ServiceMode;
  detail?: string;
}

export interface ReadinessResponse {
  status: HealthStatus;
  service: string;
  version: string;
  dependencies: DependencyHealth[];
  timestamp: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class ValidationError extends AppError {
  public constructor(message: string) {
    super("VALIDATION_ERROR", message);
    this.name = "ValidationError";
  }
}

export class ProviderError extends AppError {
  public constructor(message: string, retryable = true) {
    super("PROVIDER_ERROR", message, retryable);
    this.name = "ProviderError";
  }
}

export class BudgetExceededError extends AppError {
  public constructor(message = "budget limit exceeded") {
    super("BUDGET_EXCEEDED", message);
    this.name = "BudgetExceededError";
  }
}

export class RightsBlockedError extends AppError {
  public constructor(message = "asset is blocked by the rights gate") {
    super("RIGHTS_BLOCKED", message);
    this.name = "RightsBlockedError";
  }
}

export class RightsReviewRequiredError extends AppError {
  public constructor(message = "manual rights review is required") {
    super("RIGHTS_REVIEW_REQUIRED", message);
    this.name = "RightsReviewRequiredError";
  }
}

export class RenderError extends AppError {
  public constructor(message: string, retryable = false) {
    super("RENDER_ERROR", message, retryable);
    this.name = "RenderError";
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterMs?: number;

  public constructor(message = "provider rate limit exceeded", retryAfterMs?: number) {
    super("RATE_LIMITED", message, true);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class AuthenticationError extends AppError {
  public constructor(message = "authentication failed") {
    super("AUTHENTICATION_ERROR", message);
    this.name = "AuthenticationError";
  }
}

export class QuotaExceededError extends AppError {
  public constructor(message = "provider quota exceeded") {
    super("QUOTA_EXCEEDED", message);
    this.name = "QuotaExceededError";
  }
}

export class UploadError extends AppError {
  public constructor(message: string, retryable = true) {
    super("UPLOAD_ERROR", message, retryable);
    this.name = "UploadError";
  }
}

export class TransientError extends AppError {
  public constructor(message: string) {
    super("TRANSIENT_ERROR", message, true);
    this.name = "TransientError";
  }
}

export class PermanentError extends AppError {
  public constructor(message: string) {
    super("PERMANENT_ERROR", message);
    this.name = "PermanentError";
  }
}

import { randomUUID } from "node:crypto";

export function buildCorrelationId(): string {
  return randomUUID();
}
