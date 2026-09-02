import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalStorageProvider } from "./index.js";

describe("LocalStorageProvider", () => {
  it("stores objects and refuses path traversal", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "shortfactory-storage-"));
    const input = path.join(root, "input.txt");
    await writeFile(input, "shortfactory");
    const storage = new LocalStorageProvider(path.join(root, "objects"));

    await expect(storage.put("raw/input.txt", input, { kind: "fixture" })).resolves.toMatchObject({ key: "raw/input.txt", size: 12 });
    await expect(storage.get("raw/input.txt")).resolves.toEqual(Buffer.from("shortfactory"));
    await expect(storage.put("../escape.txt", input)).rejects.toThrow("unsafe");
  });
});
