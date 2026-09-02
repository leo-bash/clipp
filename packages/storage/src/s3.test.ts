import { describe, expect, it } from "vitest";
import { LocalStorageProvider, S3StorageProvider, createConfiguredStorageProvider } from "./index.js";

describe("S3-compatible storage boundary", () => {
  it("rejects unsafe remote keys before making an SDK call", async () => {
    const storage = new S3StorageProvider({ bucket: "bucket", endpoint: "https://r2.example", accessKeyId: "access", secretAccessKey: "secret" });
    await expect(storage.head("../escape")).rejects.toThrow("unsafe");
  });

  it("uses local storage until all remote credentials are configured", () => {
    const storage = createConfiguredStorageProvider({ root: "/tmp/shortfactory-storage", endpoint: "https://r2.example", bucket: "bucket" });
    expect(storage).toBeInstanceOf(LocalStorageProvider);
  });

  it("selects the S3-compatible provider for complete R2 configuration", () => {
    const storage = createConfiguredStorageProvider({ root: "/tmp/shortfactory-storage", endpoint: "https://r2.example", bucket: "bucket", accessKeyId: "access", secretAccessKey: "secret" });
    expect(storage).toBeInstanceOf(S3StorageProvider);
  });
});
