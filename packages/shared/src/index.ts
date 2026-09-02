export type ServiceMode = "memory" | "postgres" | "mock" | "redis";

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

import { randomUUID } from "node:crypto";

export function buildCorrelationId(): string {
  return randomUUID();
}
