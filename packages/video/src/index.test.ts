import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { FFmpegRenderer, runQualityControl } from "./index.js";

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

  it("renders the optional blurred background composition", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-video-blur-"));
    const inputPath = path.join(directory, "source.mp4");
    const outputPath = path.join(directory, "blurred.mp4");
    try {
      await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x243b35:s=1280x720:d=1:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", inputPath]);
      const result = await new FFmpegRenderer().render({ inputPath, outputPath, backgroundBlur: true }, { width: 1080, height: 1920, minDuration: 1, maxDuration: 3, audioRequired: false, maxFileSizeBytes: 10 * 1024 * 1024 });
      expect(result.qc.passed).toBe(true);
      expect(result.probe.streams.find((stream) => stream.codecType === "video")).toMatchObject({ codecName: "h264", width: 1080, height: 1920 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("keeps cuts synchronized in the blurred background composition", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-video-blur-cuts-"));
    const inputPath = path.join(directory, "source.mp4");
    const outputPath = path.join(directory, "blurred-cut.mp4");
    try {
      await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x243b35:s=1280x720:d=2:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", inputPath]);
      const result = await new FFmpegRenderer().render({ inputPath, outputPath, backgroundBlur: true, cuts: [{ start: 0.5, end: 1.5 }] }, { width: 1080, height: 1920, minDuration: 0.5, maxDuration: 2, audioRequired: false, maxFileSizeBytes: 10 * 1024 * 1024 });
      expect(result.qc.passed).toBe(true);
      expect(result.probe.format.duration).toBeCloseTo(1, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("supports bounded zoom and cut ranges", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-video-cuts-"));
    const inputPath = path.join(directory, "source.mp4");
    const outputPath = path.join(directory, "cut.mp4");
    try {
      await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x243b35:s=1280x720:d=2:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", inputPath]);
      const result = await new FFmpegRenderer().render({ inputPath, outputPath, zoom: 1.1, cuts: [{ start: 0, end: 1 }] }, { width: 1080, height: 1920, minDuration: 0.5, maxDuration: 2, audioRequired: false, maxFileSizeBytes: 10 * 1024 * 1024 });
      expect(result.qc.passed).toBe(true);
      expect(result.probe.format.duration).toBeCloseTo(1, 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);

  it("fails critical QC for an all-black video", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-video-black-"));
    const inputPath = path.join(directory, "black.mp4");
    try {
      await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=1080x1920:d=1:r=30", "-c:v", "libx264", "-pix_fmt", "yuv420p", inputPath]);
      const result = await runQualityControl(inputPath, { width: 1080, height: 1920, minDuration: 0.5, maxDuration: 2, audioRequired: false, maxFileSizeBytes: 10 * 1024 * 1024 });
      expect(result.passed).toBe(false);
      expect(result.checks.find((check) => check.name === "black_video")).toMatchObject({ passed: false, critical: true });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
