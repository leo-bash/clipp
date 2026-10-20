import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outputDirectory = path.join(root, ".data", "first-video-draft");
const audioPath = path.join(outputDirectory, "voiceover-english.aiff");
const captionsDataPath = path.join(outputDirectory, "captions.json");
const captionVideoPath = path.join(outputDirectory, "captions.mov");
const outputPath = path.join(outputDirectory, "reddit-stories-first-draft-english.mp4");

const transcriptSegments = [
  "Okay, this is going to sound awful, but hear me out.",
  "My best friend asked me to lie to her boyfriend.",
  "She wanted me to tell him she was staying at my apartment for an entire week.",
  "The problem? She was not staying with me.",
  "She was meeting her ex behind his back.",
  "I told her I did not want any part of it, but then she started listing every time she had been there for me.",
  "So, against my better judgment, I agreed.",
  "The next morning, her boyfriend texted me.",
  "He said he had already found the messages and asked me one simple question: was I on his side, or hers?",
  "I told him the truth.",
  "Now my best friend says I ruined her relationship and betrayed her.",
  "Be honest... was I wrong?",
];
const story = transcriptSegments.join(" ");

await mkdir(outputDirectory, { recursive: true });
await execFileAsync("say", ["-v", "Samantha", "-r", "160", "-o", audioPath, story]);
const { stdout: audioProbeOutput } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", audioPath]);
const audioDuration = Number(JSON.parse(audioProbeOutput).format?.duration ?? 0);
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

const listPath = path.join(outputDirectory, "captions.txt");
const listEntries = subtitles.map((caption, index) => `file '${path.join(outputDirectory, `caption-${String(index).padStart(2, "0")}.png`)}'\nduration ${caption[1] - caption[0]}`).join("\n");
await writeFile(listPath, `${listEntries}\nfile '${path.join(outputDirectory, `caption-${String(subtitles.length - 1).padStart(2, "0")}.png`)}'\n`, "utf8");
await execFileAsync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-r", "30", "-t", String(audioDuration), "-c:v", "qtrle", captionVideoPath]);

const background = "color=c=0x09111f:s=1080x1920:r=30,drawbox=x='mod(135*t\\,1180)-100':y='420+180*sin(t)':w=260:h=260:color=0x7c3aed@0.72:t=fill,drawbox=x='980-mod(110*t\\,1250)':y='980+260*cos(t*0.75)':w=190:h=190:color=0x06b6d4@0.72:t=fill,drawbox=x='mod(220*t\\,1380)-260':y='1510':w=460:h=42:color=0xf59e0b@0.85:t=fill";
await execFileAsync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "lavfi", "-i", background,
  "-i", audioPath,
  "-i", captionVideoPath,
  "-filter_complex", "[0:v][2:v]overlay=0:1520:format=auto[v]",
  "-map", "[v]", "-map", "1:a:0",
  "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
  "-metadata", "title=Reddit Stories - First Draft",
  "-metadata", "comment=Original fictional AITA-style story; provisional background",
  outputPath,
], { maxBuffer: 4 * 1024 * 1024 });

const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", outputPath]);
console.log(JSON.stringify({ outputPath, probe: JSON.parse(stdout) }, null, 2));
