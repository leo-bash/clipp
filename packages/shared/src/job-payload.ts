export type JobRecord = Record<string, unknown>;

export function asJobRecord(value: unknown): JobRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JobRecord : undefined;
}

export function jobString(payload: JobRecord | undefined, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function jobNumber(payload: JobRecord | undefined, key: string): number | undefined {
  const value = payload?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
