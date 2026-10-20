# Local video pipeline

The local runner is the first practical operating mode for the Reddit Stories pilot.
It keeps the source download step in 4K Video Downloader+ and automates the work after the file is saved locally:

`4K download → source file → Reddit selection → editorial rewrite → Postfully story card → ElevenLabs voice-over → Whisper locale word timings → centered pop captions → FFmpeg render → QC → revisione → upload sulle piattaforme collegate`

## First setup

1. Use 4K Video Downloader+ to save an authorized Orbital gameplay file as MP4 in the configured download folder.
2. Keep the gameplay source URL and the applicable license/permission record. The runner defaults the rights status to `UNKNOWN`, which means manual review is required.
3. Confirm that `.env` contains `SCRIPT_PROVIDER=gemini`, `GEMINI_API_KEY`, `TTS_PROVIDER=elevenlabs`, `TTS_API_KEY`, `TTS_VOICE_IDS_MALE` and `TTS_VOICE_ID_FEMALE`. The female profile is Laura; male stories randomly use Liam, Brian or Adam. Optionally add `GROQ_API_KEY` to activate the Groq fallback when Gemini returns a quota error; set `GROQ_MODEL` if you want a different Groq model.
4. Installa una volta il motore locale dei sottotitoli:

```sh
npm run setup:whisper
```

Il modello Whisper viene scaricato e conservato sul computer; le generazioni successive non chiamano un servizio esterno. Il modello predefinito è `base`; per una trascrizione più accurata puoi impostare `WHISPER_MODEL=small` in `.env`, con tempi e uso di memoria maggiori.

5. Installa una volta il browser locale usato per scaricare la scheda da Postfully:

```sh
npm run setup:postfully
```

Il browser viene usato solo per compilare il template e scaricare il PNG; non apre sessioni utente e non pubblica contenuti.

## Run

Use the newest video in `~/Movies/4K Video Downloader+`:

```sh
pnpm generate
```

Se il Terminale non riconosce `pnpm`, usa lo stesso comando tramite npm:

```sh
npm run generate
```

`generate` crea il video e lo lascia sul computer per la revisione; non esegue l'upload automaticamente. Dopo averlo guardato, carica l'ultimo video che ha superato il QC con:

```sh
npm run upload
```

Se vuoi caricare una run specifica:

```sh
npm run upload -- --run-dir "/Users/your-user/Documents/ChatGPT/clipp/.data/local-pipeline/NOME-DELLA-RUN"
```

L'upload cerca solo video con QC superato. TikTok usa la bozza con `TIKTOK_MODE=UPLOAD_DRAFT` per impostazione predefinita. Per la pubblicazione pubblica occorrono `TIKTOK_MODE=DIRECT_POST`, lo scope `video.publish` autorizzato nuovamente dall'account e `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE`; l'app TikTok deve inoltre essere approvata per il Direct Post. Se YouTube e TikTok rispondono entrambe correttamente, l'intera cartella della run viene spostata nel Cestino secondo `AUTO_DELETE_UPLOADED_VIDEO=true`; se una delle due fallisce, la cartella resta disponibile per il retry. Per mantenere l'upload automatico in un singolo comando usa `npm run generate -- --upload`.

Use an explicit source file:

```sh
pnpm pipeline:local -- --source "/Users/your-user/Downloads/orbital-gameplay.mp4" --source-url "https://example.com/source" --rights-status LICENSED
```

For a long story, start from a later point in the gameplay so a previous render is not reused:

```sh
pnpm pipeline:local -- --source "/Users/your-user/Downloads/orbital-gameplay.mp4" --source-start 60 --target-duration 120 --min-duration 90 --max-duration 240 --theme romance --rights-status UNKNOWN
```

By default the runner uses `--perspective auto`: Gemini analyzes the first-person story and selects the male or female narration profile. Use `--perspective male` or `--perspective female` only when you want to override that decision. The male profile keeps the original voice used for the first video; the female profile is configured independently for female-perspective stories.

### Manual story JSON

If you want to write the story yourself, copy [`manual-story.template.json`](../manual-story.template.json) to a new file, for example `manual-story.json`, and fill in the four fields:

```json
{
  "title": "The Secret Graduation Letter",
  "hook": "I found a letter meant for someone else",
  "script": "The complete English voice-over goes here, including the hook and the ending question.",
  "gender": "F"
}
```

Run it with:

```sh
npm run generate -- --script-file "/Users/leo/Desktop/manual-story.json"
```

When the file ends in `.json`, the pipeline skips automatic story generation, title generation and gender recognition. `gender: "F"` selects Laura; `gender: "M"` selects one of the configured male voices at random. The title should contain at least three words and becomes the video name; the hook is used for the Postfully card and the platform description. A JSON run does not spend Gemini credits for the script, hook, title or gender. Manual JSON stories are not required to reach the 90-second minimum; the duration still cannot exceed the configured Shorts maximum.

The Reddit mode fetches public candidates from the configured theme rotation, filters out deleted, low-signal, explicit or privacy-sensitive posts, and asks Gemini to create a substantially original English adaptation. It changes names, usernames, locations, dates, amounts and identifying details; it does not read the original text verbatim. The writing prompt uses plain everyday English for roughly ages 10–16: short sentences, common words, clear verbs and natural emotion without sounding childish. Every generated script must begin with a spoken 5–9 word hook designed to land in the first 1–2 seconds; it creates an urgent question without revealing the ending. Gemini returns two separate fields: the complete English voice-over in `script-en.txt` and a matching short hook in `hook-en.txt`. The hook is used as the only upload description; the full script stays inside the video and is never published in the platform description. The source permalink and collection metadata are saved in `reddit-source.json`, while `reddit-usage.jsonl` prevents the same post from being selected again.

The long-form mode asks Gemini for an adaptation targeting about 2 minutes, uses ElevenLabs for the narration, and lets local Whisper generate the word timings for the one-word-at-a-time captions. The visible words come from the exact voice-over script, while Whisper supplies only their timing, so transcription variations do not change what is shown on screen. Captions are rendered at 60 fps by default, with several intermediate scale frames for a smoother pop animation; change `SUBTITLE_FPS` in `.env` only if needed. Voice-over uses `VOICE_SPEED=1.5` by default and is sped up locally after ElevenLabs has generated it, so the speed setting does not spend extra ElevenLabs credits or alter the text. Automatic stories use the configured playback speed when estimating the required word count. By default, QC accepts videos from 90 seconds up to 3 minutes, so natural narration does not fail just because it is not exactly 120 seconds. If ElevenLabs exceeds the ceiling slightly, the already generated audio is fitted locally with a minimal speed adjustment; no second ElevenLabs request is made.

Before the narration, the runner downloads a 2.5-second Story card from Postfully using a compact version of the Gemini hook (maximum 8 words), invented `ScrollTales` profile details, and random upvote/comment counts. The full hook remains available for metadata; the shortened card text is saved in `postfully-hook.txt`. The card is scaled and centered over the gameplay. The voice-over starts at 0 seconds; the card visually covers the captions until it disappears, after which Whisper captions appear one word at a time with the pop effect. `POSTFULLY_PROVIDER=postfully-browser` is the default. If Postfully is unreachable or the download fails, generation stops in the Postfully stage and no local card is inserted. `POSTFULLY_PROVIDER=local` remains available only as an explicit manual choice; it is never used automatically. Set `REDDIT_INTRO_DURATION=0` to disable the card or change its duration in `.env`. The Postfully page is used only to generate the image; it is not used for publishing.

The command automatically selects the first unused segment of the source, writes the intervals to `source-usage.txt` beside the downloaded video, and saves the final file with a 3–4 word story-summary name inside `.data/local-pipeline/<run>/`. After QC, `generate` keeps the video local for manual review. `npm run upload` then sends the selected QC-passed video to every connected platform: YouTube uses public visibility, TikTok uses the configured draft mode, and Instagram is attempted only when its official credentials are configured; Instagram also requires a public media URL and reports that requirement explicitly when it is not available. When both YouTube and TikTok succeed, `AUTO_DELETE_UPLOADED_VIDEO=true` moves the complete run folder—including video, audio, script, captions, manifest and log—to the macOS Trash; if either upload fails, the folder is kept locally for retry. The result of every platform and the cleanup action are recorded in `manifest.json` and `pipeline.log`. Use `npm run generate -- --upload` only when you explicitly want generation and upload in one command. When all completed segments cover the full source duration, `AUTO_DELETE_EXHAUSTED_SOURCE=true` moves that exact source file to the macOS Trash after QC passes. The same folder contains the script, Whisper timings, `manifest.json` and `pipeline.log`. `.data/` is ignored by Git and must not be committed.

If the process fails, the CLI prints the exact stage, the error, the run folder and the log path. An `IN_PROGRESS` interval remains reserved in the usage ledger so a failed attempt is not accidentally reused.

## Risoluzione problemi

### Errore Gemini HTTP 429

La pipeline usa la Gemini API tramite chiave API. Il piano Google AI Pro dell'app Gemini non trasferisce automaticamente una quota API a questo progetto: se il log indica `generate_content_free_tier_requests`, bisogna attendere il reset mostrato nell'errore oppure collegare la fatturazione del progetto in Google AI Studio. La fatturazione API è separata dall'abbonamento Gemini Pro.

### File script non trovato

`--script-file` deve puntare a un file `.txt` reale. `percorso/della/storia.txt` è solo un esempio e non va copiato letteralmente. Per esempio:

```sh
npm run generate -- --script-file "/Users/leo/Documents/ChatGPT/clipp/storia.txt"
```

Per usare la generazione automatica della storia, ometti `--script-file` e lascia `SCRIPT_PROVIDER=gemini` nel file `.env`.

## Gemini mode (default)

The normal local mode creates original English stories with Gemini. It does not contact Reddit and does not need Reddit authentication. Put the Gemini key only in `.env`:

```dotenv
SCRIPT_PROVIDER=gemini
GEMINI_API_KEY=your-runtime-secret
GEMINI_MODEL=gemini-3.8-flash
```

The default runner creates original stories from the selected emotional theme. `SCRIPT_PROVIDER=reddit` remains an optional mode for a later authorized Reddit integration; it requires OAuth and remains subject to the source and commercial-use review rules. `SCRIPT_PROVIDER=builtin` uses the deterministic local fixture.

### AI fallback

Gemini remains the primary text provider. When Gemini returns a quota error (`HTTP 429`), the runner automatically retries the story, title or perspective request through Groq if `GROQ_API_KEY` is present. The fallback uses the OpenAI-compatible Groq API; it does not replace ElevenLabs, Whisper or the video renderer. Both providers have independent limits, so a fallback improves continuity but is not an unlimited quota.

Optional Reddit settings:

```dotenv
REDDIT_FETCH_LIMIT=25
REDDIT_MIN_SCORE=10
REDDIT_MAX_SOURCE_CHARACTERS=14000
REDDIT_ALLOW_NSFW=false
REDDIT_SUBREDDITS=
REDDIT_USAGE_FILE=./.data/local-pipeline/reddit-usage.jsonl
# Use one of these authenticated options if Reddit returns 401/403:
REDDIT_ACCESS_TOKEN=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
```

The default rotation covers high-school memories, romance, embarrassing situations, bullying, family stories, scary encounters, money problems, Tinder dates, failed pranks, divorce, betrayal and harmless revenge. The editorial direction favors empathy, nostalgia, suspense and recognizable human moments over rage-bait. Set `--theme highschool`, `--theme romance`, `--theme embarrassing`, `--theme bullies`, `--theme family`, `--theme scary`, `--theme money`, `--theme tinder`, `--theme prank`, `--theme divorce`, `--theme betrayal` or `--theme revenge` to force one category for a run.

## Safety

The runner does not bypass copyright checks and does not treat a downloaded file as licensed automatically. YouTube uploads remain private and TikTok uploads remain drafts by default; `UNKNOWN` and `COMMENTARY_REVIEW` are marked for manual review in the manifest. The normal workflow requires manual review before `npm run upload`. A failed upload does not delete the generated video: the CLI reports the affected platform, keeps the local output and records the failure in the run log.
