export type ServiceMode = "memory" | "postgres" | "mock" | "redis";

export * from "./domain.js";

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

import { randomUUID } from "node:crypto";

export function buildCorrelationId(): string {
  return randomUUID();
}
