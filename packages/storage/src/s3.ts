import { readFile } from "node:fs/promises";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ValidationError } from "@shortfactory/shared";
import type { RetentionPolicy, StorageObject, StorageProvider } from "./index.js";

export interface S3StorageOptions {
  bucket: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  public constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({ endpoint: options.endpoint, region: options.region ?? "auto", forcePathStyle: options.forcePathStyle ?? true, credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } });
  }

  public async put(key: string, sourcePath: string, metadata: Record<string, string> = {}): Promise<StorageObject> {
    this.validateKey(key);
    const body = await readFile(sourcePath);
    await this.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: body, Metadata: metadata }));
    return { key, path: this.remotePath(key), size: body.byteLength, metadata };
  }

  public async get(key: string): Promise<Buffer> {
    this.validateKey(key);
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
    if (!response.Body) throw new Error(`storage object ${key} has no body`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  public async delete(key: string): Promise<void> {
    this.validateKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }

  public async head(key: string): Promise<StorageObject | undefined> {
    this.validateKey(key);
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return { key, path: this.remotePath(key), size: response.ContentLength ?? 0, metadata: response.Metadata ?? {} };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
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

  private validateKey(key: string): void {
    if (!key || key.includes("\0") || key.startsWith("/") || key.split("/").includes("..")) throw new ValidationError("storage key is unsafe");
  }

  private remotePath(key: string): string {
    return `s3://${this.options.bucket}/${key}`;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
}
