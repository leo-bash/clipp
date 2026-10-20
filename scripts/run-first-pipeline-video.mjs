import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outputDirectory = path.join(root, ".data", "first-video-pipeline");
const gameplayPath = "/Users/leo/Downloads/Minecraft Parkour Gameplay No Copyright (4 HOURS).mp4";
const audioPath = path.join(outputDirectory, "voiceover.mp3");
const captionsDataPath = path.join(outputDirectory, "captions.json");
const captionsVideoPath = path.join(outputDirectory, "captions.mov");
const outputPath = path.join(outputDirectory, "reddit-stories-pipeline-final.mp4");

const transcriptSegments = [
  "Okay, I might be the villain here, but tell me if I am wrong.",
  "My best friend asked me to lie to her boyfriend.",
  "She wanted me to say she was staying at my place all week.",
  "Except... she was not.",
  "She was secretly meeting her ex.",
  "I told her I wanted no part of it.",
  "Then she reminded me of every single time she had helped me, and honestly, I caved.",
  "The next morning, her boyfriend texted me.",
  "He said he had already found the messages, and asked one question: are you on my side, or hers?",
  "So I told him the truth.",
  "Now my best friend says I destroyed her relationship and betrayed her.",
  "Be honest: was I wrong?",
];
const script = transcriptSegments.join(" ");

function loadDotEnv(contents) {
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
    process.env[key] = value;
  }
}

async function probeDuration(filePath) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", filePath]);
  return Number(JSON.parse(stdout).format?.duration ?? 0);
}

async function probeMedia(filePath) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", filePath]);
  const parsed = JSON.parse(stdout);
  return { duration: Number(parsed.format?.duration ?? 0), size: Number(parsed.format?.size ?? 0), streams: parsed.streams ?? [] };
}

async function synthesizeWithElevenLabs(text, outputDirectory) {
  const apiKey = process.env.TTS_API_KEY ?? "";
  const voiceId = process.env.TTS_VOICE_ID ?? "";
  if (!apiKey || !voiceId) throw new Error("TTS_API_KEY or TTS_VOICE_ID is missing from .env");
  const modelId = process.env.TTS_MODEL_ID ?? "eleven_multilingual_v2";
  const outputFormat = process.env.TTS_OUTPUT_FORMAT ?? "mp3_44100_128";
  const cacheKey = createHash("sha256").update(JSON.stringify({ text, language: "en", voice: voiceId })).digest("hex");
  const cachedPath = path.join(outputDirectory, `${cacheKey}.mp3`);
  try {
    await readFile(cachedPath);
    return cachedPath;
  } catch {
    // Generate the audio only when the local cache does not contain it.
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  if (!response.ok) throw new Error(`ElevenLabs request failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("ElevenLabs returned empty audio");
  await writeFile(cachedPath, bytes, { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
  return cachedPath;
}

await loadDotEnv(await readFile(path.join(root, ".env"), "utf8"));
await mkdir(outputDirectory, { recursive: true });

const ttsResult = { provider: "elevenlabs", audioPath: await synthesizeWithElevenLabs(script, path.dirname(audioPath)) };
await execFileAsync("cp", [ttsResult.audioPath, audioPath]);
const audioDuration = await probeDuration(audioPath);
const totalWords = transcriptSegments.reduce((sum, segment) => sum + segment.split(/\s+/u).length, 0);
let cursor = 0;
const subtitles = transcriptSegments.map((text, index) => {
  const segmentWords = text.split(/\s+/u).length;
  const segmentDuration = index === transcriptSegments.length - 1 ? audioDuration - cursor : (audioDuration * segmentWords) / totalWords;
  const cue = [cursor, cursor + segmentDuration, text];
  cursor += segmentDuration;
  return cue;
});
await writeFile(captionsDataPath, JSON.stringify(subtitles), "utf8");
await execFileAsync("python3", [path.join(root, "scripts", "render-caption-images.py"), outputDirectory, captionsDataPath]);

const captionsListPath = path.join(outputDirectory, "captions.txt");
const captionsList = subtitles.map((caption, index) => `file '${path.join(outputDirectory, `caption-${String(index).padStart(2, "0")}.png`)}'\nduration ${caption[1] - caption[0]}`).join("\n");
await writeFile(captionsListPath, `${captionsList}\nfile '${path.join(outputDirectory, `caption-${String(subtitles.length - 1).padStart(2, "0")}.png`)}'\n`, "utf8");
await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", captionsListPath, "-r", "30", "-t", String(audioDuration), "-c:v", "qtrle", captionsVideoPath]);

await execFileAsync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-stream_loop", "-1", "-i", gameplayPath,
  "-i", audioPath,
  "-i", captionsVideoPath,
  "-filter_complex",
  "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.05:saturation=1.03[v0];[v0][2:v]overlay=0:680[v]",
  "-map", "[v]", "-map", "1:a:0", "-t", String(audioDuration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-movflags", "+faststart", "-metadata", "title=Reddit Stories — AITA Best Friend Lie", "-metadata", "comment=Original English story, Orbital gameplay background, subtitles match voice-over verbatim", outputPath,
]);

const media = await probeMedia(outputPath);
const video = media.streams.find((stream) => stream.codec_type === "video");
const audio = media.streams.find((stream) => stream.codec_type === "audio");
const checks = [
  { name: "resolution", passed: video?.width === 1080 && video?.height === 1920 },
  { name: "duration", passed: media.duration >= 25 && media.duration <= 60 },
  { name: "h264_video", passed: video?.codec_name === "h264" },
  { name: "audio_present", passed: Boolean(audio) },
  { name: "aac_audio", passed: audio?.codec_name === "aac" },
  { name: "file_size", passed: media.size > 0 && media.size <= 100 * 1024 * 1024 },
];
if (!checks.every((check) => check.passed)) throw new Error(`Final video failed QC: ${JSON.stringify(checks)}`);
console.log(JSON.stringify({ outputPath, audioDuration, provider: ttsResult.provider, qcScore: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks }, null, 2));
