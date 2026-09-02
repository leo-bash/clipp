import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { FFmpegRenderer } from "./index.js";

const execFileAsync = promisify(execFile);

describe("FFmpegRenderer", () => {
  it("turns a landscape fixture into a QC-passing vertical MP4", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-video-"));
    const inputPath = path.join(directory, "landscape.mp4");
    const outputPath = path.join(directory, "vertical.mp4");

    try {
      await execFileAsync("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=1280x720:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
        "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", inputPath,
      ]);

      const result = await new FFmpegRenderer().render(
        { inputPath, outputPath, audioRequired: true },
        { width: 1080, height: 1920, minDuration: 1, maxDuration: 3, audioRequired: true, maxFileSizeBytes: 100 * 1024 * 1024 },
      );

      expect(result.qc.passed).toBe(true);
      expect(result.probe.streams.find((stream) => stream.codecType === "video")).toMatchObject({ codecName: "h264", width: 1080, height: 1920 });
      expect(result.probe.streams.find((stream) => stream.codecType === "audio")).toMatchObject({ codecName: "aac" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
