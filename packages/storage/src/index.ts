import { copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "@shortfactory/shared";

export interface StorageObject {
  key: string;
  path: string;
  size: number;
  metadata: Record<string, string>;
}

export interface StorageProvider {
  put(key: string, sourcePath: string, metadata?: Record<string, string>): Promise<StorageObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<StorageObject | undefined>;
}

export interface RetentionPolicy {
  key: string;
  expiresAt: Date;
  legalHold?: boolean;
  preserve?: boolean;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly metadata = new Map<string, Record<string, string>>();
  private readonly root: string;

  public constructor(root: string) { this.root = path.resolve(root); }

  public async put(key: string, sourcePath: string, metadata: Record<string, string> = {}): Promise<StorageObject> {
    const destination = this.resolveKey(key);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(sourcePath, destination);
    this.metadata.set(key, { ...metadata });
    return this.describe(key, destination);
  }

  public async get(key: string): Promise<Buffer> { return readFile(this.resolveKey(key)); }

  public async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
    this.metadata.delete(key);
  }

  public async head(key: string): Promise<StorageObject | undefined> {
    const filePath = this.resolveKey(key);
    try { return await this.describe(key, filePath); } catch (error) { if (isMissing(error)) return undefined; throw error; }
  }

  public async cleanupExpired(policies: RetentionPolicy[], now = new Date()): Promise<string[]> {
    const deleted: string[] = [];
    for (const policy of policies) {
      if (policy.expiresAt > now || policy.legalHold || policy.preserve) continue;
      await this.delete(policy.key);
      deleted.push(policy.key);
    }
    return deleted;
  }

  private resolveKey(key: string): string {
    if (!key || key.includes("\0") || path.isAbsolute(key) || key.split(/[\\/]/u).includes("..")) throw new ValidationError("storage key is unsafe");
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) throw new ValidationError("storage key escapes storage root");
    return resolved;
  }

  private async describe(key: string, filePath: string): Promise<StorageObject> { const details = await stat(filePath); return { key, path: filePath, size: details.size, metadata: this.metadata.get(key) ?? {} }; }
}

function isMissing(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
