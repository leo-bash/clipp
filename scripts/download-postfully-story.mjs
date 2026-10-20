import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import { chromium } from "playwright";

const [outputDirectoryArgument, hookArgument, titleArgument] = process.argv.slice(2);

if (!outputDirectoryArgument || !hookArgument) {
  throw new Error("Uso: node scripts/download-postfully-story.mjs OUTPUT_DIRECTORY HOOK [TITLE]");
}

const outputDirectory = path.resolve(outputDirectoryArgument);
const outputPath = path.join(outputDirectory, "postfully-story.png");
const url = process.env.POSTFULLY_URL ?? "https://postfully.app/tools/reddit-post-template/";
const username = process.env.POSTFULLY_USERNAME ?? "ScrollTales";
const upvotes = randomInt(120, 10_001);
const comments = randomInt(12, 701);
const darkMode = randomInt(0, 2) === 1;
const timeout = Number(process.env.POSTFULLY_TIMEOUT_MS ?? 45_000);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(timeout);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await page.waitForTimeout(1_500);

  const textField = page.getByLabel("Text", { exact: true });
  await textField.waitFor({ state: "visible" });
  const fillField = async (label, value) => {
    const field = page.getByLabel(label, { exact: true });
    await field.fill(value);
  };
  await fillField("Subreddit / Username", username);
  await fillField("Text", hookArgument.trim());
  await fillField("Upvotes", String(upvotes));
  await fillField("Comments", String(comments));
  await page.waitForTimeout(1_200);

  const darkModeField = page.locator('button[name="options.darkMode"]');
  const currentDarkMode = (await darkModeField.getAttribute("aria-checked")) === "true";
  if (darkMode !== currentDarkMode) await darkModeField.evaluate((element) => element.click());
  await page.waitForTimeout(1_200);
  if ((await page.getByText(hookArgument.trim(), { exact: true }).count()) === 0) throw new Error("Postfully non ha aggiornato il testo della scheda prima del download");
  if ((await page.getByText(username, { exact: true }).count()) === 0) throw new Error("Postfully non ha aggiornato il profilo della scheda prima del download");

  const downloadPromise = page.waitForEvent("download", { timeout });
  await page.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  const failure = await download.failure();
  if (failure) throw new Error(`Postfully non ha completato il download: ${failure}`);
  await download.saveAs(outputPath);

  const metadata = {
    provider: "postfully-browser",
    url,
    title: titleArgument?.trim() || null,
    username,
    upvotes,
    comments,
    darkMode,
    outputPath,
    downloadedAt: new Date().toISOString(),
  };
  await writeFile(path.join(outputDirectory, "postfully-story.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(metadata));
} finally {
  await browser.close();
}
