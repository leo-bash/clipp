import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface StoredPlatformCredential {
  accessToken: string;
  refreshToken?: string;
  externalAccountId?: string;
  displayName?: string;
  tokenExpiresAt?: string;
}

export interface StoredPlatformCredentials {
  YOUTUBE?: StoredPlatformCredential;
  TIKTOK?: StoredPlatformCredential;
}

const algorithm = "aes-256-gcm";

export async function readStoredPlatformCredentials(filePath: string, encryptionKey: string): Promise<StoredPlatformCredentials> {
  try {
    const encoded = await readFile(filePath, "utf8");
    const payload = JSON.parse(encoded) as { iv?: string; tag?: string; data?: string };
    if (!payload.iv || !payload.tag || !payload.data) return {};
    const decipher = createDecipheriv(algorithm, keyFrom(encryptionKey), Buffer.from(payload.iv, "base64"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(payload.data, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as StoredPlatformCredentials;
  } catch {
    return {};
  }
}

export async function writeStoredPlatformCredentials(filePath: string, encryptionKey: string, credentials: StoredPlatformCredentials): Promise<void> {
  await mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, keyFrom(encryptionKey), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  const payload = JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") });
  await writeFile(filePath, payload, { encoding: "utf8", mode: 0o600 });
  await chmod(path.resolve(filePath), 0o600);
}

function keyFrom(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
