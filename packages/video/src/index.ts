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
export type SubtitlePreset = "clean" | "dynamic" | "minimal";
export interface SubtitleOptions { preset?: SubtitlePreset; maxWordsPerLine?: number; safeMargin?: number; fontName?: string; fontSize?: number; alignment?: number; }
export interface RenderPlan {
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  trimStart?: number;
  duration?: number;
  cuts?: Array<{ start: number; end: number }>;
  introPath?: string;
  outroPath?: string;
  zoom?: number;
  captions?: CaptionCue[];
  subtitleOptions?: SubtitleOptions;
  overlayPath?: string;
  backgroundBlur?: boolean;
  audioRequired?: boolean;
  audioVolume?: number;
  compression?: { crf?: number; preset?: "ultrafast" | "fast" | "veryfast" | "medium" | "slow" };
  thumbnailOutputPath?: string;
  metadata?: Record<string, string>;
}
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

export async function runQualityControl(filePath: string, config: QcConfig = defaultQcConfig, ffprobeBinary = "ffprobe", ffmpegBinary = "ffmpeg"): Promise<QualityControlResult> {
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
  checks.push(await blackVideoCheck(filePath, duration, ffmpegBinary));
  const passedCritical = checks.filter((check) => check.critical).every((check) => check.passed);
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { passed: passedCritical, score, checks, probe };
}

export class FFmpegRenderer implements VideoRenderer {
  public constructor(private readonly ffmpegBinary = "ffmpeg", private readonly ffprobeBinary = "ffprobe") {}

  public async render(plan: RenderPlan, qcConfig: QcConfig = defaultQcConfig): Promise<RenderResult> {
    assertPath(plan.inputPath);
    assertPath(plan.outputPath);
    if (plan.overlayPath) assertPath(plan.overlayPath);
    if (plan.introPath) assertPath(plan.introPath);
    if (plan.outroPath) assertPath(plan.outroPath);
    if (plan.thumbnailOutputPath) assertPath(plan.thumbnailOutputPath);
    const width = plan.width ?? qcConfig.width;
    const height = plan.height ?? qcConfig.height;
    if (width <= 0 || height <= 0 || width % 2 !== 0 || height % 2 !== 0) throw new ValidationError("render dimensions must be positive even numbers");
    const temporaryDir = await mkdtemp(path.join(os.tmpdir(), "shortfactory-render-"));
    let subtitlePath: string | undefined;
    const started = Date.now();
    try {
      const effectiveInputPath = plan.introPath || plan.outroPath ? path.join(temporaryDir, "composition.mp4") : plan.inputPath;
      if (effectiveInputPath !== plan.inputPath) await composeIntroOutro(plan, effectiveInputPath, this.ffmpegBinary);
      const sourceProbe = await probeMedia(effectiveInputPath, this.ffprobeBinary);
      const hasAudio = sourceProbe.streams.some((stream) => stream.codecType === "audio");
      if ((plan.audioRequired ?? qcConfig.audioRequired) && !hasAudio) throw new RenderError("audio is required but input has no audio");
      const zoom = clampZoom(plan.zoom);
      const filters = zoom > 1 ? [`scale=${Math.round(width * zoom)}:${Math.round(height * zoom)}:force_original_aspect_ratio=increase`, `crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2`, "setsar=1"] : [`scale=${width}:${height}:force_original_aspect_ratio=increase`, `crop=${width}:${height}`, "setsar=1"];
      if (plan.cuts && plan.cuts.length > 0) filters.push(`select='${cutExpression(plan.cuts)}'`, "setpts=N/FRAME_RATE/TB");
      if (plan.captions && plan.captions.length > 0) {
        validateCaptions(plan.captions, plan.subtitleOptions, width, height);
        subtitlePath = path.join(temporaryDir, "captions.ass");
        await writeFile(subtitlePath, renderAss(plan.captions, plan.subtitleOptions));
      }
      const caption = subtitlePath ? await captionFilter(this.ffmpegBinary, subtitlePath) : undefined;
      const useComplexVideo = Boolean(plan.backgroundBlur || plan.overlayPath);
      let videoMap: string[];
      if (useComplexVideo) {
        const cutPrefix = plan.cuts && plan.cuts.length > 0 ? `select='${cutExpression(plan.cuts)}',setpts=N/FRAME_RATE/TB,` : "";
        const foreground = zoom > 1
          ? `scale=${Math.round(width * zoom)}:${Math.round(height * zoom)}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-${width})/2:(ih-${height})/2,setsar=1`
          : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
        const parts: string[] = plan.backgroundBlur
          ? [`[0:v]${cutPrefix}split=2[bg][fg]`, `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=10:luma_power=1[blurred]`, `[fg]${foreground}[foreground]`, `[blurred][foreground]overlay=0:0[base]`]
          : [`[0:v]${filters.join(",")}[base]`];
        let current = "base";
        if (plan.overlayPath) { parts.push(`[base][1:v]format=rgba[overlay]`, `[base][overlay]overlay=0:0[with_overlay]`); current = "with_overlay"; }
        if (caption) parts.push(`[${current}]${caption}[v]`); else parts.push(`[${current}]null[v]`);
        videoMap = ["-filter_complex", parts.join(";"), "-map", "[v]"];
      } else {
        if (caption) filters.push(caption);
        videoMap = ["-vf", filters.join(","), "-map", "0:v:0"];
      }
      const inputArgs = ["-y", "-hide_banner", "-loglevel", "error", ...(plan.trimStart ? ["-ss", String(plan.trimStart)] : []), "-i", effectiveInputPath, ...(plan.overlayPath ? ["-i", plan.overlayPath] : []), ...(plan.duration ? ["-t", String(plan.duration)] : [])];
      const audioFilter = `${plan.cuts && plan.cuts.length > 0 ? `aselect='${cutExpression(plan.cuts)}',asetpts=N/SR/TB,` : ""}loudnorm=I=-16:TP=-1.5:LRA=11${plan.audioVolume === undefined ? "" : `,volume=${clampVolume(plan.audioVolume)}`}`;
      const args = [...inputArgs, ...videoMap, ...(hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-af", audioFilter, "-shortest"] : ["-an"]), "-c:v", "libx264", "-preset", plan.compression?.preset ?? "veryfast", "-crf", String(plan.compression?.crf ?? 23), "-pix_fmt", "yuv420p", "-movflags", "+faststart", ...metadataArgs(plan.metadata), plan.outputPath];
      await execFileAsync(this.ffmpegBinary, args, { maxBuffer: 4 * 1024 * 1024 });
      const probe = await probeMedia(plan.outputPath, this.ffprobeBinary);
      const qc = await runQualityControl(plan.outputPath, qcConfig, this.ffprobeBinary, this.ffmpegBinary);
      if (plan.thumbnailOutputPath) await extractThumbnail(plan.outputPath, plan.thumbnailOutputPath, this.ffmpegBinary);
      return { outputPath: plan.outputPath, probe, qc, durationMs: Date.now() - started };
    } catch (error) { if (error instanceof RenderError) throw error; throw new RenderError(`ffmpeg render failed: ${error instanceof Error ? error.message : "unknown error"}`, true); } finally { await rm(temporaryDir, { recursive: true, force: true }); }
  }
}

function assertPath(filePath: string): void { if (!filePath || filePath.includes("\0") || !path.isAbsolute(filePath)) throw new ValidationError("media paths must be absolute and non-empty"); }
function clampZoom(value: number | undefined): number { if (value === undefined) return 1; if (!Number.isFinite(value) || value < 1 || value > 2) throw new ValidationError("zoom must be between 1 and 2"); return Math.round(value * 100) / 100; }
function cutExpression(cuts: Array<{ start: number; end: number }>): string { if (cuts.some((cut) => !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < 0 || cut.end <= cut.start)) throw new ValidationError("cuts must have finite non-negative ranges"); return cuts.map((cut) => `between(t,${cut.start},${cut.end})`).join("+"); }
async function composeIntroOutro(plan: RenderPlan, outputPath: string, ffmpegBinary: string): Promise<void> {
  const files = [plan.introPath, plan.inputPath, plan.outroPath].filter((file): file is string => Boolean(file));
  const listPath = `${outputPath}.txt`;
  await writeFile(listPath, files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  await execFileAsync(ffmpegBinary, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", outputPath], { maxBuffer: 4 * 1024 * 1024 });
}
function escapeFilterPath(filePath: string): string { return filePath.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'"); }
async function captionFilter(ffmpegBinary: string, subtitlePath: string): Promise<string> {
  const available = await execFileAsync(ffmpegBinary, ["-hide_banner", "-filters"], { maxBuffer: 2 * 1024 * 1024 });
  const filters = `${available.stdout}\n${available.stderr}`;
  const filterName = /\bass\s/u.test(filters) ? "ass" : /\bsubtitles\s/u.test(filters) ? "subtitles" : undefined;
  if (!filterName) throw new RenderError("caption burn-in requires an FFmpeg build with ass or subtitles filter");
  return `${filterName}=filename='${escapeFilterPath(subtitlePath)}'`;
}
export function createSubtitleCues(cues: CaptionCue[], options: SubtitleOptions = {}): CaptionCue[] {
  const maxWords = options.maxWordsPerLine ?? (options.preset === "minimal" ? 10 : 7);
  return cues.map((cue) => ({ ...cue, text: wrapSubtitleText(cue.text, maxWords) }));
}

export function renderAss(cues: CaptionCue[], options: SubtitleOptions = {}): string {
  const preset = options.preset ?? "clean";
  const fontName = options.fontName ?? "Arial";
  const fontSize = options.fontSize ?? (preset === "minimal" ? 54 : preset === "dynamic" ? 70 : 64);
  const alignment = options.alignment ?? 2;
  const safeMargin = options.safeMargin ?? 160;
  const bold = preset === "dynamic" ? 1 : 0;
  const lines = createSubtitleCues(cues, options).map((cue) => `Dialogue: 0,${assTime(cue.start)},${assTime(cue.end)},Default,,0,0,0,,${cue.text.replaceAll("\\", "\\\\").replaceAll("{", "(").replaceAll("}", ")").replaceAll("\n", "\\N")}`);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,${bold},0,0,0,100,100,0,0,1,3,1,${alignment},${safeMargin},${safeMargin},${safeMargin},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${lines.join("\n")}\n`; }
function wrapSubtitleText(text: string, maxWords: number): string { const words = text.trim().split(/\s+/u); const lines: string[] = []; for (let index = 0; index < words.length; index += maxWords) lines.push(words.slice(index, index + maxWords).join(" ")); return lines.join("\n"); }
function assTime(seconds: number): string { const safe = Math.max(0, seconds); const hours = Math.floor(safe / 3600); const minutes = Math.floor((safe % 3600) / 60); const whole = Math.floor(safe % 60); const centiseconds = Math.floor((safe - Math.floor(safe)) * 100); return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`; }
function clampVolume(value: number): number { if (!Number.isFinite(value)) throw new ValidationError("audio volume must be finite"); return Math.min(4, Math.max(0, value)); }
function metadataArgs(metadata: Record<string, string> | undefined): string[] { return Object.entries(metadata ?? {}).flatMap(([key, value]) => ["-metadata", `${key}=${value}`]); }
async function extractThumbnail(inputPath: string, outputPath: string, ffmpegBinary: string): Promise<void> { await execFileAsync(ffmpegBinary, ["-y", "-hide_banner", "-loglevel", "error", "-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath], { maxBuffer: 2 * 1024 * 1024 }); }

function validateCaptions(cues: CaptionCue[], options: SubtitleOptions | undefined, width: number, height: number): void {
  const safeMargin = options?.safeMargin ?? 160;
  if (!Number.isFinite(safeMargin) || safeMargin < 0 || safeMargin * 2 >= Math.min(width, height)) throw new ValidationError("caption safe margin is outside the video canvas");
  if (cues.some((cue) => !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || !cue.text.trim())) throw new ValidationError("caption cues must have valid non-empty time ranges");
}

async function blackVideoCheck(filePath: string, duration: number, ffmpegBinary: string): Promise<QcCheck> {
  try {
    const { stdout, stderr } = await execFileAsync(ffmpegBinary, ["-hide_banner", "-loglevel", "info", "-i", filePath, "-vf", "blackdetect=d=0.5:pix_th=0.02", "-an", "-f", "null", "-"], { maxBuffer: 2 * 1024 * 1024 });
    const output = `${stdout}\n${stderr}`;
    const blackDurations = [...output.matchAll(/black_duration:([0-9.]+)/gu)].map((match) => Number(match[1]));
    const blackDuration = blackDurations.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
    const passed = duration <= 0 || blackDuration < duration * 0.95;
    return { name: "black_video", passed, critical: true, detail: `${blackDuration.toFixed(2)}s black of ${duration.toFixed(2)}s` };
  } catch (error) {
    return { name: "black_video", passed: false, critical: true, detail: error instanceof Error ? error.message : "black video check failed" };
  }
}
