# MASTER SPECIFICATION — AUTOMATED SHORT-FORM CONTENT FACTORY

## 0. RUOLO

Agisci come lead software architect, senior full-stack developer, DevOps engineer e video-pipeline engineer.

Devi progettare e implementare un sistema production-ready per generare, elaborare, revisionare, programmare, pubblicare e analizzare contenuti verticali short-form destinati a:

- YouTube Shorts
- TikTok
- Instagram Reels

Il sistema deve essere progettato inizialmente per:

- 3 brand/canali distinti
- 6 contenuti unici al giorno per canale
- 18 video unici/giorno
- circa 540 video unici/mese
- fino a 1.620 pubblicazioni mensili considerando 3 piattaforme per video

Il sistema deve essere scalabile in futuro fino ad almeno:

- 20 canali
- 100 video unici/giorno

senza riprogettare l'architettura.

Budget operativo iniziale:

MAX 50 EUR / MESE.

Il rispetto del budget è un requisito funzionale del software.

NON implementare scorciatoie che violino API, Terms of Service, copyright, autenticazione delle piattaforme o sistemi anti-abuso.

NON usare browser automation per fingere upload manuali quando esiste un'API ufficiale.

NON progettare sistemi per aggirare watermark, Content ID, copyright detection, limiti API, rate limits o moderation.

---

# 1. OBIETTIVO DEL PRODOTTO

Costruire una piattaforma centralizzata denominata provvisoriamente:

ShortFactory

La piattaforma deve gestire l'intero ciclo:

SOURCE DISCOVERY
↓
CANDIDATE INGESTION
↓
TRANSCRIPTION
↓
ANALYSIS
↓
SCORING
↓
RIGHTS CHECK
↓
SCRIPT / EDIT PLAN
↓
VIDEO PROCESSING
↓
CAPTIONS
↓
QUALITY CONTROL
↓
MANUAL REVIEW
↓
SCHEDULING
↓
PUBLISHING
↓
ANALYTICS
↓
LEARNING / SCORING FEEDBACK

L'obiettivo non è costruire un semplice repost bot.

Il sistema deve poter gestire tre categorie iniziali di contenuto:

### Channel A — Tutorials

Contenuti originali riguardanti:

- tecnologia
- software
- Windows
- macOS
- AI tools
- gaming tips
- app
- siti web utili
- piccoli tutorial

Questi contenuti devono essere il più possibile originali.

Pipeline possibile:

topic
→ ricerca informazioni
→ script
→ visual assets / screen recordings autorizzati
→ voice-over
→ captions
→ rendering
→ pubblicazione

---

### Channel B — Streamer Commentary

Contenuti riguardanti streamer/creator popolari.

NON creare un semplice sistema di reupload.

Le clip di terzi devono essere trattate esclusivamente quando è presente una base autorizzativa/configurazione appropriata.

Il sistema deve supportare:

OWNED
LICENSED
CREATIVE_COMMONS
PUBLIC_DOMAIN
COMMENTARY_REVIEW
UNKNOWN

Ogni source asset deve avere rights_status.

Se:

rights_status = UNKNOWN

allora:

auto_publish = FALSE

obbligatoriamente.

La pipeline commentary deve poter creare contenuti realmente editoriali:

hook originale
→ contesto
→ estratto strettamente necessario
→ voice-over/commentary
→ editing
→ conclusione

Non assumere che crop + subtitles renda automaticamente un contenuto trasformativo.

---

### Channel C — Creator / Internet Stories

Contenuti come:

- storie su creator
- curiosità
- eventi internet
- challenge
- fatti interessanti
- spiegazioni di momenti virali

Preferire struttura editoriale originale:

HOOK
CONTEXT
EVENT
PAYOFF

Utilizzare clip di terzi solo secondo rights_status.

---

# 2. PRINCIPI ARCHITETTURALI

Il sistema deve essere:

- modular
- configuration-driven
- observable
- resumable
- idempotent
- testable
- cheap to operate
- multi-channel
- multi-platform

Ogni componente deve poter essere sostituito.

Esempio:

TTS provider A
→ sostituibile con TTS provider B

LLM provider A
→ sostituibile

Storage R2
→ sostituibile con S3

Publisher YouTube
→ indipendente da TikTok

Non accoppiare direttamente business logic e provider esterni.

Utilizzare interfaces/adapters.

---

# 3. STACK TECNOLOGICO

Preferire TypeScript end-to-end.

## Monorepo

Utilizzare:

pnpm workspaces + Turborepo

Struttura:

/apps
    /dashboard
    /api

/workers
    /discovery-worker
    /transcription-worker
    /analysis-worker
    /script-worker
    /render-worker
    /publisher-worker
    /analytics-worker
    /cleanup-worker

/packages
    /database
    /config
    /logger
    /queue
    /storage
    /ai
    /transcription
    /tts
    /video
    /platforms
    /rights
    /analytics
    /cost-control
    /shared
    /testing

/infrastructure
    /docker
    /nginx
    /scripts

/docs

---

# 4. FRONTEND

Utilizzare:

Next.js
TypeScript
Tailwind
shadcn/ui

Dashboard responsive.

Non perdere tempo inizialmente su grafica complessa.

Prima funzionalità, poi estetica.

Dashboard sections:

Overview
Channels
Candidates
Videos
Review Queue
Publishing
Analytics
Costs
Sources
Accounts
Settings
System Health

---

# 5. BACKEND

Utilizzare:

Node.js
TypeScript

Preferenza:

Fastify

oppure NestJS se porta benefici concreti.

Database:

PostgreSQL.

ORM:

Prisma oppure Drizzle.

Scegline uno e mantienilo per tutto il progetto.

Queue:

Redis + BullMQ.

Il backend NON deve effettuare direttamente operazioni pesanti FFmpeg.

Tutte le operazioni pesanti devono essere job asincroni.

---

# 6. VIDEO ENGINE

Utilizzare FFmpeg installato sul worker.

Non utilizzare API di AI video generation per l'MVP.

Motivo:

budget massimo 50 €/mese.

Il video engine deve supportare:

- probe video
- trim
- crop
- scale
- vertical conversion
- overlays
- subtitles
- background blur
- audio normalization
- volume mixing
- intro/outro
- simple zoom
- cuts
- concat
- thumbnail extraction
- compression
- metadata extraction

Formato finale standard:

1080x1920

aspect ratio:

9:16

codec:

H.264

audio:

AAC

container:

MP4

Configurare CRF e bitrate ragionevoli per ottenere file relativamente piccoli senza degradazione eccessiva.

---

# 7. STORAGE

Implementare StorageProvider interface.

Prima implementazione:

Cloudflare R2 o S3-compatible storage.

Cloudflare R2 ha attualmente storage Standard indicato a $0.015/GB-month e assenza di egress charge standard, quindi è adatto alla strategia low-cost.

Configurare lifecycle applicativo:

raw candidate media:
7 giorni di default

temporary renders:
3 giorni

failed renders:
7 giorni

published final:
30 giorni di default

thumbnail:
90 giorni

Configurazioni modificabili per channel.

Implementare cleanup-worker giornaliero.

Mai cancellare asset se:

legal_hold = TRUE

oppure:

preserve = TRUE

---

# 8. DATABASE

Creare almeno le seguenti entità.

## users

id
email
name
role
created_at
updated_at

---

## channels

id
name
slug
type
language
timezone
status
videos_per_day
min_duration
max_duration
auto_publish
manual_review_required
monthly_budget
created_at
updated_at

type:

TUTORIAL
STREAMER_COMMENTARY
CREATOR_STORY
CUSTOM

---

## platform_accounts

id
channel_id
platform
external_account_id
display_name
status
credentials_reference
token_expires_at
created_at
updated_at

platform:

YOUTUBE
TIKTOK
INSTAGRAM

NON salvare token API plain text nel database.

Utilizzare encryption/secrets.

---

## sources

id
name
type
url
platform
rights_status
creator
notes
enabled
created_at
updated_at

rights_status:

OWNED
LICENSED
CREATIVE_COMMONS
PUBLIC_DOMAIN
COMMENTARY_REVIEW
UNKNOWN
BLOCKED

---

## source_assets

id
source_id
external_id
source_url
storage_key
title
description
duration_seconds
published_at
discovered_at
views
likes
comments
shares
language
rights_status
metadata_json
content_hash
created_at

Aggiungere unique constraints per prevenire duplicati.

---

## candidates

id
channel_id
source_asset_id
status
topic
score_total
score_recency
score_engagement
score_velocity
score_relevance
score_novelty
score_rights
analysis_json
rejection_reason
created_at
updated_at

Status:

DISCOVERED
ANALYZING
QUALIFIED
REJECTED
SELECTED
PROCESSING
COMPLETED

---

## transcripts

id
source_asset_id
provider
language
text
segments_json
confidence
cost_eur
created_at

---

## content_plans

id
candidate_id
channel_id
hook
script
title
description
hashtags_json
edit_plan_json
voiceover_required
target_duration
created_at
updated_at

---

## videos

id
channel_id
candidate_id
content_plan_id
status
storage_key
thumbnail_key
duration
width
height
file_size
content_hash
render_version
quality_score
rights_status
created_at
updated_at

Status:

PLANNED
RENDERING
RENDERED
QC_FAILED
READY_FOR_REVIEW
APPROVED
REJECTED
SCHEDULED
PUBLISHING
PUBLISHED
PARTIAL_FAILURE
FAILED

---

## publications

id
video_id
platform_account_id
platform
status
scheduled_at
published_at
external_post_id
external_url
attempt_count
last_error
metadata_json
created_at
updated_at

---

## analytics_snapshots

id
publication_id
captured_at
views
likes
comments
shares
watch_time
avg_watch_duration
completion_rate
followers_gained
metadata_json

---

## costs

id
provider
service
operation
channel_id nullable
candidate_id nullable
video_id nullable
quantity
unit
estimated_cost_eur
actual_cost_eur
metadata_json
created_at

---

## budgets

id
scope
scope_id
period
budget_eur
spent_eur
reserved_eur
warning_threshold
hard_stop
created_at
updated_at

---

## jobs_audit

id
queue
job_id
type
entity_id
status
attempt
started_at
completed_at
error
metadata_json

---

# 9. CHANNEL CONFIGURATION

Ogni channel deve essere configurabile senza cambiare codice.

Esempio YAML:

channel:
  slug: tech_tutorials
  type: TUTORIAL
  language: en
  timezone: Europe/Rome

production:
  videos_per_day: 6
  duration:
    min: 18
    target: 28
    max: 45

publishing:
  youtube: true
  tiktok: true
  instagram: true

review:
  required: true

voice:
  enabled: true
  provider: configurable

captions:
  enabled: true
  style: dynamic

budget:
  monthly_eur: 20

---

Secondo esempio:

channel:
  slug: streamer_commentary
  type: STREAMER_COMMENTARY

production:
  videos_per_day: 6

rights:
  allowed:
    - OWNED
    - LICENSED
    - COMMENTARY_REVIEW

  block_unknown: true

review:
  required: true

voice:
  enabled: optional

---

# 10. PIPELINE JOB-BASED

Utilizzare BullMQ.

Queues:

discovery
ingestion
transcription
analysis
planning
tts
render
qc
review
publish
analytics
cleanup

Ogni job deve:

- essere idempotente
- avere retry
- usare exponential backoff
- scrivere log strutturato
- registrare costo
- avere correlation_id

Mai produrre due volte lo stesso video per retry accidentale.

---

# 11. DISCOVERY ENGINE

Il sistema deve trovare candidati.

NON implementare scraping aggressivo o bypass di API.

Creare interfaces:

DiscoveryProvider

metodi:

discover()
getMetadata()
getStats()

Supportare più provider successivamente.

L'MVP può iniziare con fonti manualmente definite.

La dashboard deve consentire:

Add Source
Disable Source
Set Rights Status
Set Channel
Set Keywords
Set Priority

Il discovery engine deve salvare solo metadata inizialmente.

Scaricare media solo se il candidato supera il primo filtro e se è consentito.

Questo riduce storage/banda.

---

# 12. DUPLICATE DETECTION

Implementare:

URL duplicate detection
external ID detection
SHA-256 media hash

Successivamente aggiungere:

perceptual similarity

Non pubblicare accidentalmente lo stesso video più volte sullo stesso account.

Creare uniqueness protection a livello database.

---

# 13. TRANSCRIPTION

Creare:

TranscriptionProvider interface.

Output:

language
full_text
segments:
    start
    end
    text
confidence

Memorizzare timestamps.

I timestamps serviranno per:

- clip extraction
- subtitle generation
- best moment detection
- editing

Prima di effettuare transcription a pagamento:

verificare cache.

Chiave cache:

media_hash + language + model

---

# 14. AI ANALYSIS

L'LLM non deve ricevere video binary.

Riceve:

metadata
transcript
channel config
performance context

Deve produrre JSON strutturato validato con Zod.

Schema orientativo:

{
  "summary": "",
  "topics": [],
  "hook_candidates": [],
  "best_segments": [
    {
      "start": 0,
      "end": 0,
      "reason": ""
    }
  ],
  "virality_score": 0,
  "clarity_score": 0,
  "novelty_score": 0,
  "recommended_format": "",
  "risk_flags": []
}

NON permettere output non validato.

Retry massimo limitato.

---

# 15. CONTENT SCORING

Creare score 0-100.

Esempio MVP:

total =
0.20 * recency
+ 0.20 * engagement
+ 0.15 * velocity
+ 0.20 * relevance
+ 0.10 * novelty
+ 0.15 * historical_format_performance

Rights deve essere un hard gate, non solo un punteggio.

UNKNOWN:

manual review obbligatoria.

BLOCKED:

mai processare.

I pesi devono essere configurabili.

---

# 16. CONTENT PLANNER

Dato un candidate qualificato, produrre:

hook
script
edit plan
target duration
title
caption
hashtags

Output JSON validato.

Per tutorial:

script completamente originale.

Per commentary:

distinguere chiaramente:

narration
quoted/source segment
commentary
conclusion

L'edit plan deve essere machine-readable.

Esempio:

{
  "duration": 31,
  "segments": [
    {
      "type": "voiceover",
      "start": 0,
      "end": 4,
      "text": "..."
    },
    {
      "type": "source_clip",
      "source_start": 143,
      "source_end": 151
    }
  ],
  "captions": true
}

---

# 17. TTS

Creare TTSProvider.

Non rendere ElevenLabs obbligatorio.

Supportare:

provider premium
provider cheap/free
disabled

Calcolare costo PRIMA di generare voce.

Se budget insufficiente:

non eseguire automaticamente.

Aggiungere:

estimatedCost(text)

prima di:

generate(text)

Cache audio basata su:

text hash
voice
model

---

# 18. SUBTITLES

Generare ASS preferibilmente rispetto a SRT per styling.

Funzioni:

word wrapping
safe zones
font sizing
positioning
highlight support
max words per line
timing synchronization

Non rendere i captions illeggibili o eccessivamente aggressivi.

Preset:

clean
dynamic
minimal

---

# 19. VIDEO RENDERER

Implementare VideoRenderer abstraction.

FFmpeg pipeline dinamica.

Non costruire shell commands concatenando input non sanitizzato.

Usare spawn/execFile.

Validare paths.

Render steps:

probe
→ prepare assets
→ create composition
→ render temp
→ validate
→ normalize
→ final render
→ thumbnail
→ upload storage

Registrare:

render duration
CPU time se disponibile
file size
failures

---

# 20. QUALITY CONTROL

Prima di mostrare un video per review, eseguire QC automatico.

Controlli:

resolution == 1080x1920 o configurazione ammessa
duration within channel range
audio present se richiesto
no black video
no zero-byte file
valid H264
valid AAC
captions inside safe area
file readable by ffprobe
file below platform limits
rights_status valid

Quality score 0-100.

Se fallisce critical check:

QC_FAILED

NON pubblicare.

---

# 21. REVIEW QUEUE

La dashboard deve avere una pagina estremamente pratica.

Card video:

preview
channel
source
rights status
score
duration
estimated publish platforms
estimated cost
hook
caption

Buttons:

APPROVE
REJECT
RENDER AGAIN
EDIT METADATA
EDIT SCRIPT
BLOCK SOURCE

Keyboard shortcuts auspicabili.

Per il primo mese:

manual_review_required = TRUE

per tutti e 3 i channels.

Solo successivamente consentire auto-publish selettivo.

---

# 22. SCHEDULING

Ogni channel:

6 slot/giorno.

Non hardcodare orari.

Configurare publishing_slots.

Esempio:

09:00
12:00
15:00
18:00
21:00
23:00

Il scheduler deve lavorare usando timezone del channel.

Non creare contemporaneamente 18 chiamate API.

Utilizzare distributed locking.

---

# 23. YOUTUBE ADAPTER

Creare:

YouTubePublisher implements PlatformPublisher

Supportare OAuth2.

Funzioni:

connectAccount()
refreshToken()
uploadVideo()
getPublishStatus()
getAnalytics()
validateCredentials()

Utilizzare API ufficiali YouTube.

Upload con:

videos.insert

Supportare resumable upload.

Gestire:

title
description
privacy
scheduled publishing se appropriato

IMPORTANT:

Progettare considerando che un progetto API non ancora verificato può avere upload API impostati private finché non supera l'audit previsto da YouTube.

NON tentare workaround.

Visualizzare warning nella dashboard:

YOUTUBE_API_AUDIT_REQUIRED

Aggiungere quota tracking.

Se quota insufficiente:

defer job

non retry-loop infinito.

---

# 24. TIKTOK ADAPTER

Creare:

TikTokPublisher implements PlatformPublisher

Utilizzare Content Posting API ufficiale.

Supportare due modalità:

DIRECT_POST

UPLOAD_DRAFT

Implementare OAuth e scopes corretti.

Gestire:

creator info
post initialization
file transfer
publish_id
status polling

TikTok attualmente prevede flussi ufficiali differenti tra Direct Post e upload come draft.

Non simulare click tramite browser.

L'adapter deve essere progettato affinché la UI possa chiedere eventuali conferme/metadata richiesti dal flusso TikTok.

Se Direct Post non è ancora approvato per l'app:

fallback configurabile:

UPLOAD_DRAFT

non utilizzare workaround.

---

# 25. INSTAGRAM ADAPTER

Creare:

InstagramPublisher implements PlatformPublisher

Implementare solo tramite API ufficiali Meta disponibili per l'account/app configurati.

Workflow concettuale:

create media/container
→ wait processing
→ publish
→ retrieve media ID

NON automatizzare login Instagram via browser.

Se API prerequisites non sono soddisfatti:

account status = NEEDS_CONFIGURATION

La mancanza del publisher Instagram NON deve bloccare YouTube/TikTok.

Ogni publication è indipendente.

---

# 26. PLATFORM INTERFACE

Definire:

interface PlatformPublisher {
    validateAccount()
    estimateCost()
    publish()
    getStatus()
    getAnalytics()
}

Ogni publication deve poter fallire indipendentemente.

Esempio:

YouTube SUCCESS
TikTok SUCCESS
Instagram FAILED

Video status:

PARTIAL_FAILURE

Retry solo Instagram.

---

# 27. ANALYTICS

Raccogliere snapshot periodici.

Minimo:

views
likes
comments
shares
followers gained

Se disponibile:

watch time
average watch duration
completion rate

Snapshot:

1h
6h
24h
72h
7d

Non effettuare richieste inutili se limiti API sono stretti.

---

# 28. PERFORMANCE SCORE

Per video:

views_24h
views_7d
engagement_rate
completion_rate
follower_conversion

Creare normalized performance score.

Inizialmente semplice.

Non costruire machine learning complesso.

Dopo abbastanza dati, il sistema potrà usare historical performance per migliorare candidate scoring.

---

# 29. COST CONTROL — REQUISITO CRITICO

Budget totale:

50 EUR / month.

CostControlService deve essere chiamato PRIMA di ogni servizio potenzialmente a pagamento.

API:

canSpend()
reserve()
commit()
release()
getRemainingBudget()

Esempio:

const reservation = await costControl.reserve({
    amount: estimatedCost,
    service: "tts",
    channelId
})

if (!reservation.approved) {
    throw new BudgetExceededError()
}

Il sistema deve avere:

warning 50%
warning 75%
warning 90%
hard stop 100%

Budget iniziale indicativo:

Infrastructure: 20 EUR
LLM: 8 EUR
Transcription: 5 EUR
TTS: 12 EUR
Storage: 3 EUR
Reserve: 2 EUR

I valori devono essere configurabili.

Dashboard:

Monthly Budget
Spent
Reserved
Remaining
Forecast
Cost per Video
Cost per Published Video
Cost per Channel
Cost per 1000 Views

---

# 30. OPTIMIZZAZIONE COSTI

Applicare aggressivamente:

caching
deduplication
local FFmpeg
metadata-first discovery
cheap model first
premium model only when necessary
avoid AI video generation
short transcript windows when possible
delete temporary assets
batch where supported

Implementare model routing.

Esempio:

candidate analysis:
cheap model

selected content plan:
better model

metadata:
no expensive LLM

---

# 31. COST FORECAST

Ogni giorno calcolare:

month_spend_so_far
average_daily_spend
forecast_month_end

Se forecast > 50 EUR:

BUDGET_FORECAST_WARNING

Se forecast > 55 EUR:

automaticamente ridurre:

premium TTS
non-essential re-renders
non-essential AI analysis

NON ridurre silently.

Registrare ogni decisione.

---

# 32. SECURITY

Mai committare:

API keys
refresh tokens
passwords
cookies
OAuth secrets

Creare:

.env.example

Usare secrets runtime.

Encrypt sensitive credentials.

Applicare:

RBAC base
CSRF dove appropriato
rate limiting
input validation
secure headers
audit logging

Non loggare tokens.

Redaction logger obbligatoria.

---

# 33. OBSERVABILITY

Utilizzare structured logging.

Preferenza:

Pino.

Ogni request/job:

request_id
correlation_id
job_id
channel_id
candidate_id
video_id

Health endpoint:

/health

Readiness:

/ready

Dashboard System Health:

API
Postgres
Redis
Storage
Workers
YouTube
TikTok
Instagram
LLM
TTS

---

# 34. ERROR HANDLING

Definire error taxonomy:

ValidationError
ProviderError
RateLimitError
AuthenticationError
BudgetExceededError
RightsBlockedError
RenderError
UploadError
QuotaExceededError
TransientError
PermanentError

Retry:

solo TransientError / RateLimit appropriato.

Permanent errors:

dead-letter queue.

Dashboard:

Retry
Dismiss
Inspect

---

# 35. API ENDPOINTS MVP

Implementare REST API.

Esempi:

GET /channels
POST /channels
GET /channels/:id
PATCH /channels/:id

GET /sources
POST /sources
PATCH /sources/:id

GET /candidates
POST /candidates/:id/select
POST /candidates/:id/reject

GET /videos
GET /videos/:id
POST /videos/:id/approve
POST /videos/:id/reject
POST /videos/:id/rerender

GET /publications
POST /publications/:id/retry

GET /analytics/overview
GET /analytics/channels/:id

GET /costs
GET /costs/forecast

GET /health

Tutti con pagination dove necessario.

---

# 36. DASHBOARD HOME

Mostrare:

Today

Videos planned: 18
Rendered
Waiting Review
Approved
Published
Failed

Platforms:

YouTube
TikTok
Instagram

Monthly:

Videos produced
Publications
Views
Followers
Spend
Cost/video

Most successful channel
Most successful format

---

# 37. REVIEW WORKFLOW

Stati:

Candidate Selected
↓
Content Plan
↓
Render
↓
QC
↓
Review
↓
Approved
↓
Scheduled
↓
Publish

Qualsiasi video può tornare a:

Content Plan

oppure:

Render

senza creare record duplicati incontrollati.

Usare render_version.

---

# 38. RIGHTS SAFETY GATE

Implementare funzione centrale:

canProcessForPublication(asset, channel)

Output:

ALLOW
MANUAL_REVIEW
BLOCK

Regole iniziali:

OWNED → ALLOW

LICENSED → ALLOW

CREATIVE_COMMONS → manual/config dependent

PUBLIC_DOMAIN → ALLOW

COMMENTARY_REVIEW → MANUAL_REVIEW

UNKNOWN → MANUAL_REVIEW

BLOCKED → BLOCK

Il sistema non deve avere una funzione tipo:

"bypass copyright"

o

"avoid Content ID".

Non implementarla.

---

# 39. CONTENT SOURCE ATTRIBUTION

Consentire di salvare:

source_creator
source_url
source_title
license
license_url
attribution_text

Mantenere tracciabilità completa del materiale utilizzato.

---

# 40. SOURCE CLIP LIMITING

Per commentary, edit plan deve registrare:

ogni segmento utilizzato
start time
end time
duration

Questo serve per:

audit
review
editing
rights management

Non creare una regola arbitraria del tipo:

"sotto X secondi è sempre fair use".

Non esiste una soglia tecnica universale che garantisca legalità.

---

# 41. AUTOMATIC DAILY ORCHESTRATOR

Ogni notte/mattina:

calculate required videos

Per 3 channels × 6:

18 approved/scheduled target.

Il sistema deve mantenere buffer.

Target buffer:

36 ready videos

cioè circa 2 giorni.

Se ready buffer < 18:

priority HIGH.

Se > 54:

ridurre processing.

---

# 42. CONTENT SELECTION

Non produrre necessariamente i primi 18 candidati.

Esempio:

discover 100
→ lightweight scoring
→ analyze best 40
→ select best 24
→ generate 18
→ keep reserve

Ridurre uso LLM.

---

# 43. RATE LIMITING

Implementare centralized ProviderRateLimiter.

Per provider/account.

NON distribuire rate limiting solo nei singoli worker.

Persistenza o coordination Redis.

Gestire Retry-After.

---

# 44. CONCURRENCY

Iniziale su piccolo VPS:

render concurrency = 1 o 2

AI concurrency = 3

publish concurrency per platform = 1

analytics concurrency = 2

Configurabile.

Mai saturare CPU provocando crash database/backend.

---

# 45. DEPLOYMENT

MVP:

1 VPS

Docker Compose.

Containers:

api
dashboard
postgres
redis
worker-light
worker-render
nginx

Possibile R2 esterno.

Separare render worker logicamente anche se inizialmente vive sulla stessa macchina.

Così in futuro possiamo spostarlo su server separato.

---

# 46. DOCKER

Creare:

docker-compose.yml

Volumi persistenti:

postgres
redis se necessario
render cache

Configurare healthchecks.

Render image deve contenere FFmpeg.

Utilizzare versioni pin.

---

# 47. CI

GitHub Actions:

install
lint
typecheck
unit test
integration tests
build

PR deve fallire se:

lint fail
type errors
tests fail

Non deploy automatico in produzione inizialmente.

---

# 48. TESTING

Usare:

Vitest

o Jest.

Test obbligatori:

cost reservation
budget hard stop
rights gate
candidate scoring
duplicate detection
job retry
publication partial failure
platform adapter mocks
render plan validation
config parsing

Integration:

Postgres
Redis
queue

Video integration:

piccolo fixture MP4 creato/testato localmente.

---

# 49. PLATFORM MOCKS

Prima di collegare account veri:

YouTubeMockPublisher
TikTokMockPublisher
InstagramMockPublisher

Dev mode:

publish restituisce fake URL.

Questo permette di testare l'intera pipeline senza pubblicare.

---

# 50. SEED DATA

Creare seed:

3 channels

tech-tutorials
streamer-commentary
creator-stories

con:

6 videos/day ciascuno.

Aggiungere 5 fake sources.

Aggiungere candidate demo.

---

# 51. ENVIRONMENT VARIABLES

Creare .env.example.

Categorie:

DATABASE_URL
REDIS_URL

R2_ENDPOINT
R2_BUCKET
R2_ACCESS_KEY
R2_SECRET_KEY

LLM_PROVIDER
LLM_API_KEY

TTS_PROVIDER
TTS_API_KEY

TRANSCRIPTION_PROVIDER
TRANSCRIPTION_API_KEY

YOUTUBE_CLIENT_ID
YOUTUBE_CLIENT_SECRET

TIKTOK_CLIENT_KEY
TIKTOK_CLIENT_SECRET

META_APP_ID
META_APP_SECRET

APP_ENCRYPTION_KEY

MONTHLY_BUDGET_EUR=50

Mai compilare secrets reali.

---

# 52. DOCUMENTATION

/docs deve contenere:

ARCHITECTURE.md
DATABASE.md
PIPELINE.md
DEPLOYMENT.md
API_SETUP.md
YOUTUBE_SETUP.md
TIKTOK_SETUP.md
INSTAGRAM_SETUP.md
COSTS.md
RIGHTS_AND_SOURCES.md
RUNBOOK.md
TROUBLESHOOTING.md

---

# 53. LOCAL DEVELOPMENT

Deve essere possibile eseguire:

pnpm install

docker compose up -d postgres redis

pnpm dev

e avere:

dashboard
API
workers

Aggiungere Makefile o task scripts semplici.

---

# 54. PHASED IMPLEMENTATION

NON tentare di costruire tutto contemporaneamente.

Procedere esattamente in queste fasi.

## PHASE 1 — FOUNDATION

Monorepo
TypeScript
database
Redis
queues
shared packages
config
logger
Docker

Acceptance:

all services start
health green
tests green

---

## PHASE 2 — CORE DOMAIN

Database schema
channels
sources
candidates
videos
publications
costs
budgets

CRUD API.

Seed data.

Acceptance:

dashboard vede i tre channels.

---

## PHASE 3 — COST ENGINE

Budget service
reservations
cost logging
forecasting

Acceptance:

test artificialmente budget = €1.

Al superamento:

job deve fermarsi.

---

## PHASE 4 — RIGHTS ENGINE

rights_status
gate
dashboard warning

Acceptance:

BLOCKED non può arrivare a render.

UNKNOWN non può auto-publish.

---

## PHASE 5 — MEDIA ENGINE

storage
FFprobe
FFmpeg
crop
trim
captions
render
QC

Acceptance:

input fixture landscape
→ output valid 1080x1920 MP4.

---

## PHASE 6 — AI PIPELINE

transcription adapter
analysis adapter
content planner
Zod validation
cost measurement

Acceptance:

candidate
→ transcript
→ analysis
→ plan.

---

## PHASE 7 — REVIEW DASHBOARD

preview
approve
reject
rerender
metadata edit

Acceptance:

un operatore può gestire tutta la review senza database access.

---

## PHASE 8 — MOCK PUBLISHING

platform interfaces
3 mocks
scheduler

Acceptance:

approved video
→ scheduled
→ 3 mock publications
→ success.

---

## PHASE 9 — YOUTUBE

OAuth
upload
status
error handling

Test prima:

private/unlisted.

Non rendere pubblico automaticamente durante test.

---

## PHASE 10 — TIKTOK

OAuth
Content Posting API
Direct Post / Draft modes
status

Seguire requisiti ufficiali correnti.

---

## PHASE 11 — INSTAGRAM

Implementare publisher ufficiale se account/app soddisfano requisiti.

Fallback:

disable platform gracefully.

---

## PHASE 12 — ANALYTICS

snapshots
dashboard
performance score

---

## PHASE 13 — DAILY ORCHESTRATOR

18 video/day target.

buffer management.

---

## PHASE 14 — PRODUCTION HARDENING

security
backups
monitoring
rate limiting
DLQ
runbook

---

# 55. CODING RULES

TypeScript strict true.

NO any se evitabile.

Preferire:

unknown + validation.

Zod per:

external API
LLM output
config
REST input

No giant services.

File idealmente sotto ~400 righe quando possibile.

No business logic nei controller.

No provider logic nei React components.

No direct DB access dal frontend.

---

# 56. DATABASE MIGRATIONS

Mai usare schema push incontrollato in production.

Utilizzare migration versionate.

Ogni schema change:

migration.

---

# 57. IDEMPOTENCY

Fondamentale.

Chiavi:

candidate analysis:
candidate_id + analysis_version

render:
content_plan_id + render_version

publication:
video_id + platform_account_id

Non pubblicare due volte perché un job è stato ritentato.

---

# 58. BACKUPS

Postgres:

daily backup.

Retain:

7 daily
4 weekly

In MVP può essere script + remote/object storage.

Verificare restore procedure.

---

# 59. MONTH 1 TARGET

Sistema configurato per:

3 channels
6 unique videos/day/channel

= 18 unique/day

≈ 540 unique/month

Cross posting target massimo:

≈ 1620 publications/month.

NON garantire che tutte le piattaforme consentano automaticamente ogni pubblicazione; rispettare autorizzazioni, limiti e requisiti delle API.

---

# 60. MONTH 1 MODE

Per il primo mese:

manual_review_required = true

auto_publish = false

per qualsiasi contenuto con source esterna.

Tutorial originali possono essere impostati successivamente per auto publish.

---

# 61. KEY METRICS

Dashboard deve mostrare:

VIDEOS

created/day
approved/day
published/day
failed/day

PERFORMANCE

views
views/video
followers
followers/video
engagement
completion rate

COST

EUR/day
EUR/month
EUR/video
EUR/publication
EUR/channel
forecast

BUSINESS

views/EUR
followers/EUR

In futuro:

revenue
revenue/channel
profit
ROI

---

# 62. EXPERIMENT TRACKING

Ogni video deve poter avere:

format_id
hook_type
caption_style
duration_bucket
voice_id
topic

Esempi hook_type:

QUESTION
SHOCK
CURIOSITY
DIRECT_VALUE
STORY

Questo permetterà di capire quali pattern funzionano.

---

# 63. A/B LEARNING

NON pubblicare duplicati quasi identici sullo stesso account solo per A/B test.

Usare analytics aggregate.

Confrontare:

format
hook
duration
topic

tra video differenti.

---

# 64. ADMIN SETTINGS

Dashboard settings:

daily target
publishing slots
max duration
min score
review required
providers
monthly budget
platform enabled
cleanup retention
render quality
concurrency

---

# 65. FAIL-SAFE

Aggiungere global kill switches:

STOP_ALL_PUBLISHING
STOP_RENDERING
STOP_PAID_APIS

Configurabili via admin.

Se:

budget exceeded

automaticamente:

STOP_PAID_APIS = logical true

ma mantenere dashboard e analytics funzionanti.

---

# 66. FIRST RUN WIZARD

Dashboard deve guidare setup:

1 Create Admin
2 Configure Storage
3 Configure AI
4 Configure Budget
5 Create Channels
6 Connect YouTube
7 Connect TikTok
8 Connect Instagram
9 Add Sources
10 Run Test Pipeline

Mostrare:

READY / NOT READY

per ogni integration.

---

# 67. SYSTEM HEALTH

Visualizzare:

Database ✅
Redis ✅
Storage ✅
FFmpeg ✅
LLM ✅
Transcription ✅
TTS ✅
YouTube ⚠
TikTok ⚠
Instagram ⚠

Non mostrare falso verde se credentials non sono state realmente validate.

---

# 68. INITIAL OPERATING MODE

Primi test:

1 video.

Poi:

3 video.

Poi:

18/day.

Non iniziare immediatamente renderizzando 540 video.

Prima verificare:

quality
cost
upload
errors
rights workflow.

---

# 69. DEFINITION OF DONE MVP

L'MVP è completato quando posso:

aprire dashboard
→ vedere tre channels
→ inserire/source candidate
→ analizzarlo
→ generare plan
→ renderizzare vertical video
→ vedere preview
→ approvare
→ schedulare
→ pubblicare tramite almeno YouTube reale + publisher mock altri
→ raccogliere analytics
→ vedere costo
→ non superare budget configurato

senza usare terminale per le normali operazioni.

---

# 70. IMPORTANT DEVELOPMENT BEHAVIOUR

Durante l'implementazione:

NON riscrivere l'intero progetto a ogni fase.

NON cambiare framework senza motivo.

NON introdurre Kubernetes.

NON introdurre microservizi separati distribuiti per l'MVP.

NON usare servizi SaaS costosi se possiamo usare open source/self-hosted.

NON implementare ML prematuramente.

NON inventare endpoint di terze parti.

Controlla sempre documentazione ufficiale corrente per API esterne prima di implementare l'adapter.

Quando un requisito esterno non è disponibile:

implementare interface + mock + TODO documentato.

---

# 71. COME DEVI LAVORARE

Da questo momento NON limitarti a spiegarmi cosa faresti.

Devi implementare realmente il repository.

Prima:

1. analizza questa specification;
2. crea ARCHITECTURE.md;
3. crea PROJECT_PLAN.md;
4. crea TODO.md;
5. crea monorepo;
6. implementa PHASE 1;
7. esegui lint;
8. esegui typecheck;
9. esegui test;
10. correggi gli errori;
11. mostra cosa è stato completato.

Dopo ogni phase:

- esegui test;
- aggiorna TODO.md;
- aggiorna PROJECT_PLAN.md;
- effettua un commit Git descrittivo se il repository Git è disponibile.

NON saltare una fase solo per arrivare prima alla UI.

---

# 72. REGOLA SULLE DOMANDE

Non chiedermi decisioni tecniche minori.

Per decisioni reversibili scegli autonomamente l'opzione più semplice, economica e mantenibile.

Chiedimi solamente informazioni che non puoi inventare, per esempio:

API keys
OAuth credentials
account IDs
dominio
server credentials
account authorization

Non chiedere mai di incollare secrets dentro source code.

Dimmi invece esattamente dove inserirli in .env o secret manager.

---

# 73. PRIORITÀ

Ordine assoluto:

1 reliability
2 safety / rights
3 budget
4 content quality
5 observability
6 automation
7 scalability
8 aesthetics

Non sacrificare i primi quattro per aumentare il numero di feature.

---

# START

Inizia ora dalla PHASE 1.

Prima stampa una sintesi estremamente breve dell'architettura scelta.

Poi crea i file necessari e implementa.

Non fermarti alla pianificazione: procedi con l'implementazione finché l'ambiente disponibile te lo permette.