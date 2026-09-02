import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { RenderError, ValidationError } from "@shortfactory/shared";

const execFileAsync = promisify(execFile);

export interface MediaStream { codecType: "video" | "audio" | string; codecName?: string; width?: number; height?: number; }
export interface MediaProbe { format: { duration?: number; size?: number; formatName?: string }; streams: MediaStream[]; }
export interface CaptionCue { start: number; end: number; text: string; }
export interface RenderPlan { inputPath: string; outputPath: string; width?: number; height?: number; trimStart?: number; duration?: number; captions?: CaptionCue[]; audioRequired?: boolean; }
export interface QcCheck { name: string; passed: boolean; critical: boolean; detail?: string; }
export interface QualityControlResult { passed: boolean; score: number; checks: QcCheck[]; probe?: MediaProbe; }
export interface RenderResult { outputPath: string; probe: MediaProbe; qc: QualityControlResult; durationMs: number; }

export interface VideoRenderer { render(plan: RenderPlan, qcConfig?: QcConfig): Promise<RenderResult>; }

export interface QcConfig { width: number; height: number; minDuration: number; maxDuration: number; audioRequired: boolean; maxFileSizeBytes: number; }

export const defaultQcConfig: QcConfig = { width: 1080, height: 1920, minDuration: 1, maxDuration: 60, audioRequired: false, maxFileSizeBytes: 100 * 1024 * 1024 };

export async function probeMedia(filePath: string, ffprobeBinary = "ffprobe"): Promise<MediaProbe> {
  assertPath(filePath);
  try {
    const { stdout } = await execFileAsync(ffprobeBinary, ["-v", "error", "-show_entries", "format=duration,size,format_name", "-show_entries", "stream=codec_type,codec_name,width,height", "-of", "json", filePath], { maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout) as { format?: { duration?: string; size?: string; format_name?: string }; streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }> };
    return { format: { duration: parsed.format?.duration ? Number(parsed.format.duration) : undefined, size: parsed.format?.size ? Number(parsed.format.size) : undefined, formatName: parsed.format?.format_name }, streams: (parsed.streams ?? []).map((stream) => ({ codecType: stream.codec_type ?? "unknown", codecName: stream.codec_name, width: stream.width, height: stream.height })) };
  } catch (error) { throw new RenderError(`ffprobe failed for ${filePath}: ${error instanceof Error ? error.message : "unknown error"}`, true); }
}

export async function runQualityControl(filePath: string, config: QcConfig = defaultQcConfig, ffprobeBinary = "ffprobe"): Promise<QualityControlResult> {
  const checks: QcCheck[] = [];
  let probe: MediaProbe;
  try { probe = await probeMedia(filePath, ffprobeBinary); } catch (error) { return { passed: false, score: 0, checks: [{ name: "readable_by_ffprobe", passed: false, critical: true, detail: error instanceof Error ? error.message : "probe failed" }] }; }
  const video = probe.streams.find((stream) => stream.codecType === "video");
  const audio = probe.streams.find((stream) => stream.codecType === "audio");
  const duration = probe.format.duration ?? 0;
  const fileSize = probe.format.size ?? 0;
  checks.push({ name: "resolution", passed: video?.width === config.width && video.height === config.height, critical: true, detail: `${video?.width ?? 0}x${video?.height ?? 0}` });
  checks.push({ name: "duration", passed: duration >= config.minDuration && duration <= config.maxDuration, critical: true, detail: `${duration.toFixed(2)}s` });
  checks.push({ name: "non_zero_file", passed: fileSize > 0, critical: true, detail: `${fileSize} bytes` });
  checks.push({ name: "h264_video", passed: video?.codecName === "h264", critical: true, detail: video?.codecName });
  checks.push({ name: "audio_present", passed: !config.audioRequired || Boolean(audio), critical: config.audioRequired, detail: audio?.codecName ?? "none" });
  checks.push({ name: "aac_audio", passed: !audio || audio.codecName === "aac", critical: config.audioRequired, detail: audio?.codecName ?? "none" });
  checks.push({ name: "platform_file_size", passed: fileSize <= config.maxFileSizeBytes, critical: true, detail: `${fileSize}/${config.maxFileSizeBytes}` });
  const passedCritical = checks.filter((check) => check.critical).every((check) => check.passed);
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { passed: passedCritical, score, checks, probe };
}

export class FFmpegRenderer implements VideoRenderer {
  public constructor(private readonly ffmpegBinary = "ffmpeg", private readonly ffprobeBinary = "ffprobe") {}

  public async render(plan: RenderPlan, qcConfig: QcConfig = defaultQcConfig): Promise<RenderResult> {
    assertPath(plan.inputPath);
    assertPath(plan.outputPath);
    const width = plan.width ?? qcConfig.width;
    const height = plan.height ?? qcConfig.height;
    if (width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0) throw new ValidationError("render dimensions must be positive even numbers");
    const sourceProbe = await probeMedia(plan.inputPath, this.ffprobeBinary);
    const hasAudio = sourceProbe.streams.some((stream) => stream.codecType === "audio");
    if ((plan.audioRequired ?? qcConfig.audioRequired) && !hasAudio) throw new RenderError("audio is required but input has no audio");
    const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "shortfactory-render-"));
    let subtitlePath: string | undefined;
    const started = Date.now();
    try {
      const filters = [`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`, "setsar=1"];
      if (plan.captions && plan.captions.length > 0) {
        subtitlePath = path.join(temporaryDir, "captions.ass");
        await writeFile(subtitlePath, renderAss(plan.captions));
        filters.push(await captionFilter(this.ffmpegBinary, subtitlePath));
      }
      const args = ["-y", "-hide_banner", "-loglevel", "error", ...(plan.trimStart ? ["-ss", String(plan.trimStart)] : []), "-i", plan.inputPath, ...(plan.duration ? ["-t", String(plan.duration)] : []), "-vf", filters.join(","), "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-shortest"] : ["-an"]), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", plan.outputPath];
      await execFileAsync(this.ffmpegBinary, args, { maxBuffer: 4 * 1024 * 1024 });
      const probe = await probeMedia(plan.outputPath, this.ffprobeBinary);
      const qc = await runQualityControl(plan.outputPath, qcConfig, this.ffprobeBinary);
      return { outputPath: plan.outputPath, probe, qc, durationMs: Date.now() - started };
    } catch (error) { if (error instanceof RenderError) throw error; throw new RenderError(`ffmpeg render failed: ${error instanceof Error ? error.message : "unknown error"}`, true); } finally { await rm(temporaryDir, { recursive: true, force: true }); }
  }
}

function assertPath(filePath: string): void { if (!filePath || filePath.includes("\0") || !path.isAbsolute(filePath)) throw new ValidationError("media paths must be absolute and non-empty"); }
function escapeFilterPath(filePath: string): string { return filePath.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'"); }
async function captionFilter(ffmpegBinary: string, subtitlePath: string): Promise<string> {
  const available = await execFileAsync(ffmpegBinary, ["-hide_banner", "-filters"], { maxBuffer: 2 * 1024 * 1024 });
  const filters = `${available.stdout}\n${available.stderr}`;
  const filterName = /\bass\s/u.test(filters) ? "ass" : /\bsubtitles\s/u.test(filters) ? "subtitles" : undefined;
  if (!filterName) throw new RenderError("caption burn-in requires an FFmpeg build with ass or subtitles filter");
  return `${filterName}=filename='${escapeFilterPath(subtitlePath)}'`;
}
function renderAss(cues: CaptionCue[]): string { const lines = cues.map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${cue.text.replaceAll("\\", "\\\\").replaceAll("{", "(").replaceAll("}", ")").replaceAll("\n", "\\N")}`); return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,80,80,160,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${lines.join("\n")}\n`; }
function assTime(seconds: number): string { const safe = Math.max(0, seconds); const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const whole = Math.floor(safe % 60); const centiseconds = Math.floor((safe - Math.floor(safe)) * 100); return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`; }
