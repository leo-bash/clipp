import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sha256File } from "@shortfactory/discovery";
import type { DomainStore } from "@shortfactory/database";
import { FFmpegRenderer } from "@shortfactory/video";
import type { StorageProvider } from "@shortfactory/storage";
import { RenderError, ValidationError } from "@shortfactory/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const testPipelineSchema = z.object({ candidateId: z.string().uuid() });

export async function registerPipelineRoutes(server: FastifyInstance, store: DomainStore, storage: StorageProvider, prefix = ""): Promise<void> {
  server.post(`${prefix}/pipeline/test`, async (request) => {
    const { candidateId } = testPipelineSchema.parse(request.body);
    const video = await runTestPipeline(store, storage, candidateId);
    return { video, previewUrl: video.storageKey ? `/media/${video.storageKey}` : undefined, thumbnailUrl: video.thumbnailKey ? `/media/${video.thumbnailKey}` : undefined };
  });

  server.get<{ Params: { "*": string } }>(`${prefix}/media/*`, async (request, reply) => {
    const key = request.params["*"];
    if (!key) throw new ValidationError("media key is required");
    const data = await storage.get(key);
    const contentType = key.endsWith(".jpg") || key.endsWith(".jpeg") ? "image/jpeg" : "video/mp4";
    return reply.type(contentType).send(data);
  });
}

async function runTestPipeline(store: DomainStore, storage: StorageProvider, candidateId: string) {
  const candidate = (await store.listCandidates({ page: 1, pageSize: 1000 })).items.find((item) => item.id === candidateId);
  if (!candidate) throw new ValidationError("candidate was not found");
  const channel = await store.getChannel(candidate.channelId);
  if (!channel) throw new ValidationError("candidate channel was not found");
  await store.analyzeCandidate(candidate.id);
  await store.planCandidate(candidate.id);
  const video = await store.createVideo({ channelId: channel.id, candidateId: candidate.id, rightsStatus: "OWNED", metadata: { title: candidate.topic, description: `Test pipeline for ${channel.name}`, pipeline: "demo" } });
  const directory = await mkdtemp(path.join(os.tmpdir(), "shortfactory-api-pipeline-"));
  const inputPath = path.join(directory, "source.mp4");
  const outputPath = path.join(directory, "render.mp4");
  const thumbnailPath = path.join(directory, "thumbnail.jpg");
  try {
    await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x243b35:s=1280x720:d=2:r=30", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", inputPath], { maxBuffer: 2 * 1024 * 1024 });
    const result = await new FFmpegRenderer().render({ inputPath, outputPath, metadata: { title: candidate.topic }, thumbnailOutputPath: thumbnailPath }, { width: 1080, height: 1920, minDuration: 1, maxDuration: 60, audioRequired: true, maxFileSizeBytes: 100 * 1024 * 1024 });
    if (!result.qc.passed) throw new RenderError("test pipeline render failed QC");
    const contentHash = await sha256File(outputPath);
    const stored = await storage.put(`videos/${video.id}/render-v${video.renderVersion}.mp4`, outputPath, { contentHash, rightsStatus: "OWNED" });
    const thumbnail = await storage.put(`videos/${video.id}/thumbnail-v${video.renderVersion}.jpg`, thumbnailPath, { contentHash });
    return (await store.markVideoRendered(video.id, { storageKey: stored.key, thumbnailKey: thumbnail.key, duration: result.probe.format.duration ?? 0, width: 1080, height: 1920, fileSize: stored.size, contentHash, qualityScore: result.qc.score, metadata: { title: candidate.topic, description: `Test pipeline for ${channel.name}`, pipeline: "demo", qc: result.qc } })) ?? video;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
