import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DomainStore } from "@shortfactory/database";
import { scheduleBands, zonedLocalToIso } from "./reddit-routes.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const planRoot = path.join(projectRoot, ".data", "local-pipeline", "web-plans");
const runnerPath = path.join(projectRoot, "scripts", "run-local-pipeline.mjs");
const tsxPath = path.join(projectRoot, "apps", "api", "node_modules", ".bin", "tsx");
const bandNames = Object.keys(scheduleBands) as [keyof typeof scheduleBands, ...(keyof typeof scheduleBands)[]];

const localPlanSchema = z.object({
  channelId: z.string().uuid(),
  selectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  items: z.array(z.object({ candidateId: z.string().uuid(), band: z.enum(bandNames), platforms: z.array(z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM"])).min(1).max(3) })).length(5),
});

type LocalItemStatus = "QUEUED" | "GENERATING" | "GENERATED" | "WAITING_UPLOAD" | "UPLOADING" | "COMPLETED" | "FAILED";
type LocalPlanStatus = "QUEUED" | "GENERATING" | "WAITING_UPLOAD" | "UPLOADING" | "COMPLETED" | "PARTIAL_FAILURE" | "FAILED";
interface LocalPlanItem { candidateId: string; title: string; sourceUrl: string; band: string; timezone: string; scheduledAt: string; platforms: string[]; runDirectory: string; logPath: string; outputPath?: string; status: LocalItemStatus; error?: string; }
interface LocalPlan { id: string; channelId: string; selectionDate: string; createdAt: string; updatedAt: string; status: LocalPlanStatus; items: LocalPlanItem[]; }
type LocalUploadStatus = "RUNNING" | "SUCCEEDED" | "FAILED";
interface LocalUploadJob { id: string; status: LocalUploadStatus; startedAt: string; finishedAt?: string; logPath: string; output?: string; error?: string; }

const plans = new Map<string, LocalPlan>();
const uploadJobs = new Map<string, LocalUploadJob>();
let activeUploadId: string | undefined;

export async function registerLocalPipelineRoutes(server: FastifyInstance, store: DomainStore, prefix = "/api/v1"): Promise<void> {
  server.get(`${prefix}/local-pipeline/plans`, async () => ({ items: await listPlans() }));

  server.get(`${prefix}/local-pipeline/connection`, async (_request, reply) => {
    try {
      await access(runnerPath);
      await access(tsxPath);
      return { connected: true, hostname: os.hostname(), platform: process.platform, nodeVersion: process.version, command: "npm run upload" };
    } catch {
      return reply.code(503).send({ connected: false, message: "Local pipeline runner is not available on this Mac." });
    }
  });

  server.post(`${prefix}/local-pipeline/upload`, async (_request, reply) => {
    const current = activeUploadId ? uploadJobs.get(activeUploadId) : undefined;
    if (current?.status === "RUNNING") return reply.code(409).send({ error: "UPLOAD_ALREADY_RUNNING", job: current });
    const id = randomUUID();
    const job: LocalUploadJob = { id, status: "RUNNING", startedAt: new Date().toISOString(), logPath: path.join(planRoot, `dashboard-upload-${id}.log`) };
    uploadJobs.set(id, job);
    activeUploadId = id;
    void executeLocalUpload(job);
    return reply.code(202).send(job);
  });

  server.get<{ Params: { jobId: string } }>(`${prefix}/local-pipeline/upload/:jobId`, async (request, reply) => {
    const job = uploadJobs.get(request.params.jobId);
    if (!job) return reply.code(404).send({ error: "UPLOAD_JOB_NOT_FOUND" });
    return job;
  });

  server.post(`${prefix}/local-pipeline/daily`, async (request, reply) => {
    const input = localPlanSchema.parse(request.body);
    if (!(await store.getChannel(input.channelId))) return reply.code(404).send({ error: "CHANNEL_NOT_FOUND" });
    const ids = new Set(input.items.map((item) => item.candidateId));
    if (ids.size !== input.items.length) return reply.code(400).send({ error: "DUPLICATE_CANDIDATE", message: "Choose five different Reddit stories." });
    const candidatePage = await store.listCandidates({ page: 1, pageSize: 1000 });
    const byId = new Map(candidatePage.items.map((candidate) => [candidate.id, candidate]));
    const planId = randomUUID();
    const directory = path.join(planRoot, planId);
    await mkdir(directory, { recursive: true });
    const planItems: LocalPlanItem[] = [];
    for (const item of input.items) {
      const candidate = byId.get(item.candidateId);
      const analysis = candidate?.analysis?.provider === "reddit" ? candidate.analysis : undefined;
      const sourceText = typeof analysis?.sourceText === "string" ? analysis.sourceText.trim() : "";
      const sourceUrl = typeof analysis?.permalink === "string" ? analysis.permalink : "";
      if (!candidate || candidate.channelId !== input.channelId || !analysis || !sourceText || !sourceUrl) return reply.code(400).send({ error: "INVALID_REDDIT_CANDIDATE", message: "All five choices must be Reddit proposals with source text and link." });
      const band = scheduleBands[item.band];
      const scheduledAt = zonedLocalToIso(input.selectionDate, band.time, band.timezone);
      const sourceFile = path.join(directory, `${candidate.id}.json`);
      const runDirectory = path.join(directory, `run-${candidate.id}`);
      const logPath = path.join(directory, `${candidate.id}.log`);
      await writeFile(sourceFile, `${JSON.stringify({ title: candidate.topic, selftext: sourceText, permalink: sourceUrl, subreddit: analysis.subreddit, score: analysis.score, theme: analysis.theme, id: analysis.redditPostId }, null, 2)}\n`, "utf8");
      await store.scheduleCandidate(candidate.id, { selectionDate: input.selectionDate, scheduledAt, timezone: band.timezone, timeBand: item.band, platforms: item.platforms });
      planItems.push({ candidateId: candidate.id, title: candidate.topic, sourceUrl, band: band.label, timezone: band.timezone, scheduledAt, platforms: item.platforms, runDirectory, logPath, status: "QUEUED" });
    }
    const plan: LocalPlan = { id: planId, channelId: input.channelId, selectionDate: input.selectionDate, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "QUEUED", items: planItems };
    plans.set(plan.id, plan);
    await persistPlan(plan);
    void executePlan(plan);
    return reply.code(202).send(plan);
  });
}

async function executePlan(plan: LocalPlan): Promise<void> {
  plan.status = "GENERATING";
  await persistPlan(plan);
  let generatedCount = 0;
  for (const item of plan.items) {
    item.status = "GENERATING";
    await persistPlan(plan);
    const result = await runProcess(["generate", "--reddit-source-file", path.join(planRoot, plan.id, `${item.candidateId}.json`), "--source-url", item.sourceUrl, "--rights-status", "UNKNOWN", "--output-dir", item.runDirectory, "--target-duration", "120", "--min-duration", "90", "--max-duration", "180"], item.logPath);
    if (result.code !== 0) {
      item.status = "FAILED";
      item.error = result.error ?? `generate exited with code ${result.code}`;
      await persistPlan(plan);
      continue;
    }
    item.status = "GENERATED";
    generatedCount += 1;
    try {
      const manifest = JSON.parse(await readFile(path.join(item.runDirectory, "manifest.json"), "utf8")) as { outputPath?: string };
      item.outputPath = manifest.outputPath;
    } catch (error) {
      item.status = "FAILED";
      item.error = error instanceof Error ? `manifest non leggibile: ${error.message}` : "manifest non leggibile";
    }
    await persistPlan(plan);
  }
  if (generatedCount === 0) {
    plan.status = "FAILED";
    await persistPlan(plan);
    return;
  }
  plan.status = "WAITING_UPLOAD";
  await persistPlan(plan);
  for (const item of plan.items.filter((candidate) => candidate.status === "GENERATED").sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))) {
    item.status = "UPLOADING";
    plan.status = "UPLOADING";
    await persistPlan(plan);
    const result = await runProcess(["upload", "--run-dir", item.runDirectory, "--scheduled-at", item.scheduledAt], item.logPath);
    if (result.code !== 0) {
      item.status = "FAILED";
      item.error = result.error ?? `upload exited with code ${result.code}`;
    } else item.status = "COMPLETED";
    await persistPlan(plan);
  }
  plan.status = plan.items.every((item) => item.status === "COMPLETED") ? "COMPLETED" : "PARTIAL_FAILURE";
  await persistPlan(plan);
}

async function executeLocalUpload(job: LocalUploadJob): Promise<void> {
  try {
    await mkdir(planRoot, { recursive: true });
    const result = await runProcess(["upload"], job.logPath);
    job.status = result.code === 0 ? "SUCCEEDED" : "FAILED";
    job.output = result.output;
    job.error = result.error ?? (result.code === 0 ? undefined : `upload exited with code ${result.code}`);
  } catch (error) {
    job.status = "FAILED";
    job.error = error instanceof Error ? error.message : "upload failed";
  } finally {
    job.finishedAt = new Date().toISOString();
    if (activeUploadId === job.id) activeUploadId = undefined;
  }
}

async function runProcess(args: string[], logPath: string): Promise<{ code: number; error?: string; output?: string }> {
  const log = createWriteStream(logPath, { flags: "a" });
  return await new Promise((resolve) => {
    const child = spawn(tsxPath, [runnerPath, ...args], { cwd: projectRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    let output = "";
    const capture = (chunk: Buffer | string): void => {
      output += chunk.toString();
      if (output.length > 20_000) output = output.slice(-20_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    let spawnError = "";
    child.once("error", (error) => { spawnError = error.message; });
    child.once("close", (code) => { log.end(); resolve({ code: code ?? 1, ...(spawnError ? { error: spawnError } : {}), ...(output ? { output } : {}) }); });
  });
}

async function persistPlan(plan: LocalPlan): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  plans.set(plan.id, plan);
  await mkdir(planRoot, { recursive: true });
  await writeFile(path.join(planRoot, `${plan.id}.json`), `${JSON.stringify(plan, null, 2)}\n`, "utf8");
}

async function listPlans(): Promise<LocalPlan[]> {
  await mkdir(planRoot, { recursive: true });
  const entries = await readdir(planRoot, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
    try {
      const plan = JSON.parse(await readFile(path.join(planRoot, entry.name), "utf8")) as LocalPlan;
      plans.set(plan.id, plan);
    } catch { /* Ignore an incomplete plan file and keep the API healthy. */ }
  }
  return [...plans.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 20);
}

