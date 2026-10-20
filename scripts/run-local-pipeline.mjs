import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { InstagramPublisher, TikTokPublisher, YouTubePublisher, readStoredPlatformCredentials } from "../apps/api/node_modules/@shortfactory/platforms/src/index.ts";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const allowedVideoExtensions = new Set([".mp4", ".mov", ".mkv", ".webm"]);
const maxOutputFileSizeBytes = 100 * 1024 * 1024;
const defaultSourceDirectory = path.join(os.homedir(), "Movies", "4K Video Downloader+");
const redditThemeSubreddits = {
  highschool: ["AskReddit", "CasualConversation", "TrueOffMyChest"],
  romance: ["relationship_advice", "AskReddit", "confession"],
  embarrassing: ["TIFU", "confession", "AskReddit"],
  bullies: ["TrueOffMyChest", "offmychest", "AskReddit"],
  family: ["TrueOffMyChest", "offmychest", "confession"],
  scary: ["nosleep", "shortscarystories", "CreepyEncounters"],
  money: ["povertyfinance", "TrueOffMyChest", "AskReddit"],
  tinder: ["Tinder", "dating_advice", "AskReddit"],
  prank: ["prankstories", "TIFU", "AskReddit"],
  divorce: ["Divorce", "relationship_advice", "TrueOffMyChest"],
  betrayal: ["relationship_advice", "TrueOffMyChest", "offmychest"],
  revenge: ["pettyrevenge", "prorevenge", "TrueOffMyChest"],
};
const redditThemes = Object.keys(redditThemeSubreddits);
const themeGuidance = {
  highschool: "Focus on school memories, friendships, first crushes, graduation, missed chances and the feeling of looking back years later. Do not sexualize minors or identify real schools or children.",
  romance: "Focus on first love, quiet sacrifices, misunderstandings, reunions, missed timing and emotionally honest choices rather than cheating rage-bait.",
  embarrassing: "Focus on a relatable awkward moment that becomes vulnerable or unexpectedly human. Do not humiliate a private person or turn the story into cruelty.",
  bullies: "Focus on the emotional impact of bullying, an unexpected act of kindness, growth or closure. Do not glorify violence or revenge fantasies.",
  family: "Focus on family bonds, grief, distance, reconciliation, traditions and small memories. Treat loss respectfully, avoid graphic details and do not invent criminal accusations.",
  scary: "Focus on suspense, strange details and the feeling that something is wrong. Keep it non-graphic, avoid realistic instructions for harm and make the fear suitable for a general audience.",
  money: "Focus on money stress, hard choices, unexpected help and small signs of hope. Do not give financial advice, reveal private financial details or shame people for being poor.",
  tinder: "Focus on an awkward, surprising or unexpectedly kind dating-app meeting. Keep everyone clearly adult, do not sexualize the story and remove identifying details.",
  prank: "Focus on a prank that went wrong, the consequences and what the people learned. Do not celebrate dangerous, humiliating, destructive or illegal pranks.",
  divorce: "Focus on the human side of separation, co-parenting, forgotten memories and rebuilding a life. Avoid legal advice, real accusations and using children as props.",
  betrayal: "Focus on the emotional moment when trust breaks, the choice that follows and the path toward clarity or healing. Do not present unverified accusations as facts.",
  revenge: "Focus on clever, harmless consequences or setting a boundary after someone caused harm. No violence, stalking, doxxing, sabotage or instructions for illegal revenge.",
};
const redditBlockedContent = /\b(?:suicide|suicidal|self[- ]?harm|rape|sexual assault|child porn|csam|doxx(?:ing)?|doxxed|social security number|credit card number|home address|phone number|blood and gore|graphic gore)\b/iu;
let logPath = "";
let currentStage = "startup";

const builtinScript = [
  "Okay, I might be the villain here, but tell me if I am wrong.",
  "My best friend asked me to lie to her boyfriend.",
  "She wanted me to say she was staying at my place all week, except she was not.",
  "She was secretly meeting her ex.",
  "I told her I wanted no part of it.",
  "Then she reminded me of every single time she had helped me and honestly I caved.",
  "The next morning her boyfriend texted me.",
  "He said he had already found the messages and asked one question.",
  "Are you on my side or hers?",
  "So I told him the truth.",
  "Now my best friend says I destroyed her relationship and betrayed her.",
  "Be honest. Was I wrong?",
].join(" ");

function loadDotEnv(contents) {
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = error?.stderr ? ` | dettagli: ${String(error.stderr).trim()}` : "";
  return `${message}${stderr}`.trim();
}

async function geminiResponseError(response, operation) {
  const rawBody = await response.text().catch(() => "");
  let body = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    body = {};
  }
  const providerMessage = String(body?.error?.message ?? "").trim();
  const retryDelay = body?.error?.details?.find((detail) => detail?.["@type"]?.endsWith("RetryInfo"))?.retryDelay;
  const retryHint = retryDelay ? ` Riprova tra circa ${retryDelay}.` : "";
  if (response.status === 429) {
    return `${operation}: Gemini API ha restituito HTTP 429 (quota esaurita).${providerMessage ? ` ${providerMessage}` : ""}${retryHint} Google AI Pro riguarda l'app Gemini e non abilita automaticamente la quota API: per usare la chiave in questa pipeline devi collegare la fatturazione del progetto in Google AI Studio. Vedi https://ai.google.dev/gemini-api/docs/billing.`;
  }
  return `${operation}: Gemini API ha restituito HTTP ${response.status}.${providerMessage ? ` ${providerMessage}` : ""}`;
}

async function logEvent(level, message, details = undefined) {
  const line = `${new Date().toISOString()} [${level}] ${message}${details ? ` ${JSON.stringify(details)}` : ""}`;
  console.log(line);
  if (logPath) await appendFile(logPath, `${line}\n`, "utf8");
}

function scriptUsesLlmProvider(provider) {
  return String(provider).includes("gemini:") || String(provider).includes("groq:");
}

async function generateTextWithFallback({ prompt, maxOutputTokens, operation }) {
  const geminiApiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const geminiModel = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";
  const fallbackProvider = String(process.env.GEMINI_FALLBACK_PROVIDER ?? "groq").trim().toLowerCase();
  const groqApiKey = process.env.GROQ_API_KEY ?? "";
  const groqModel = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
  let geminiError = "";

  if (geminiApiKey) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": geminiApiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens,
          ...(geminiModel === "gemini-3.8-flash" ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
        },
      }),
    });
    if (response.ok) {
      const body = await response.json();
      const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join(" ").trim() ?? "";
      if (!text) throw new Error(`${operation}: Gemini non ha restituito testo`);
      return { text, provider: `gemini:${geminiModel}` };
    }
    geminiError = await geminiResponseError(response, operation);
    if (response.status !== 429) throw new Error(geminiError);
  }

  if (fallbackProvider === "groq" && groqApiKey) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${groqApiKey}` },
      body: JSON.stringify({ model: groqModel, messages: [{ role: "user", content: prompt }], max_tokens: maxOutputTokens }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = String(body?.error?.message ?? "").trim();
      throw new Error(`${geminiError ? `${geminiError} ` : ""}${operation}: Groq API ha restituito HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ""}`);
    }
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error(`${operation}: Groq non ha restituito testo`);
    await logEvent("WARN", `${operation}: uso fallback Groq dopo errore quota Gemini`, { model: groqModel });
    return { text: text.trim(), provider: `groq:${groqModel}` };
  }

  if (geminiError) throw new Error(geminiError);
  throw new Error(`${operation}: nessun provider AI configurato. Inserisci GEMINI_API_KEY oppure GROQ_API_KEY nel file .env`);
}

async function runStage(name, action) {
  currentStage = name;
  await logEvent("INFO", `START ${name}`);
  try {
    const result = await action();
    await logEvent("INFO", `DONE ${name}`);
    return result;
  } catch (error) {
    await logEvent("ERROR", `FAIL ${name}: ${errorMessage(error)}`);
    throw new Error(`[${name}] ${errorMessage(error)}`, { cause: error });
  }
}

async function loadRuntimeEnv() {
  for (const fileName of [".env", ".env.local"]) {
    try {
      loadDotEnv(await readFile(path.join(root, fileName), "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

function parseArgs(argv) {
  const command = argv[0] === "upload" ? "upload" : "generate";
  const options = { command, source: undefined, sourceDir: undefined, scriptFile: undefined, redditSourceFile: undefined, usageFile: undefined, sourceUrl: "", rightsStatus: "UNKNOWN", theme: "rotation", perspective: "auto", outputDir: undefined, runDirectory: undefined, scheduledAt: undefined, sourceStart: undefined, targetDuration: 120, minDuration: 90, maxDuration: 180, upload: false };
  const argumentsList = argv[0] === "generate" || argv[0] === "upload" ? argv.slice(1) : argv;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      printHelp();
      process.exit(0);
    }
    if (argument === "--no-upload") {
      options.upload = false;
      continue;
    }
    if (argument === "--upload") {
      options.upload = true;
      continue;
    }
    const [key, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? argumentsList[++index];
    if (key === "--source") options.source = value;
    else if (key === "--source-dir") options.sourceDir = value;
    else if (key === "--script-file") options.scriptFile = value;
    else if (key === "--reddit-source-file") options.redditSourceFile = value;
    else if (key === "--usage-file") options.usageFile = value;
    else if (key === "--source-url") options.sourceUrl = value ?? "";
    else if (key === "--rights-status") options.rightsStatus = value ?? "UNKNOWN";
    else if (key === "--theme") options.theme = value ?? options.theme;
    else if (key === "--perspective") options.perspective = value ?? options.perspective;
    else if (key === "--output-dir") options.outputDir = value;
    else if (key === "--run-dir") options.runDirectory = value;
    else if (key === "--scheduled-at") options.scheduledAt = value;
    else if (key === "--source-start") options.sourceStart = Number(value);
    else if (key === "--target-duration") options.targetDuration = Number(value);
    else if (key === "--min-duration") options.minDuration = Number(value);
    else if (key === "--max-duration") options.maxDuration = Number(value);
    else throw new Error(`Argomento non riconosciuto: ${argument}`);
  }
  return options;
}

function printHelp() {
  console.log(`ShortFactory local pipeline\n\nUso:\n  npm run generate                 genera e salva per revisione\n  npm run upload                   carica l'ultimo video validato\n  npm run generate -- --upload     genera e carica subito\n\nOpzioni generate:\n  --source PATH          video sorgente esplicito\n  --source-dir PATH      cartella sorgente (default ~/Movies/4K Video Downloader+)\n  --usage-file PATH      registro dei minutaggi utilizzati\n  --script-file PATH     file .txt oppure JSON con title, hook, script e gender (M/F)\n  --reddit-source-file PATH  storia Reddit selezionata dal pannello web locale\n  --theme NAME           tema Reddit: rotation, highschool, romance, embarrassing, bullies, family, scary, money, tinder, prank, divorce, betrayal, revenge\n  --perspective VALUE    auto, male o female (default auto)\n  --source-url URL       URL originale per tracciabilita e diritti\n  --rights-status VALUE  UNKNOWN, LICENSED, OWNED, ecc. (default UNKNOWN)\n  --source-start SEC     punto iniziale manuale; senza questo usa un segmento nuovo\n  --target-duration SEC  durata obiettivo indicativa (default 120)\n  --min-duration SEC     durata minima QC (default 90)\n  --max-duration SEC     durata massima QC; Shorts richiede massimo 180s (default 180)\n  --output-dir PATH      cartella dei risultati\n  --no-upload            mantiene l'upload disabilitato\n\nOpzioni upload:\n  --run-dir PATH         cartella run specifica; senza questo usa l'ultimo video QC valido\n  --scheduled-at ISO      attende questo orario prima dell'upload\n`);
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSource(options) {
  if (options.source) {
    const sourcePath = path.resolve(options.source);
    if (!(await fileExists(sourcePath))) throw new Error(`Video sorgente non trovato: ${sourcePath}`);
    return sourcePath;
  }
  const sourceDirectory = path.resolve(options.sourceDir ?? process.env.LOCAL_SOURCE_DIR ?? defaultSourceDirectory);
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !allowedVideoExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const filePath = path.join(sourceDirectory, entry.name);
    const { stdout } = await execFileAsync("stat", ["-f", "%m", filePath]);
    candidates.push({ filePath, modified: Number(stdout.trim()) });
  }
  candidates.sort((left, right) => right.modified - left.modified);
  if (candidates.length === 0) throw new Error(`Nessun video trovato in ${sourceDirectory}. Scarica prima un video con 4K Video Downloader+.`);
  return candidates[0].filePath;
}

async function probe(filePath) {
  const { stdout } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration,size", "-show_entries", "stream=codec_name,codec_type,width,height", "-of", "json", filePath]);
  const parsed = JSON.parse(stdout);
  return { duration: Number(parsed.format?.duration ?? 0), size: Number(parsed.format?.size ?? 0), streams: parsed.streams ?? [] };
}

async function compressVideoToMaxSize(filePath, durationSeconds) {
  const tempPath = `${filePath}.compression-temp.mp4`;
  const duration = Math.max(Number(durationSeconds) || 1, 1);
  const attempts = [0.9, 0.8, 0.7];
  let lastProbe = null;
  let lastBitrate = 0;
  for (const safetyFactor of attempts) {
    const totalBitrate = Math.floor((maxOutputFileSizeBytes * 8 * safetyFactor) / duration);
    const videoBitrate = Math.max(500_000, totalBitrate - 128_000);
    lastBitrate = videoBitrate;
    const bitrate = `${Math.floor(videoBitrate / 1000)}k`;
    await runCommand("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", filePath,
      "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "0",
      "-c:v", "libx264", "-preset", "medium", "-b:v", bitrate, "-maxrate", bitrate,
      "-bufsize", `${Math.max(1000, Math.floor(videoBitrate / 500))}k`, "-pix_fmt", "yuv420p",
      "-c:a", "copy", "-movflags", "+faststart", tempPath,
    ]);
    lastProbe = await probe(tempPath);
    if (lastProbe.size <= maxOutputFileSizeBytes) {
      const backupPath = `${filePath}.before-compression-${Date.now()}.mp4`;
      await rename(filePath, backupPath);
      await rename(tempPath, filePath);
      return { ...lastProbe, backupPath, videoBitrate: lastBitrate };
    }
  }
  throw new Error(`Compressione automatica non sufficiente: ${lastProbe?.size ?? 0} bytes dopo ${Math.floor(lastBitrate / 1000)}k video; limite ${maxOutputFileSizeBytes} bytes`);
}

async function runCommand(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { maxBuffer: 8 * 1024 * 1024, ...options });
    return { stdout, stderr };
  } catch (error) {
    const commandLine = [command, ...args].join(" ");
    const enriched = new Error(`${command} non riuscito. Comando: ${commandLine}. ${errorMessage(error)}`, { cause: error });
    enriched.command = commandLine;
    throw enriched;
  }
}

function resolveRedditTheme(requestedTheme) {
  const normalized = String(requestedTheme || "rotation").trim().toLowerCase();
  if (normalized === "rotation") return redditThemes[Math.floor(Math.random() * redditThemes.length)];
  if (!redditThemes.includes(normalized)) throw new Error(`--theme deve essere rotation, ${redditThemes.join(", ")}`);
  return normalized;
}

function resolveVoiceSpeed() {
  const speed = Number(process.env.VOICE_SPEED ?? "1.5");
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new Error(`VOICE_SPEED non valido: ${process.env.VOICE_SPEED ?? "1.5"}. Usa un valore tra 0.5 e 2.0.`);
  }
  return speed;
}

function resolveScriptWordRange(options) {
  const isLongForm = options.minDuration >= 90;
  const voiceSpeed = resolveVoiceSpeed();
  const targetPlaybackDuration = Math.min(options.maxDuration, Math.max(options.minDuration, options.targetDuration));
  const targetDuration = targetPlaybackDuration * voiceSpeed;
  const minimumPlaybackSeconds = Math.max(options.minDuration, targetPlaybackDuration - 30);
  const minimumWords = isLongForm ? Math.round(minimumPlaybackSeconds * voiceSpeed * 2.55) : 90;
  // The target is approximate: allow the story to breathe while keeping it within
  // YouTube's three-minute Shorts ceiling in the default configuration.
  const targetMaximumSeconds = Math.min(options.maxDuration, targetPlaybackDuration + 5) * voiceSpeed;
  const maximumWords = isLongForm ? Math.max(minimumWords + 20, Math.round(targetMaximumSeconds * 2.8)) : 125;
  return { isLongForm, minimumWords, maximumWords, targetDuration, targetPlaybackDuration, voiceSpeed };
}

function parseRedditUsageLine(line) {
  try {
    const entry = JSON.parse(line);
    return entry && entry.postId ? entry : null;
  } catch {
    return null;
  }
}

async function loadRedditUsage(usageFile) {
  if (!(await fileExists(usageFile))) return [];
  return (await readFile(usageFile, "utf8")).split(/\r?\n/u).map(parseRedditUsageLine).filter(Boolean);
}

function redditCandidateIsUsable(post, options) {
  const title = String(post.title ?? "").trim();
  const body = String(post.selftext ?? "").trim();
  const combined = `${title}\n${body}`;
  const minimumScore = Number(process.env.REDDIT_MIN_SCORE ?? 10);
  const maxCharacters = Number(process.env.REDDIT_MAX_SOURCE_CHARACTERS ?? 14000);
  const allowNsfw = String(process.env.REDDIT_ALLOW_NSFW ?? "false").toLowerCase() === "true";
  if (!post.id || !post.permalink || post.removed_by_category || post.author === "[deleted]") return false;
  if (!title || !body || body.length < 240 || body.length > maxCharacters) return false;
  if (Number(post.score ?? 0) < minimumScore || (!allowNsfw && post.over_18)) return false;
  if (redditBlockedContent.test(combined)) return false;
  if (options.theme === "work" && /\b(?:medical|diagnos|lawsuit|court)\b/iu.test(combined)) return false;
  return true;
}

async function getRedditAccessToken() {
  if (process.env.REDDIT_ACCESS_TOKEN) return process.env.REDDIT_ACCESS_TOKEN;
  const clientId = process.env.REDDIT_CLIENT_ID ?? "";
  const clientSecret = process.env.REDDIT_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return "";
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": process.env.REDDIT_USER_AGENT ?? "shortfactory-reddit-pilot/0.1 (local editorial tool)",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Reddit OAuth ha restituito HTTP ${response.status}; verifica client ID e client secret`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Reddit OAuth non ha restituito un access token");
  return body.access_token;
}

async function fetchRedditCandidates(subreddit, limit, accessToken) {
  const baseUrl = accessToken ? (process.env.REDDIT_OAUTH_BASE_URL ?? "https://oauth.reddit.com") : (process.env.REDDIT_BASE_URL ?? "https://www.reddit.com");
  const suffix = accessToken ? "" : ".json";
  const url = `${baseUrl.replace(/\/$/u, "")}/r/${encodeURIComponent(subreddit)}/hot${suffix}?limit=${limit}&raw_json=1`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      "user-agent": process.env.REDDIT_USER_AGENT ?? "shortfactory-reddit-pilot/0.1 (local editorial tool)",
    },
  });
  if (!response.ok) throw new Error(`Reddit r/${subreddit} ha restituito HTTP ${response.status}${accessToken ? " tramite OAuth" : " tramite feed pubblico; configura REDDIT_ACCESS_TOKEN oppure REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET"}`);
  const body = await response.json();
  return (body?.data?.children ?? []).map((item) => item.data).filter(Boolean).map((post) => ({
    id: post.id,
    title: String(post.title ?? "").trim(),
    selftext: String(post.selftext ?? "").trim(),
    subreddit: String(post.subreddit ?? subreddit),
    score: Number(post.score ?? 0),
    over_18: Boolean(post.over_18),
    author: String(post.author ?? "[deleted]"),
    createdUtc: Number(post.created_utc ?? 0),
    permalink: `https://www.reddit.com${post.permalink ?? `/r/${subreddit}/comments/${post.id}`}`,
  }));
}

async function acquireRedditStory(options) {
  const theme = resolveRedditTheme(options.theme);
  const configuredSubreddits = String(process.env.REDDIT_SUBREDDITS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const subreddits = configuredSubreddits.length ? configuredSubreddits : redditThemeSubreddits[theme];
  const limit = Math.max(5, Math.min(100, Number(process.env.REDDIT_FETCH_LIMIT ?? 25)));
  const redditUsageFile = path.resolve(process.env.REDDIT_USAGE_FILE ?? path.join(root, ".data", "local-pipeline", "reddit-usage.jsonl"));
  await mkdir(path.dirname(redditUsageFile), { recursive: true });
  const usedPosts = new Set((await loadRedditUsage(redditUsageFile)).map((entry) => entry.postId));
  const accessToken = await getRedditAccessToken();
  const results = await Promise.allSettled(subreddits.map((subreddit) => fetchRedditCandidates(subreddit, limit, accessToken)));
  const failures = results.filter((result) => result.status === "rejected").map((result) => errorMessage(result.reason));
  const candidates = results.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter((post) => redditCandidateIsUsable(post, { ...options, theme }) && !usedPosts.has(post.id));
  if (!candidates.length) {
    const detail = failures.length ? ` Errori: ${failures.join(" | ")}` : "";
    throw new Error(`Nessuna storia Reddit nuova e idonea trovata per il tema ${theme}.${detail}`);
  }
  candidates.sort((left, right) => right.score - left.score || right.createdUtc - left.createdUtc);
  const selected = candidates[0];
  const reservation = { status: "IN_PROGRESS", postId: selected.id, subreddit: selected.subreddit, permalink: selected.permalink, theme, selectedAt: new Date().toISOString() };
  await appendFile(redditUsageFile, `${JSON.stringify(reservation)}\n`, "utf8");
  await logEvent("INFO", "Storia Reddit selezionata", { subreddit: selected.subreddit, postId: selected.id, score: selected.score, theme, permalink: selected.permalink });
  return { ...selected, theme, usageFile: redditUsageFile };
}

function fallbackHook(text) {
  const firstSentence = String(text).trim().match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? String(text).trim();
  if (!firstSentence) return "One ordinary moment turned into a secret I could not keep.";
  return firstSentence.length <= 220 ? firstSentence : `${firstSentence.slice(0, 217).trimEnd()}...`;
}

function compactPostfullyHook(text) {
  const normalized = String(text).replace(/\s+/gu, " ").trim();
  if (!normalized) return "One secret changed everything";
  const firstSentence = normalized.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? normalized;
  const words = firstSentence.replace(/[.!?]+$/u, "").split(" ").filter(Boolean);
  const selectedWords = words.slice(0, 8);
  while (selectedWords.length > 1 && selectedWords.join(" ").length > 69) selectedWords.pop();
  const compact = selectedWords.join(" ");
  if (!compact) return "One secret changed everything";
  return selectedWords.length < words.length ? `${compact}...` : compact;
}

function parseGeminiStoryOutput(rawText, operation) {
  const raw = String(rawText).trim();
  const withoutMarkdownFence = raw.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "").trim();
  const candidates = [withoutMarkdownFence];
  const objectStart = withoutMarkdownFence.indexOf("{");
  const objectEnd = withoutMarkdownFence.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(withoutMarkdownFence.slice(objectStart, objectEnd + 1));

  let parsed;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {
      // Gemini occasionally wraps valid JSON in a short preamble or markdown fence.
    }
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${operation}: Gemini non ha restituito il JSON richiesto con script e hook`);

  const text = String(parsed.script ?? parsed.text ?? "").trim();
  const hook = String(parsed.hook ?? parsed.description ?? "").trim();
  if (!text) throw new Error(`${operation}: Gemini non ha restituito uno script utilizzabile`);
  if (!hook) throw new Error(`${operation}: Gemini non ha restituito una descrizione hook utilizzabile`);
  if (hook.length > 300) throw new Error(`${operation}: la descrizione hook supera 300 caratteri`);
  return { text, hook };
}

async function rewriteRedditStory(source, options) {
  const hasAiKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GROQ_API_KEY ?? "");
  if (!hasAiKey) throw new Error("SCRIPT_PROVIDER=reddit richiede GEMINI_API_KEY oppure GROQ_API_KEY nel file .env");
  const { isLongForm, minimumWords, maximumWords, targetDuration, targetPlaybackDuration, voiceSpeed } = resolveScriptWordRange(options);
  const prompt = [
    "You are an editorial adapter for an English short-video channel.",
    `Rewrite the Reddit post below into a completely original first-person story targeting about ${targetDuration} seconds of narration before local ${voiceSpeed}x playback (about ${targetPlaybackDuration} seconds in the final video). It may be shorter or longer when the story benefits from natural pacing, but it must stay below the maximum duration.`,
    `Theme: ${source.theme}. ${themeGuidance[source.theme]} Length: ${minimumWords} to ${maximumWords} spoken words.`,
    "Keep the central conflict and emotional arc, but change all names, usernames, locations, employers, dates, amounts and identifying details.",
    "Do not quote sentences from the post, do not mention Reddit or the subreddit, and do not include usernames.",
    "Make the very first spoken sentence the hook: 5 to 9 simple words, easy to understand in 1 to 2 seconds, with an immediate secret, danger, betrayal, impossible choice or emotional shock. It must create an urgent question in the viewer's mind without revealing the ending. Avoid generic openings, greetings, filler, fake claims, all caps and exaggerated punctuation.",
    "Improve the pacing, emotional tension and late reveal. Make the audience feel empathy and, when appropriate, nostalgia. The separate hook field must be a punchy version of the same opening idea, not a spoiler or a different event.",
    "Use plain everyday English suitable for children and teenagers around ages 10 to 16. Prefer short sentences, common words, clear verbs and concrete details. Avoid advanced vocabulary, long clauses, difficult idioms and dense slang. Keep it natural and emotional, not babyish.",
    "Avoid minors, sexual content, graphic violence, medical claims, legal accusations, doxxing, and unverifiable allegations presented as facts.",
    "End with the resolution and a natural question inviting the audience to judge the narrator.",
    "The script value must contain only the final English voice-over text, with no headings, notes, quotation marks or explanation.",
    "Also create a separate short social-media description hook based on the opening line. It must be 5 to 9 simple English words, strong enough to stop the scroll, and must tease the conflict without revealing the ending. It is metadata, not part of the voice-over.",
    'Return valid JSON only with exactly two string fields: {"script":"...","hook":"..."}.',
    `SOURCE TITLE:\n${source.title}\nSOURCE BODY:\n${source.selftext.slice(0, 12000)}`,
  ].join("\n\n");
  const response = await generateTextWithFallback({ prompt, maxOutputTokens: isLongForm ? 2400 : 900, operation: "Riscrittura Reddit" });
  const rawText = response.text;
  const story = parseGeminiStoryOutput(rawText, "Riscrittura Reddit");
  const text = story.text;
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (isLongForm && wordCount < minimumWords) throw new Error(`La riscrittura Reddit e troppo corta (${wordCount} parole, minimo ${minimumWords})`);
  return { text, hook: story.hook, provider: `reddit+${response.provider}`, wordCount };
}

async function generateScript(options) {
  if (options.redditSourceFile) {
    const sourcePath = path.resolve(options.redditSourceFile);
    if (!(await fileExists(sourcePath))) throw new Error(`File sorgente Reddit non trovato: ${sourcePath}`);
    let source;
    try {
      source = JSON.parse(await readFile(sourcePath, "utf8"));
    } catch (error) {
      throw new Error(`JSON sorgente Reddit non valido in ${sourcePath}: ${errorMessage(error)}`);
    }
    if (!source || typeof source !== "object" || !String(source.title ?? "").trim() || !String(source.selftext ?? "").trim() || !String(source.permalink ?? "").trim()) throw new Error("Il JSON sorgente Reddit deve contenere title, selftext e permalink");
    const normalizedSource = { ...source, title: String(source.title).trim(), selftext: String(source.selftext).trim(), permalink: String(source.permalink).trim(), theme: resolveRedditTheme(String(source.theme ?? options.theme)) };
    const rewrite = await rewriteRedditStory(normalizedSource, options);
    return { provider: rewrite.provider, text: rewrite.text, hook: rewrite.hook, redditSource: normalizedSource, wordCount: rewrite.wordCount };
  }
  if (options.scriptFile) {
    const scriptPath = path.resolve(options.scriptFile);
    if (!(await fileExists(scriptPath))) throw new Error(`File script non trovato: ${scriptPath}. Sostituisci il percorso di esempio con il percorso reale di un file .txt o .json.`);
    const rawFile = (await readFile(scriptPath, "utf8")).trim();
    if (!rawFile) throw new Error("Il file script e vuoto");
    if (path.extname(scriptPath).toLowerCase() === ".json") {
      let payload;
      try {
        payload = JSON.parse(rawFile);
      } catch (error) {
        throw new Error(`JSON manuale non valido in ${scriptPath}: ${errorMessage(error)}`);
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Il JSON manuale deve contenere un oggetto con title, hook, script e gender");
      const title = String(payload.title ?? "").trim();
      const hook = String(payload.hook ?? "").replace(/\s+/gu, " ").trim();
      const text = String(payload.script ?? "").replace(/\s+/gu, " ").trim();
      const gender = String(payload.gender ?? "").trim().toUpperCase();
      const titleWords = title.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/gu) ?? [];
      if (titleWords.length < 3) throw new Error("Nel JSON manuale, title deve contenere almeno 3 parole");
      if (!hook) throw new Error("Nel JSON manuale, hook non puo essere vuoto");
      if (hook.length > 300) throw new Error("Nel JSON manuale, hook non puo superare 300 caratteri");
      if (!text) throw new Error("Nel JSON manuale, script non puo essere vuoto");
      if (!["M", "F", "MALE", "FEMALE"].includes(gender)) throw new Error('Nel JSON manuale, gender deve essere "M" oppure "F"');
      return { provider: "manual-json", title, text, hook, manualPerspective: gender === "F" || gender === "FEMALE" ? "female" : "male" };
    }
    return { provider: "file", text: rawFile, hook: fallbackHook(rawFile) };
  }
  const provider = (process.env.SCRIPT_PROVIDER ?? "builtin").toLowerCase();
  if (provider === "reddit" || provider === "reddit-gemini") {
    const source = await acquireRedditStory(options);
    const rewrite = await rewriteRedditStory(source, options);
    return { provider: rewrite.provider, text: rewrite.text, hook: rewrite.hook, redditSource: source, wordCount: rewrite.wordCount };
  }
  if (provider !== "gemini") return { provider: "builtin", text: builtinScript, hook: fallbackHook(builtinScript) };
  const hasAiKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GROQ_API_KEY ?? "");
  if (!hasAiKey) throw new Error("SCRIPT_PROVIDER=gemini richiede GEMINI_API_KEY oppure GROQ_API_KEY nel file .env");
  const editorialTheme = resolveRedditTheme(options.theme);
  const { isLongForm, minimumWords, maximumWords, targetDuration, targetPlaybackDuration, voiceSpeed } = resolveScriptWordRange(options);
  const prompt = [
    "Write one original English Reddit-style story for a vertical short.",
    `Theme: ${editorialTheme}. ${themeGuidance[editorialTheme]}`,
    `Length: ${minimumWords} to ${maximumWords} spoken words, targeting about ${targetDuration} seconds before local ${voiceSpeed}x playback (about ${targetPlaybackDuration} seconds final). The final video may naturally vary in length, but must stay between ${options.minDuration} and ${options.maxDuration} seconds.`,
    "Make the very first spoken sentence the hook: 5 to 9 simple words, easy to understand in 1 to 2 seconds, with an immediate secret, danger, betrayal, impossible choice or emotional shock. It must create an urgent question in the viewer's mind without revealing the ending. Avoid generic openings, greetings, filler, fake claims, all caps and exaggerated punctuation. Then build emotional tension in multiple turns, add specific believable details and a late reveal, do not reveal the final judgment too early, and end with a question.",
    "Prioritize empathy, nostalgia and recognizable human moments over rage-bait, cruelty or shock value.",
    "Use plain everyday English suitable for children and teenagers around ages 10 to 16. Prefer short sentences, common words, clear verbs and concrete details. Avoid advanced vocabulary, long clauses, difficult idioms and dense slang. Keep it natural and emotional, not babyish.",
    "Also create a separate short social-media description hook based on the opening line. It must be 5 to 9 simple English words, strong enough to stop the scroll, and must tease the emotional conflict without revealing the ending. Do not write a heading.",
    'Return valid JSON only with exactly two string fields: {"script":"...","hook":"..."}. The script is the only text that will be spoken.',
  ].join(" ");
  const response = await generateTextWithFallback({ prompt: `${prompt} You must complete the entire story and stay within the requested word count.`, maxOutputTokens: isLongForm ? 2000 : 900, operation: "Generazione storia" });
  const rawText = response.text;
  const story = parseGeminiStoryOutput(rawText, "Generazione storia");
  const text = story.text;
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (isLongForm && wordCount < minimumWords) throw new Error(`Gemini ha restituito uno script troppo corto (${wordCount} parole, minimo ${minimumWords})`);
  return { provider: response.provider, text, hook: story.hook };
}

async function inferNarratorPerspective(text, scriptProvider, requestedPerspective) {
  const requested = String(requestedPerspective || "auto").toLowerCase();
  if (requested === "male" || requested === "female") return requested;
  if (requested !== "auto") throw new Error("--perspective deve essere auto, male o female");

  const hasAiKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GROQ_API_KEY ?? "");
  if (hasAiKey && scriptUsesLlmProvider(scriptProvider)) {
    try {
      const response = await generateTextWithFallback({ prompt: `Read this English first-person Reddit story and decide whether the narrator should use a male or female voice. Infer it from explicit identity clues and relationship context. Output exactly one word: male or female. Story:\n${text}`, maxOutputTokens: 120, operation: "Riconoscimento gender" });
      const answer = response.text.toLowerCase();
      if (/\bfemale\b/u.test(answer)) return "female";
      if (/\bmale\b/u.test(answer)) return "male";
    } catch (error) {
      await logEvent("WARN", `Riconoscimento gender AI non disponibile: ${errorMessage(error)}`);
    }
  }

  const femaleClues = /\b(woman|girl|daughter|sister|wife|girlfriend|fianc(?:e|ée)|mom|mother|bride|she|her)\b/iu;
  const maleClues = /\b(man|boy|son|brother|husband|boyfriend|fiancé|dad|father|groom|he|him|his)\b/iu;
  if (femaleClues.test(text) && !maleClues.test(text)) return "female";
  return "male";
}

async function synthesizeVoiceover(text, outputDirectory, perspective) {
  const apiKey = process.env.TTS_API_KEY ?? "";
  const normalizedPerspective = String(perspective || process.env.TTS_DEFAULT_PERSPECTIVE || "auto").toLowerCase();
  if (normalizedPerspective !== "male" && normalizedPerspective !== "female") throw new Error("--perspective deve essere male o female");
  const maleVoiceIds = (process.env.TTS_VOICE_IDS_MALE ?? process.env.TTS_VOICE_ID_MALE ?? process.env.TTS_VOICE_ID ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const voiceId = normalizedPerspective === "female"
    ? process.env.TTS_VOICE_ID_FEMALE ?? ""
    : maleVoiceIds[Math.floor(Math.random() * maleVoiceIds.length)] ?? "";
  if ((process.env.TTS_PROVIDER ?? "elevenlabs").toLowerCase() !== "elevenlabs") throw new Error("Il runner locale richiede TTS_PROVIDER=elevenlabs");
  if (!apiKey || !voiceId) throw new Error(`Configura TTS_API_KEY e ${normalizedPerspective === "female" ? "TTS_VOICE_ID_FEMALE" : "TTS_VOICE_IDS_MALE"} nel file .env`);
  const modelId = process.env.TTS_MODEL_ID ?? "eleven_multilingual_v2";
  const outputFormat = process.env.TTS_OUTPUT_FORMAT ?? "mp3_44100_128";
  const voiceSpeed = resolveVoiceSpeed();
  const cacheKey = createHash("sha256").update(JSON.stringify({ text, voiceId, modelId, outputFormat, voiceSpeed })).digest("hex");
  const elevenLabsAudioPath = path.join(outputDirectory, `${cacheKey}-elevenlabs.mp3`);
  const audioPath = voiceSpeed === 1 ? elevenLabsAudioPath : path.join(outputDirectory, `${cacheKey}-voice-${voiceSpeed.toFixed(2)}x.mp3`);
  if (await fileExists(audioPath)) return { audioPath, voiceId, speed: voiceSpeed };
  if (!(await fileExists(elevenLabsAudioPath))) {
    if (String(process.env.TTS_PREFLIGHT_QUOTA ?? "true").toLowerCase() !== "false") {
      const accountResponse = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": apiKey } });
      if (accountResponse.ok) {
        const account = await accountResponse.json();
        const characterCount = Number(account.subscription?.character_count);
        const characterLimit = Number(account.subscription?.character_limit);
        const remainingCharacters = characterLimit - characterCount;
        if (Number.isFinite(remainingCharacters) && remainingCharacters < text.length) {
          throw new Error(`Quota ElevenLabs insufficiente: restano circa ${Math.max(0, remainingCharacters)} caratteri, ma lo script ne richiede ${text.length}. Riduci la durata o ricarica il piano.`);
        }
      }
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    });
    if (!response.ok) {
      const providerDetail = (await response.text()).replace(/\s+/gu, " ").trim().slice(0, 500);
      throw new Error(`ElevenLabs ha restituito HTTP ${response.status}${providerDetail ? `: ${providerDetail}` : ""}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) throw new Error("ElevenLabs ha restituito audio vuoto");
    await writeFile(elevenLabsAudioPath, bytes);
  }
  if (voiceSpeed !== 1) {
    await runCommand("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", elevenLabsAudioPath, "-vn", "-af", `atempo=${voiceSpeed.toFixed(6)}`, "-c:a", "libmp3lame", "-b:a", "128k", audioPath]);
    await logEvent("INFO", "Voice-over velocizzato localmente", { speed: voiceSpeed, audioPath });
  }
  return { audioPath, voiceId, speed: voiceSpeed };
}

async function captionForgeIsReady(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureCaptionForge(baseUrl) {
  if (await captionForgeIsReady(baseUrl)) return;
  const binary = process.env.CAPTIONFORGE_BINARY ?? path.join(root, ".data", "captionforge-venv312", "bin", "captionforge");
  if (!(await fileExists(binary))) throw new Error(`CaptionForge non trovato in ${binary}. Installa CaptionForge nell'ambiente locale prima di usare il runner.`);
  const port = new URL(baseUrl).port || "8420";
  const child = spawn(binary, ["serve", "--port", port, "--model", process.env.CAPTIONFORGE_MODEL ?? "base", "--no-browser"], { detached: true, stdio: "ignore" });
  child.unref();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await captionForgeIsReady(baseUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`CaptionForge non e diventato disponibile su ${baseUrl}`);
}

async function captionForgeTranscribe(baseUrl, videoPath) {
  const form = new FormData();
  form.append("file", new Blob([await readFile(videoPath)], { type: "video/mp4" }), path.basename(videoPath));
  form.append("model_size", process.env.CAPTIONFORGE_MODEL ?? "base");
  form.append("language", "en");
  const response = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`CaptionForge upload ha restituito HTTP ${response.status}`);
  const created = await response.json();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusResponse = await fetch(`${baseUrl}/api/jobs/${created.job_id}`);
    const status = await statusResponse.json();
    if (status.status === "done") {
      const segmentsResponse = await fetch(`${baseUrl}/api/jobs/${created.job_id}/segments`);
      if (!segmentsResponse.ok) throw new Error("CaptionForge non ha restituito i segmenti");
      return { jobId: created.job_id, segments: await segmentsResponse.json() };
    }
    if (status.status === "error") throw new Error(`CaptionForge: ${status.error ?? "errore di trascrizione"}`);
    if (attempt % 10 === 0) console.log(`CaptionForge: ${status.stage_label ?? status.status} (${Math.round((status.progress ?? 0) * 100)}%)`);
  }
  throw new Error("CaptionForge ha superato il tempo massimo di attesa");
}

async function whisperLocalTranscribe(audioPath, scriptPath, segmentsPath) {
  const python = process.env.WHISPER_PYTHON ?? path.join(root, ".data", "whisper-venv", "bin", "python");
  if (!(await fileExists(python))) throw new Error(`Whisper locale non installato in ${python}. Esegui npm run setup:whisper una volta prima della generazione.`);
  const model = process.env.WHISPER_MODEL ?? "base";
  await runCommand(python, [path.join(root, "scripts", "transcribe-whisper-local.py"), audioPath, scriptPath, segmentsPath, model], {
    env: { ...process.env, WHISPER_LANGUAGE: process.env.WHISPER_LANGUAGE ?? "en", WHISPER_DEVICE: process.env.WHISPER_DEVICE ?? "cpu", WHISPER_COMPUTE_TYPE: process.env.WHISPER_COMPUTE_TYPE ?? "int8" },
  });
  const payload = JSON.parse(await readFile(segmentsPath, "utf8"));
  if (!Array.isArray(payload.segments) || payload.segments.length === 0) throw new Error("Whisper locale non ha restituito segmenti utilizzabili");
  return { provider: "whisper-local", model, segments: payload.segments, recognisedWordCount: payload.recognisedWordCount, scriptWordCount: payload.scriptWordCount };
}

function normalizeTitle(rawTitle) {
  const words = String(rawTitle).match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/gu) ?? [];
  if (words.length < 3) return "The Hidden Truth";
  return words.slice(0, 4).map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join(" ");
}

function slugifyTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "") || "untitled-story";
}

async function generateVideoTitle(text, scriptProvider) {
  const hasAiKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? process.env.GROQ_API_KEY ?? "");
  if (hasAiKey && scriptUsesLlmProvider(scriptProvider)) {
    try {
      const response = await generateTextWithFallback({ prompt: `Create a clear English video title summarizing this Reddit story. Output exactly 3 or 4 words, title case, no punctuation and no explanation. Story:\n${text}`, maxOutputTokens: 80, operation: "Titolo video" });
      const answer = response.text.trim();
      const title = normalizeTitle(answer);
      if (title !== "The Hidden Truth" || answer.toLowerCase().includes("hidden truth")) return { title, slug: slugifyTitle(title), provider: response.provider };
    } catch (error) {
      await logEvent("WARN", `Titolo Gemini fallito, uso fallback: ${errorMessage(error)}`);
    }
  }
  const fallbackTitle = "The Hidden Truth";
  return { title: fallbackTitle, slug: slugifyTitle(fallbackTitle), provider: "fallback" };
}

function formatSeconds(seconds) {
  return Number(seconds).toFixed(2);
}

function usageLine(entry) {
  return [entry.status, `source=${entry.source}`, `start=${formatSeconds(entry.start)}`, `end=${formatSeconds(entry.end)}`, `duration=${formatSeconds(entry.duration)}`, `run=${entry.run}`, `title=${entry.title}`, `output=${entry.output}`].join("\t");
}

function parseUsageLine(line) {
  if (!/^(?:IN_PROGRESS|COMPLETED)\t/u.test(line)) return null;
  const [status, ...fields] = line.split("\t");
  const entry = { status };
  for (const field of fields) {
    const separator = field.indexOf("=");
    if (separator > 0) entry[field.slice(0, separator)] = field.slice(separator + 1);
  }
  return { ...entry, start: Number(entry.start), end: Number(entry.end), duration: Number(entry.duration) };
}

async function discoverHistoricalUsage(sourcePath) {
  const pipelineDirectory = path.join(root, ".data", "local-pipeline");
  let directories;
  try {
    directories = await readdir(pipelineDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const sourceName = path.basename(sourcePath);
  const entries = [];
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const manifestPath = path.join(pipelineDirectory, directory.name, "manifest.json");
    if (!(await fileExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (!manifest.qc?.passed || path.basename(manifest.sourcePath ?? "") !== sourceName) continue;
      const outputPath = manifest.outputPath;
      if (!outputPath || !(await fileExists(outputPath))) continue;
      const outputProbe = await probe(outputPath);
      const start = Number(manifest.sourceStartSeconds ?? 0);
      if (!Number.isFinite(start) || !outputProbe.duration) continue;
      entries.push({ status: "COMPLETED", source: sourceName, start, end: start + outputProbe.duration, duration: outputProbe.duration, run: manifest.runId ?? directory.name, title: manifest.title ?? "historical-output", output: outputPath });
    } catch (error) {
      await logEvent("WARN", `Manifest storico ignorato: ${manifestPath}`, { error: errorMessage(error) });
    }
  }
  return entries;
}

async function loadUsageLedger(usageFile, sourcePath) {
  const sourceName = path.basename(sourcePath);
  if (!(await fileExists(usageFile))) {
    await writeFile(usageFile, `# ShortFactory source usage ledger\n# source=${sourceName}\n# Intervalli in secondi: start -> end. Le righe IN_PROGRESS con video finale QC valido restano occupate; le prenotazioni fallite vengono liberate.\n`, "utf8");
  }
  const parsedEntries = (await readFile(usageFile, "utf8")).split(/\r?\n/u).map(parseUsageLine).filter(Boolean).filter((entry) => entry.source === sourceName);
  const current = [];
  for (const entry of parsedEntries) {
    if (entry.status !== "IN_PROGRESS" || await usageEntryHasPassedQc(entry)) {
      current.push(entry);
      continue;
    }
    await logEvent("INFO", "Prenotazione sorgente abbandonata resa nuovamente disponibile", { run: entry.run, start: entry.start, end: entry.end, source: entry.source });
  }
  const knownRuns = new Set(current.map((entry) => entry.run));
  const historical = await discoverHistoricalUsage(sourcePath);
  for (const entry of historical) {
    if (knownRuns.has(entry.run)) continue;
    await appendFile(usageFile, `${usageLine(entry)}\n`, "utf8");
    current.push(entry);
    knownRuns.add(entry.run);
  }
  return current;
}

async function usageEntryHasPassedQc(entry) {
  const runDirectory = path.join(root, ".data", "local-pipeline", entry.run);
  const manifestPath = path.join(runDirectory, "manifest.json");
  if (!(await fileExists(manifestPath))) return false;
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return manifest.qc?.passed === true && typeof manifest.outputPath === "string" && await fileExists(manifest.outputPath);
  } catch {
    return false;
  }
}

function chooseUnusedSegment(entries, requestedStart, duration, sourceDuration, sourceName) {
  const occupied = entries.filter((entry) => entry.source === sourceName && Number.isFinite(entry.start) && Number.isFinite(entry.end)).sort((left, right) => left.start - right.start);
  if (requestedStart !== undefined) {
    if (!Number.isFinite(requestedStart) || requestedStart < 0) throw new Error("--source-start deve essere un numero maggiore o uguale a zero");
    if (requestedStart + duration > sourceDuration) throw new Error(`Il segmento richiesto termina a ${(requestedStart + duration).toFixed(2)}s, oltre la durata sorgente di ${sourceDuration.toFixed(2)}s`);
    const overlap = occupied.find((entry) => requestedStart < entry.end && requestedStart + duration > entry.start);
    if (overlap) throw new Error(`Il segmento richiesto si sovrappone a ${formatSeconds(overlap.start)}-${formatSeconds(overlap.end)}s, già registrato in ${overlap.run}`);
    return requestedStart;
  }
  let candidate = 0;
  for (const entry of occupied) {
    if (candidate + duration <= entry.start - 0.05) return candidate;
    candidate = Math.max(candidate, entry.end);
  }
  if (candidate + duration <= sourceDuration) return candidate;
  throw new Error(`Non c'è un segmento libero di ${duration.toFixed(2)}s nella sorgente. Registro utilizzato: ${occupied.map((entry) => `${formatSeconds(entry.start)}-${formatSeconds(entry.end)}s`).join(", ") || "nessuno"}`);
}

async function appendUsageEntry(usageFile, entry) {
  await appendFile(usageFile, `${usageLine(entry)}\n`, "utf8");
}

function sourceIsFullyUsed(entries, sourceDuration) {
  const epsilon = Number(process.env.SOURCE_COVERAGE_EPSILON_SECONDS ?? 0.5);
  const completed = entries
    .filter((entry) => entry.status === "COMPLETED" && Number.isFinite(entry.start) && Number.isFinite(entry.end))
    .map((entry) => ({ start: Math.max(0, entry.start), end: Math.min(sourceDuration, entry.end) }))
    .filter((entry) => entry.end > entry.start)
    .sort((left, right) => left.start - right.start);
  let coveredUntil = 0;
  for (const interval of completed) {
    if (interval.start > coveredUntil + epsilon) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
    if (coveredUntil >= sourceDuration - epsilon) return true;
  }
  return coveredUntil >= sourceDuration - epsilon;
}

async function moveExhaustedSourceToTrash(sourcePath, entries, sourceDuration) {
  if (String(process.env.AUTO_DELETE_EXHAUSTED_SOURCE ?? "true").toLowerCase() === "false") return null;
  if (!(await fileExists(sourcePath)) || !sourceIsFullyUsed(entries, sourceDuration)) return null;
  const trashDirectory = path.join(os.homedir(), ".Trash");
  await mkdir(trashDirectory, { recursive: true });
  const sourceName = path.basename(sourcePath);
  let trashPath = path.join(trashDirectory, sourceName);
  let suffix = 1;
  while (await fileExists(trashPath)) {
    trashPath = path.join(trashDirectory, `${path.basename(sourceName, path.extname(sourceName))}-${suffix}${path.extname(sourceName)}`);
    suffix += 1;
  }
  await rename(sourcePath, trashPath);
  return { action: "MOVED_TO_TRASH", sourcePath, trashPath, sourceDurationSeconds: sourceDuration };
}

async function moveUploadedRunToTrash(runDirectory) {
  if (String(process.env.AUTO_DELETE_UPLOADED_VIDEO ?? "true").toLowerCase() === "false") return null;
  const pipelineDirectory = path.resolve(root, ".data", "local-pipeline");
  const resolvedRunDirectory = path.resolve(runDirectory);
  if (path.dirname(resolvedRunDirectory) !== pipelineDirectory) throw new Error(`Pulizia upload rifiutata: la cartella non è una run locale valida: ${resolvedRunDirectory}`);
  if (!(await fileExists(resolvedRunDirectory))) return null;
  const trashDirectory = path.join(os.homedir(), ".Trash");
  await mkdir(trashDirectory, { recursive: true });
  const runName = path.basename(resolvedRunDirectory);
  let trashPath = path.join(trashDirectory, runName);
  let suffix = 1;
  while (await fileExists(trashPath)) {
    trashPath = path.join(trashDirectory, `${runName}-${suffix}`);
    suffix += 1;
  }
  await rename(resolvedRunDirectory, trashPath);
  return { action: "MOVED_RUN_TO_TRASH_AFTER_UPLOAD", runDirectory: resolvedRunDirectory, trashPath };
}

function uploadSucceededOnYouTubeAndTikTok(uploadResult) {
  if (uploadResult.status !== "SUCCESS") return false;
  const successfulPlatforms = new Set(uploadResult.results.filter((result) => result.status === "SUCCESS").map((result) => result.platform));
  return successfulPlatforms.has("YOUTUBE") && successfulPlatforms.has("TIKTOK");
}

async function resolvePlatformCredentialsFile() {
  const configured = process.env.PLATFORM_CREDENTIALS_FILE?.trim();
  const candidates = [
    path.join(root, ".data", "platform-credentials.json"),
    configured ? path.resolve(root, configured) : null,
    configured ? path.resolve(root, "apps", "api", configured) : null,
  ].filter(Boolean);
  for (const candidate of candidates) if (await fileExists(candidate)) return candidate;
  return candidates[0] ?? path.join(root, ".data", "platform-credentials.json");
}

async function createConnectedPublishers() {
  const credentialsFile = await resolvePlatformCredentialsFile();
  const storedCredentials = await readStoredPlatformCredentials(credentialsFile, process.env.APP_ENCRYPTION_KEY ?? "development-only-replace-me");
  const publishers = [];
  const unavailable = [];
  const youtubeToken = process.env.YOUTUBE_ACCESS_TOKEN || storedCredentials.YOUTUBE?.accessToken;
  const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN || storedCredentials.TIKTOK?.accessToken;

  if (youtubeToken) {
    if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET || !process.env.YOUTUBE_REDIRECT_URI) unavailable.push({ platform: "YOUTUBE", status: "FAILED", error: "YOUTUBE_OAUTH_CONFIGURATION_MISSING" });
    else publishers.push({ platform: "YOUTUBE", publisher: new YouTubePublisher({ clientId: process.env.YOUTUBE_CLIENT_ID, clientSecret: process.env.YOUTUBE_CLIENT_SECRET, redirectUri: process.env.YOUTUBE_REDIRECT_URI, accessToken: youtubeToken, accessTokenExpiresAt: storedCredentials.YOUTUBE?.tokenExpiresAt, refreshToken: process.env.YOUTUBE_REFRESH_TOKEN || storedCredentials.YOUTUBE?.refreshToken, defaultPrivacyStatus: "public" }) });
  }
  if (tiktokToken) {
    if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) unavailable.push({ platform: "TIKTOK", status: "FAILED", error: "TIKTOK_OAUTH_CONFIGURATION_MISSING" });
    else publishers.push({ platform: "TIKTOK", publisher: new TikTokPublisher({ clientKey: process.env.TIKTOK_CLIENT_KEY, clientSecret: process.env.TIKTOK_CLIENT_SECRET, accessToken: tiktokToken, accessTokenExpiresAt: storedCredentials.TIKTOK?.tokenExpiresAt, openId: process.env.TIKTOK_OPEN_ID || storedCredentials.TIKTOK?.externalAccountId, mode: process.env.TIKTOK_MODE === "DIRECT_POST" ? "DIRECT_POST" : "UPLOAD_DRAFT", privacyLevel: process.env.TIKTOK_PRIVACY_LEVEL ?? "PUBLIC_TO_EVERYONE", fallbackToDraft: process.env.TIKTOK_MODE === "DIRECT_POST" ? false : String(process.env.TIKTOK_FALLBACK_TO_DRAFT ?? "true").toLowerCase() === "true" }) });
  }
  if (process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID) publishers.push({ platform: "INSTAGRAM", publisher: new InstagramPublisher({ accessToken: process.env.INSTAGRAM_ACCESS_TOKEN, instagramUserId: process.env.INSTAGRAM_USER_ID, apiVersion: process.env.INSTAGRAM_API_VERSION || "v23.0" }) });

  return { credentialsFile, publishers, unavailable };
}

async function uploadToConnectedPlatforms({ filePath, title, script, hook, runId, scheduledAt = new Date().toISOString(), previousResults = [] }) {
  const connection = await createConnectedPublishers();
  const connectedPlatforms = new Set(connection.publishers.map(({ platform }) => platform));
  const previousSuccesses = previousResults.filter((result) => result.status === "SUCCESS" && connectedPlatforms.has(result.platform));
  const alreadySuccessful = new Set(previousSuccesses.map((result) => result.platform));
  const publishersToAttempt = connection.publishers.filter(({ platform }) => !alreadySuccessful.has(platform));
  const results = [...connection.unavailable, ...previousSuccesses];
  if (connection.publishers.length === 0) return { status: results.length > 0 ? "PARTIAL_FAILURE" : "SKIPPED", credentialsFile: connection.credentialsFile, results, message: results.length > 0 ? "Nessuna piattaforma configurata correttamente." : "Nessuna piattaforma collegata." };
  if (publishersToAttempt.length === 0) return { status: results.every((result) => result.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_FAILURE", credentialsFile: connection.credentialsFile, results, successful: previousSuccesses.length, attempted: connection.publishers.length, message: "Tutte le piattaforme collegate erano già state completate." };

  const description = String(hook ?? "").trim().slice(0, 5000);
  const scheduledDate = new Date(scheduledAt);
  if (!Number.isFinite(scheduledDate.getTime())) throw new Error(`--scheduled-at non valido: ${scheduledAt}`);
  const waitMs = scheduledDate.getTime() - Date.now();
  if (waitMs > 0) {
    await logEvent("INFO", "Upload in attesa dell'orario programmato", { scheduledAt, waitMs });
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  const publishInput = { videoId: runId, title: title.slice(0, 100), description: description.slice(0, 5000), filePath, scheduledAt, privacyStatus: "public" };
  for (const { platform, publisher } of publishersToAttempt) {
    await logEvent("INFO", `UPLOAD ${platform}`);
    try {
      const account = await publisher.validateAccount();
      if (!account.ok) {
        results.push({ platform, status: "FAILED", error: account.detail ?? "ACCOUNT_NOT_AVAILABLE" });
        await logEvent("ERROR", `UPLOAD ${platform} non disponibile`, { detail: account.detail ?? "ACCOUNT_NOT_AVAILABLE" });
        continue;
      }
      const result = await publisher.publish(publishInput);
      results.push(result);
      await logEvent(result.status === "SUCCESS" ? "INFO" : "ERROR", `UPLOAD ${platform} ${result.status}`, { externalPostId: result.externalPostId, externalUrl: result.externalUrl, error: result.error });
    } catch (error) {
      const failure = { platform, status: "FAILED", error: errorMessage(error) };
      results.push(failure);
      await logEvent("ERROR", `UPLOAD ${platform} fallito`, { error: failure.error });
    }
  }
  const successful = results.filter((result) => result.status === "SUCCESS").length;
  return { status: successful === connection.publishers.length && results.every((result) => result.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_FAILURE", credentialsFile: connection.credentialsFile, results, successful, attempted: connection.publishers.length };
}

async function findLatestReviewableManifest(runDirectory) {
  if (runDirectory) {
    const manifestPath = path.resolve(runDirectory, "manifest.json");
    if (!(await fileExists(manifestPath))) throw new Error(`Manifest non trovato nella run indicata: ${manifestPath}`);
    return manifestPath;
  }
  const pipelineDirectory = path.join(root, ".data", "local-pipeline");
  let entries;
  try {
    entries = await readdir(pipelineDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("Nessun video generato da caricare: la cartella delle run non esiste ancora.");
    throw error;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(pipelineDirectory, entry.name, "manifest.json");
    if (!(await fileExists(manifestPath))) continue;
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      const outputPath = manifest.outputPath;
      if (!manifest.qc?.passed || !outputPath || !(await fileExists(outputPath))) continue;
      candidates.push({ manifestPath, createdAt: Date.parse(manifest.createdAt ?? "") || 0 });
    } catch (error) {
      await logEvent("WARN", "Manifest ignorato durante la ricerca dell'ultimo video", { manifestPath, error: errorMessage(error) });
    }
  }
  candidates.sort((left, right) => right.createdAt - left.createdAt || right.manifestPath.localeCompare(left.manifestPath));
  if (candidates.length === 0) throw new Error("Nessun video QC valido da caricare. Esegui prima npm run generate e controlla il video.");
  return candidates[0].manifestPath;
}

async function uploadLatestGeneratedVideo(options) {
  const manifestPath = await findLatestReviewableManifest(options.runDirectory);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!manifest.qc?.passed) throw new Error("La run indicata non ha superato il controllo qualità e non può essere caricata.");
  const filePath = path.resolve(manifest.outputPath);
  if (!(await fileExists(filePath))) throw new Error(`Video da caricare non trovato: ${filePath}`);
  const script = manifest.scriptPath && await fileExists(manifest.scriptPath) ? await readFile(manifest.scriptPath, "utf8") : "";
  const hook = manifest.hookPath && await fileExists(manifest.hookPath) ? await readFile(manifest.hookPath, "utf8") : String(manifest.hook ?? "").trim();
  const runDirectory = path.dirname(manifestPath);
  logPath = manifest.logPath && await fileExists(manifest.logPath) ? manifest.logPath : path.join(runDirectory, "pipeline.log");
  await logEvent("INFO", "Video selezionato per upload", { filePath, manifestPath, title: manifest.title });
  const previousResults = Array.isArray(manifest.upload?.results) ? manifest.upload.results : [];
  const uploadResult = await runStage("caricamento sulle piattaforme collegate", () => uploadToConnectedPlatforms({ filePath, title: manifest.title, script, hook, runId: manifest.runId, scheduledAt: options.scheduledAt, previousResults }));
  manifest.upload = uploadResult;
  let uploadedRunDisposition = null;
  let manifestWritePath = manifestPath;
  if (uploadSucceededOnYouTubeAndTikTok(uploadResult)) {
    try {
      uploadedRunDisposition = await moveUploadedRunToTrash(runDirectory);
      if (uploadedRunDisposition) {
        logPath = path.join(uploadedRunDisposition.trashPath, "pipeline.log");
        manifestWritePath = path.join(uploadedRunDisposition.trashPath, "manifest.json");
        manifest.outputPath = path.join(uploadedRunDisposition.trashPath, path.basename(filePath));
        await logEvent("INFO", "Cartella della run spostata nel Cestino dopo upload YouTube e TikTok", uploadedRunDisposition);
      }
    } catch (error) {
      await logEvent("WARN", "Upload YouTube e TikTok completato ma la cartella non è stata spostata nel Cestino", { error: errorMessage(error), runDirectory });
    }
  }
  manifest.uploadedRunDisposition = uploadedRunDisposition;
  manifest.uploadedVideoDisposition = null;
  manifest.logPath = logPath;
  await writeFile(manifestWritePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const uploadLines = uploadResult.results.length > 0 ? uploadResult.results.map((result) => `${result.platform}: ${result.status}${result.externalUrl ? ` (${result.externalUrl})` : result.error ? ` — ${result.error}` : ""}`).join("\n") : uploadResult.message;
  console.log(`\nUpload ${uploadResult.status === "SUCCESS" ? "completato" : "fallito"}\nVideo: ${manifest.outputPath}\n${uploadLines}\nLog: ${logPath}`);
  if (uploadResult.status !== "SUCCESS") process.exitCode = 1;
}

async function main() {
  await mkdir(path.join(root, ".data", "local-pipeline"), { recursive: true });
  logPath = path.join(root, ".data", "local-pipeline", "generate-errors.log");
  await loadRuntimeEnv();
  const options = parseArgs(process.argv.slice(2));
  await logEvent("INFO", options.command === "upload" ? "Avvio upload" : "Avvio generazione", { command: process.argv.slice(2).join(" ") || "generate" });

  let outputDirectory = "";
  let sourcePath = "";
  let redditSource = null;
  try {
    if (options.command === "upload") {
      await uploadLatestGeneratedVideo(options);
      return;
    }
    sourcePath = await runStage("ricerca video sorgente", () => resolveSource(options));
    const runId = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${path.basename(sourcePath, path.extname(sourcePath)).replace(/[^a-z0-9]+/giu, "-").toLowerCase()}`;
    outputDirectory = path.resolve(options.outputDir ?? path.join(root, ".data", "local-pipeline", runId));
    await mkdir(outputDirectory, { recursive: true });
    logPath = path.join(outputDirectory, "pipeline.log");
    await appendFile(logPath, `${new Date().toISOString()} [INFO] Log run ${runId}\n`, "utf8");
    await logEvent("INFO", "Video sorgente selezionato", { sourcePath, outputDirectory });

    if (options.sourceStart !== undefined && (!Number.isFinite(options.sourceStart) || options.sourceStart < 0)) throw new Error("--source-start deve essere un numero maggiore o uguale a zero");
    if (!Number.isFinite(options.minDuration) || !Number.isFinite(options.maxDuration) || !Number.isFinite(options.targetDuration) || options.minDuration <= 0 || options.maxDuration < options.minDuration || options.targetDuration <= 0) throw new Error("Intervallo durata non valido");
    if (options.maxDuration > 180) throw new Error("Per mantenere il formato YouTube Shorts, --max-duration non può superare 180 secondi");
    const sourceProbe = await runStage("controllo video sorgente", () => probe(sourcePath));
    if (!sourceProbe.duration || !sourceProbe.streams.some((stream) => stream.codec_type === "video")) throw new Error("Il file sorgente non è un video leggibile");

    const usageFile = path.resolve(options.usageFile ?? path.join(path.dirname(sourcePath), "source-usage.txt"));
    const usageEntries = await runStage("lettura registro minutaggi", () => loadUsageLedger(usageFile, sourcePath));
    const scriptResult = await runStage("generazione storia inglese", () => generateScript(options));
    redditSource = scriptResult.redditSource ?? null;
    const scriptPath = path.join(outputDirectory, "script-en.txt");
    const hookPath = path.join(outputDirectory, "hook-en.txt");
    await writeFile(scriptPath, `${scriptResult.text}\n`, "utf8");
    await writeFile(hookPath, `${scriptResult.hook ?? fallbackHook(scriptResult.text)}\n`, "utf8");
    if (redditSource) {
      await writeFile(path.join(outputDirectory, "reddit-source.json"), `${JSON.stringify({
        provider: "reddit",
        postId: redditSource.id,
        subreddit: redditSource.subreddit,
        permalink: redditSource.permalink,
        publicScoreAtCollection: redditSource.score,
        theme: redditSource.theme,
        collectedAt: new Date().toISOString(),
        usageFile: redditSource.usageFile,
        note: "The source is retained for editorial traceability; the video uses an original adaptation, not a verbatim reading.",
      }, null, 2)}\n`, "utf8");
    }
    const titleResult = await runStage(scriptResult.title ? "uso titolo dal JSON" : "creazione titolo video", () => scriptResult.title
      ? { title: normalizeTitle(scriptResult.title), slug: slugifyTitle(normalizeTitle(scriptResult.title)), provider: "manual-json" }
      : generateVideoTitle(scriptResult.text, scriptResult.provider));
    const perspective = await runStage(scriptResult.manualPerspective ? "uso gender dal JSON" : "riconoscimento prospettiva e gender", () => scriptResult.manualPerspective
      ? scriptResult.manualPerspective
      : inferNarratorPerspective(scriptResult.text, scriptResult.provider, options.perspective || process.env.TTS_DEFAULT_PERSPECTIVE || "auto"));
    const voiceResult = await runStage(`voice-over ElevenLabs (${perspective})`, () => synthesizeVoiceover(scriptResult.text, outputDirectory, perspective));
    let audioPath = voiceResult.audioPath;
    const selectedVoiceId = voiceResult.voiceId;
    const introDuration = Math.max(0, Number(process.env.REDDIT_INTRO_DURATION ?? "2.5"));
    if (!Number.isFinite(introDuration)) throw new Error("REDDIT_INTRO_DURATION deve essere un numero maggiore o uguale a zero");
    const audioProbe = await runStage("controllo durata voice-over", async () => {
      let result = await probe(audioPath);
      const safeMaximumDuration = options.maxDuration;
      if (result.duration > safeMaximumDuration) {
        const speedFactor = result.duration / safeMaximumDuration;
        const fittedAudioPath = path.join(outputDirectory, "voiceover-duration-fitted.mp3");
        await runCommand("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", audioPath, "-vn", "-af", `atempo=${speedFactor.toFixed(6)}`, "-c:a", "libmp3lame", "-b:a", "128k", fittedAudioPath]);
        const originalDuration = result.duration;
        audioPath = fittedAudioPath;
        result = await probe(audioPath);
        await logEvent("INFO", "Durata voice-over adattata localmente", { originalDuration, fittedDuration: result.duration, safeMaximumDuration, speedFactor });
      }
      await logEvent("INFO", "Voice-over pronto dall'inizio del video", { introDuration, finalAudioDuration: result.duration });
      return result;
    });
    const sourceStart = chooseUnusedSegment(usageEntries, options.sourceStart, audioProbe.duration, sourceProbe.duration, path.basename(sourcePath));
    const usageEntry = { status: "IN_PROGRESS", source: path.basename(sourcePath), start: sourceStart, end: sourceStart + audioProbe.duration, duration: audioProbe.duration, run: path.basename(outputDirectory), title: titleResult.title, output: "in-progress" };
    await appendUsageEntry(usageFile, usageEntry);
    await logEvent("INFO", "Segmento sorgente riservato", { start: sourceStart, end: sourceStart + audioProbe.duration, usageFile });

    const basePath = path.join(outputDirectory, "base.mp4");
    const segmentsPath = path.join(outputDirectory, "whisper-segments.json");
    const overlayPath = path.join(outputDirectory, "whisper-overlay.mov");
    const finalPath = path.join(outputDirectory, `${titleResult.slug}.mp4`);
    const subtitleFps = Number(process.env.SUBTITLE_FPS ?? "60");
    if (!Number.isFinite(subtitleFps) || subtitleFps < 1 || subtitleFps > 120) throw new Error(`SUBTITLE_FPS non valido: ${process.env.SUBTITLE_FPS}`);
    await runStage("composizione gameplay e voice-over", () => runCommand("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(sourceStart), "-stream_loop", "-1", "-i", sourcePath, "-i", audioPath, "-filter_complex", "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=brightness=-0.05:saturation=1.03[v]", "-map", "[v]", "-map", "1:a:0", "-t", String(audioProbe.duration), "-c:v", "libx264", "-preset", "veryfast", "-b:v", "6M", "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-movflags", "+faststart", basePath]));
    const introPath = introDuration > 0 ? path.join(outputDirectory, "postfully-story.png") : null;
    let introProvider = "disabled";
    if (introPath) {
      await runStage("download scheda Postfully", async () => {
        const requestedProvider = String(process.env.POSTFULLY_PROVIDER ?? "postfully-browser").trim().toLowerCase();
        const hook = compactPostfullyHook(scriptResult.hook ?? fallbackHook(scriptResult.text));
        await writeFile(path.join(outputDirectory, "postfully-hook.txt"), `${hook}\n`, "utf8");
        const localRenderer = ["python3", [path.join(root, "scripts", "render-reddit-intro.py"), outputDirectory, hook, titleResult.title]];
        const renderLocalFallback = async (provider) => {
          await runCommand(...localRenderer);
          const localPath = path.join(outputDirectory, "reddit-intro.png");
          if (await fileExists(localPath)) await rename(localPath, introPath);
          introProvider = provider;
        };
        if (requestedProvider === "local") {
          await renderLocalFallback("local-reddit-style");
          return;
        }
        if (requestedProvider !== "postfully-browser") throw new Error(`POSTFULLY_PROVIDER non supportato: ${requestedProvider}. Usa postfully-browser oppure local.`);
        try {
          await runCommand(process.execPath, [path.join(root, "scripts", "download-postfully-story.mjs"), outputDirectory, hook, titleResult.title]);
          introProvider = "postfully-browser";
        } catch (error) {
          await logEvent("ERROR", "Download Postfully fallito: nessuna scheda inserita", { error: errorMessage(error) });
          throw error;
        }
      });
    }

    const subtitleProvider = String(process.env.SUBTITLE_PROVIDER ?? "whisper-local").trim().toLowerCase();
    let captionResult;
    if (subtitleProvider === "whisper-local") {
      captionResult = await runStage("trascrizione Whisper locale", () => whisperLocalTranscribe(audioPath, scriptPath, segmentsPath));
    } else if (subtitleProvider === "captionforge") {
      const captionForgeUrl = process.env.CAPTIONFORGE_URL ?? "http://127.0.0.1:8420";
      captionResult = await runStage("trascrizione CaptionForge", async () => {
        await ensureCaptionForge(captionForgeUrl);
        return captionForgeTranscribe(captionForgeUrl, basePath);
      });
    } else {
      throw new Error(`SUBTITLE_PROVIDER non supportato: ${subtitleProvider}. Usa whisper-local oppure captionforge.`);
    }
    await writeFile(segmentsPath, JSON.stringify(captionResult.segments), "utf8");
    await runStage("render sottotitoli parola per parola", () => runCommand("python3", [path.join(root, "scripts", "render-captionforge-frames.py"), outputDirectory, segmentsPath, String(audioProbe.duration), String(subtitleFps)]));
    await runStage("render overlay sottotitoli", () => runCommand("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(outputDirectory, "caption-overlay.txt"), "-r", String(subtitleFps), "-t", String(audioProbe.duration), "-c:v", "qtrle", overlayPath]));
    const finalRenderArgs = ["-y", "-hide_banner", "-loglevel", "error", "-i", basePath, "-i", overlayPath];
    if (introPath) finalRenderArgs.push("-loop", "1", "-i", introPath);
    finalRenderArgs.push("-filter_complex", introPath ? `[0:v][1:v]overlay=0:680[captioned];[2:v]format=rgba,scale=920:-1[card];[captioned][card]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:enable='between(t,0,${introDuration})'[v]` : "[0:v][1:v]overlay=0:680[v]", "-map", "[v]", "-map", "0:a:0", "-t", String(audioProbe.duration), "-c:v", "libx264", "-preset", "veryfast", "-b:v", "4M", "-maxrate", "4M", "-bufsize", "8M", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "-metadata", `title=${titleResult.title}`, "-metadata", `comment=${captionResult.provider} word-timed captions; ${introProvider} intro=${introDuration}s; rights=${options.rightsStatus}`, finalPath);
    await runStage("render video finale", () => runCommand("ffmpeg", finalRenderArgs));

    let compressionResult = null;
    let finalProbe = await runStage("controllo dimensione video finale (100 MiB)", () => probe(finalPath));
    if (finalProbe.size > maxOutputFileSizeBytes) {
      compressionResult = await runStage("compressione automatica sotto 100 MiB", () => compressVideoToMaxSize(finalPath, finalProbe.duration));
      finalProbe = await runStage("ricontrollo qualità dopo compressione", () => probe(finalPath));
    }
    await logEvent("INFO", "Controllo dimensione video finale completato", { sizeBytes: finalProbe.size, maxSizeBytes: maxOutputFileSizeBytes, compressed: Boolean(compressionResult) });
    const video = finalProbe.streams.find((stream) => stream.codec_type === "video");
    const audio = finalProbe.streams.find((stream) => stream.codec_type === "audio");
    const minimumQualityDuration = scriptResult.provider === "manual-json" ? 0 : options.minDuration;
    const checks = [
      { name: "resolution", passed: video?.width === 1080 && video?.height === 1920 },
      { name: "duration", passed: finalProbe.duration >= minimumQualityDuration && finalProbe.duration <= options.maxDuration },
      { name: "h264", passed: video?.codec_name === "h264" },
      { name: "audio", passed: audio?.codec_name === "aac" },
      { name: "file_size", passed: finalProbe.size > 0 && finalProbe.size <= maxOutputFileSizeBytes },
    ];
    const passed = checks.every((check) => check.passed);
    const manifest = { runId: path.basename(outputDirectory), title: titleResult.title, titleProvider: titleResult.provider, hook: scriptResult.hook ?? fallbackHook(scriptResult.text), hookPath, introProvider, introDurationSeconds: introDuration, introPath, sourcePath, sourceStartSeconds: sourceStart, sourceDurationSeconds: sourceProbe.duration, sourceUsageFile: usageFile, sourceUrl: options.sourceUrl || null, rightsStatus: options.rightsStatus, manualReviewRequired: Boolean(redditSource) || options.rightsStatus === "UNKNOWN" || options.rightsStatus === "COMMENTARY_REVIEW", storySource: redditSource ? { provider: "reddit", postId: redditSource.id, subreddit: redditSource.subreddit, permalink: redditSource.permalink, theme: redditSource.theme, recordPath: path.join(outputDirectory, "reddit-source.json") } : null, perspective, voiceId: selectedVoiceId, voiceSpeed: voiceResult.speed ?? resolveVoiceSpeed(), scriptProvider: scriptResult.provider, scriptPath, captionProvider: captionResult.provider, captionModel: captionResult.model ?? null, captionWordCounts: { recognised: captionResult.recognisedWordCount ?? null, script: captionResult.scriptWordCount ?? null }, captionJobId: captionResult.jobId ?? null, outputPath: finalPath, compression: compressionResult, logPath, qc: { passed, score: Math.round((checks.filter((check) => check.passed).length / checks.length) * 100), checks }, upload: { status: "PENDING" }, createdAt: new Date().toISOString() };
    await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (!passed) throw new Error(`QC fallito: ${JSON.stringify(checks)}`);
    const completedUsageEntry = { ...usageEntry, status: "COMPLETED", output: finalPath };
    await appendUsageEntry(usageFile, completedUsageEntry);
    usageEntries.push(completedUsageEntry);
    let sourceDisposition = null;
    try {
      sourceDisposition = await moveExhaustedSourceToTrash(sourcePath, usageEntries, sourceProbe.duration);
      if (sourceDisposition) await logEvent("INFO", "Sorgente esaurita spostata nel Cestino", sourceDisposition);
    } catch (error) {
      await logEvent("WARN", "Sorgente esaurita ma non spostata nel Cestino", { error: errorMessage(error), sourcePath });
    }
    if (sourceDisposition) {
      manifest.sourceDisposition = sourceDisposition;
      await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    const uploadResult = options.upload ? await runStage("caricamento sulle piattaforme collegate", () => uploadToConnectedPlatforms({ filePath: finalPath, title: titleResult.title, script: scriptResult.text, hook: scriptResult.hook ?? fallbackHook(scriptResult.text), runId: path.basename(outputDirectory), scheduledAt: options.scheduledAt })) : { status: "SKIPPED", results: [], message: "Video pronto per revisione. Usa npm run upload dopo averlo approvato." };
    manifest.upload = uploadResult;
    let uploadedRunDisposition = null;
    let manifestWriteDirectory = outputDirectory;
    if (uploadSucceededOnYouTubeAndTikTok(uploadResult)) {
      try {
        uploadedRunDisposition = await moveUploadedRunToTrash(outputDirectory);
        if (uploadedRunDisposition) {
          logPath = path.join(uploadedRunDisposition.trashPath, "pipeline.log");
          manifestWriteDirectory = uploadedRunDisposition.trashPath;
          manifest.outputPath = path.join(uploadedRunDisposition.trashPath, path.basename(finalPath));
          await logEvent("INFO", "Cartella della run spostata nel Cestino dopo upload YouTube e TikTok", uploadedRunDisposition);
        }
      } catch (error) {
        await logEvent("WARN", "Upload YouTube e TikTok completato ma la cartella non è stata spostata nel Cestino", { error: errorMessage(error), outputDirectory });
      }
    }
    manifest.uploadedRunDisposition = uploadedRunDisposition;
    manifest.uploadedVideoDisposition = null;
    manifest.logPath = logPath;
    await writeFile(path.join(manifestWriteDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    if (redditSource) await appendFile(redditSource.usageFile, `${JSON.stringify({ status: "COMPLETED", postId: redditSource.id, subreddit: redditSource.subreddit, permalink: redditSource.permalink, theme: redditSource.theme, completedAt: new Date().toISOString(), run: path.basename(outputDirectory) })}\n`, "utf8");
    await logEvent("INFO", "GENERAZIONE FINITA", { title: titleResult.title, output: finalPath, duration: finalProbe.duration, perspective, sourceDisposition, uploadStatus: uploadResult.status });
    const uploadLines = uploadResult.results.length > 0 ? uploadResult.results.map((result) => `${result.platform}: ${result.status}${result.externalUrl ? ` (${result.externalUrl})` : result.error ? ` — ${result.error}` : ""}`).join("\n") : uploadResult.message;
    console.log(`\nGenerazione finita\nNome: ${titleResult.title}\nVideo generato: ${manifest.outputPath}\nPulizia: ${uploadedRunDisposition ? "cartella della run spostata nel Cestino dopo upload YouTube e TikTok" : "video e cartella conservati localmente"}\nUpload: ${uploadResult.status}\n${uploadLines}\nLog: ${logPath}\nRegistro minutaggi: ${usageFile}`);
    if (uploadResult.status === "PARTIAL_FAILURE") process.exitCode = 1;
  } catch (error) {
    const actionLabel = options.command === "upload" ? "UPLOAD" : "GENERAZIONE";
    await logEvent("ERROR", `${actionLabel} FALLITO nello stage ${currentStage}: ${errorMessage(error)}`);
    console.error(`\n${actionLabel === "UPLOAD" ? "Upload" : "Generazione"} fallito\nStage: ${currentStage}\nErrore: ${errorMessage(error)}\nLog dettagliato: ${logPath}${outputDirectory ? `\nCartella run: ${outputDirectory}` : ""}`);
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  await logEvent("ERROR", `ERRORE FATALE nello stage ${currentStage}: ${errorMessage(error)}`);
  console.error(`\nGenerazione fallita\nStage: ${currentStage}\nErrore: ${errorMessage(error)}\nLog dettagliato: ${logPath}`);
  process.exitCode = 1;
});
