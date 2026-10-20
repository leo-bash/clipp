"use client";

import { useEffect, useState } from "react";
import type { Candidate, Channel, Cost, DependencyHealth, Platform, PlatformAccount, Publication, RightsStatus, Source, Video } from "@shortfactory/shared";

interface OperationsPanelProps { channels: Channel[]; health: DependencyHealth[]; }
const sections = ["First Run", "Overview", "Channels", "Candidates", "Videos", "Review Queue", "Publishing", "Analytics", "Costs", "Sources", "Accounts", "Settings", "System Health"] as const;
const platforms: Platform[] = ["YOUTUBE", "TIKTOK", "INSTAGRAM"];
const rightsStatuses: RightsStatus[] = ["OWNED", "LICENSED", "CREATIVE_COMMONS", "PUBLIC_DOMAIN", "COMMENTARY_REVIEW", "UNKNOWN", "BLOCKED"];
type AnalyticsOverview = { snapshotCount: number; totals: { views: number; likes: number; comments: number; shares: number; followersGained: number }; byChannel: Record<string, { views: number; likes: number; comments: number; shares: number; followersGained: number }>; byFormat: Record<string, { views: number; likes: number; comments: number; shares: number; followersGained: number }> };
type SettingsDraft = { videosPerDay: string; minDuration: string; maxDuration: string; minScore: string; monthlyBudget: string; publishingSlots: string; reviewRequired: boolean; cleanupRetentionDays: string; renderQuality: string; concurrency: string; };
type RedditCandidateAnalysis = { provider?: string; redditPostId?: string; subreddit?: string; permalink?: string; score?: number; theme?: string; sourceText?: string; selectedForDate?: string; dailySchedule?: { timeBand?: string; scheduledAt?: string; timezone?: string; } };
type RedditScheduleBand = { id: string; timezone: string; time: string; label: string };
type LocalConnection = { connected: boolean; hostname?: string; platform?: string; nodeVersion?: string; command?: string; message?: string };
type LocalUploadJob = { id: string; status: "RUNNING" | "SUCCEEDED" | "FAILED"; startedAt: string; finishedAt?: string; logPath: string; output?: string; error?: string };
type LocalPlan = { id: string; status: string; selectionDate: string; createdAt: string; items: Array<{ candidateId: string; title: string; band: string; scheduledAt: string; status: string; error?: string }> };
const redditThemes = ["rotation", "highschool", "romance", "embarrassing", "bullies", "family", "scary", "money", "tinder", "prank", "divorce", "betrayal", "revenge"] as const;
const redditScheduleBands: RedditScheduleBand[] = [
  { id: "EUROPE_MORNING", timezone: "Europe/Rome", time: "09:00", label: "Europe · morning (08:00–10:00)" },
  { id: "EUROPE_LUNCH", timezone: "Europe/Rome", time: "13:00", label: "Europe · lunch (12:00–14:00)" },
  { id: "EUROPE_EVENING", timezone: "Europe/Rome", time: "19:30", label: "Europe · evening (18:00–21:00)" },
  { id: "US_LUNCH", timezone: "America/New_York", time: "13:00", label: "US Eastern · lunch (12:00–14:00)" },
  { id: "US_EVENING", timezone: "America/New_York", time: "19:30", label: "US Eastern · evening (18:00–21:00)" },
  { id: "US_LATE", timezone: "America/New_York", time: "22:00", label: "US Eastern · late evening (21:00–23:00)" },
];

function redditInfo(candidate: Candidate): RedditCandidateAnalysis | undefined {
  return candidate.analysis?.provider === "reddit" ? candidate.analysis as RedditCandidateAnalysis : undefined;
}

function restoreRedditSelection(items: Candidate[], channelId: string, selectionDate: string): { ids: string[]; schedules: Record<string, string> } {
  const ids: string[] = [];
  const schedules: Record<string, string> = {};
  for (const candidate of items) {
    const info = redditInfo(candidate);
    if (candidate.channelId !== channelId || info?.selectedForDate !== selectionDate || ids.length >= 5) continue;
    ids.push(candidate.id);
    schedules[candidate.id] = info.dailySchedule?.timeBand ?? "EUROPE_EVENING";
  }
  return { ids, schedules };
}

function localDateIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function OperationsPanel({ channels, health }: OperationsPanelProps): React.JSX.Element {
  const [availableChannels, setAvailableChannels] = useState(channels);
  const [active, setActive] = useState<(typeof sections)[number]>("First Run");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceRights, setSourceRights] = useState<RightsStatus>("UNKNOWN");
  const [sourceKeywords, setSourceKeywords] = useState("");
  const [candidateTopic, setCandidateTopic] = useState("");
  const [redditTheme, setRedditTheme] = useState<(typeof redditThemes)[number]>("rotation");
  const [redditLoading, setRedditLoading] = useState(false);
  const [dailyPlanLoading, setDailyPlanLoading] = useState(false);
  const [selectedRedditIds, setSelectedRedditIds] = useState<string[]>([]);
  const [redditScheduleById, setRedditScheduleById] = useState<Record<string, string>>({});
  const [localPlans, setLocalPlans] = useState<LocalPlan[]>([]);
  const [localConnection, setLocalConnection] = useState<LocalConnection | undefined>();
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [uploadJob, setUploadJob] = useState<LocalUploadJob | undefined>();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview>({ snapshotCount: 0, totals: { views: 0, likes: 0, comments: 0, shares: 0, followersGained: 0 }, byChannel: {}, byFormat: {} });
  const [accountPlatform, setAccountPlatform] = useState<Platform>("YOUTUBE");
  const [accountExternalId, setAccountExternalId] = useState("");
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => draftForChannel(channels[0]));
  const [preview, setPreview] = useState<{ videoUrl?: string; thumbnailUrl?: string }>({});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  useEffect(() => {
    void Promise.all([load<Channel>("/api/v1/channels"), load<Candidate>("/api/v1/candidates"), load<Source>("/api/v1/sources"), load<Video>("/api/v1/videos"), load<Publication>("/api/v1/publications"), load<PlatformAccount>("/api/v1/platform-accounts"), load<Cost>("/api/v1/costs"), fetch(`${apiUrl}/api/v1/analytics/overview`, { credentials: "include" }).then(async (response) => await response.json() as AnalyticsOverview)]).then(([channelPage, candidatePage, sourcePage, videoPage, publicationPage, accountPage, costPage, analyticsOverview]) => {
      setAvailableChannels(channelPage.items);
      setCandidates(candidatePage.items);
      const today = localDateIso();
      const selection = restoreRedditSelection(candidatePage.items, channelId, today);
      setSelectedRedditIds(selection.ids);
      setRedditScheduleById(selection.schedules);
      setSources(sourcePage.items);
      setVideos(videoPage.items);
      setPublications(publicationPage.items);
      setAccounts(accountPage.items);
      setCosts(costPage.items);
      setAnalytics(analyticsOverview);
    }).catch(() => setMessage("API unavailable. Start the API service and try again."));
  }, []);

  useEffect(() => {
    const browser = globalThis as unknown as BrowserGlobals;
    const params = new URLSearchParams(browser.location.search);
    const integration = params.get("integration");
    const connected = params.get("connected");
    if (integration && connected) {
      setMessage(connected === "1" ? `${integration.toUpperCase()} connected. Publishing remains manual.` : `${integration.toUpperCase()} connection failed. Check the setup instructions.`);
      browser.history.replaceState({}, "", browser.location.pathname);
      void load<PlatformAccount>("/api/v1/platform-accounts").then((page) => setAccounts(page.items)).catch(() => undefined);
    }
  }, []);

  useEffect(() => { setAvailableChannels(channels); }, [channels]);
  useEffect(() => { if (!channelId && availableChannels[0]) setChannelId(availableChannels[0].id); }, [availableChannels, channelId]);
  useEffect(() => { setSettingsDraft(draftForChannel(availableChannels.find((channel) => channel.id === channelId) ?? availableChannels[0])); }, [channelId, availableChannels]);

  useEffect(() => {
    const today = localDateIso();
    const selection = restoreRedditSelection(candidates, channelId, today);
    setSelectedRedditIds(selection.ids);
    setRedditScheduleById(selection.schedules);
  }, [channelId, candidates]);

  useEffect(() => {
    void loadLocalPlans();
    const timer = setInterval(() => void loadLocalPlans(), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!uploadJob || uploadJob.status !== "RUNNING") return;
    const timer = setInterval(() => {
      void fetch(`${apiUrl}/api/v1/local-pipeline/upload/${uploadJob.id}`, { credentials: "include" }).then(async (response) => {
        if (response.ok) setUploadJob(await response.json() as LocalUploadJob);
      }).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [apiUrl, uploadJob]);

  useEffect(() => {
    if (!uploadJob || uploadJob.status === "RUNNING") return;
    setMessage(uploadJob.status === "SUCCEEDED" ? "Upload completato sul Mac." : `Upload fallito. Log: ${uploadJob.logPath}`);
  }, [uploadJob]);

  async function load<T>(path: string): Promise<{ items: T[] }> {
    const response = await fetch(`${apiUrl}${path}?page=1&pageSize=100`, { credentials: "include" });
    if (!response.ok) throw new Error(`GET ${path} failed`);
    return await response.json() as { items: T[] };
  }

  async function loadLocalPlans(): Promise<void> {
    try {
      const response = await fetch(`${apiUrl}/api/v1/local-pipeline/plans`, { credentials: "include" });
      if (!response.ok) return;
      const payload = await response.json() as { items?: LocalPlan[] };
      setLocalPlans(payload.items ?? []);
    } catch { /* The dashboard can still be used for manual review if the local runner is unavailable. */ }
  }

  async function checkLocalConnection(): Promise<void> {
    setConnectionLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/local-pipeline/connection`, { credentials: "include" });
      const payload = await response.json() as LocalConnection;
      setLocalConnection(payload);
      setMessage(payload.connected ? `Mac collegato: ${payload.hostname ?? "locale"}.` : payload.message ?? "Mac non raggiungibile.");
    } catch {
      setLocalConnection({ connected: false, message: "Il server locale del Mac non è raggiungibile. Avvialo e riprova." });
      setMessage("Il server locale del Mac non è raggiungibile. Avvialo e riprova.");
    } finally { setConnectionLoading(false); }
  }

  async function runLocalUpload(): Promise<void> {
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/local-pipeline/upload`, { method: "POST", credentials: "include" });
      const payload = await response.json() as LocalUploadJob & { error?: string };
      if (!response.ok) { setMessage(payload.error ?? "Impossibile avviare l'upload sul Mac."); return; }
      setUploadJob(payload);
      setMessage("Upload avviato sul Mac. Puoi lasciare aperta questa pagina.");
    } catch { setMessage("Il server locale del Mac non è raggiungibile. Avvialo e riprova."); }
  }

  async function createSource(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const created = await request<Source>("/api/v1/sources", { name: sourceName, type: "MANUAL", url: sourceUrl, rightsStatus: sourceRights, enabled: true, keywords: sourceKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean) });
    if (created) { setSources((items) => [created, ...items]); setSourceName(""); setSourceUrl(""); setSourceKeywords(""); }
  }

  async function createCandidate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const created = await request<Candidate>("/api/v1/candidates", { channelId, topic: candidateTopic });
    if (created) { setCandidates((items) => [created, ...items]); setCandidateTopic(""); }
  }

  async function request<T = unknown>(path: string, payload: unknown, method = "POST"): Promise<T | undefined> {
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}${path}`, { method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setMessage(`Action failed (${response.status})`); return undefined; }
      setMessage("Action completed.");
      return await response.json() as T;
    } catch { setMessage("API unavailable. Start the API service and try again."); return undefined; }
  }

  async function toggleSource(source: Source): Promise<void> {
    const updated = await request<Source>(`/api/v1/sources/${source.id}`, { enabled: !source.enabled }, "PATCH");
    if (updated) setSources((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function candidateAction(candidate: Candidate, action: "analyze" | "plan"): Promise<void> {
    const updated = await request<Candidate>(`/api/v1/candidates/${candidate.id}/${action}`, {});
    if (updated) setCandidates((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function discoverReddit(): Promise<void> {
    setRedditLoading(true);
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/reddit/proposals`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId, theme: redditTheme, limit: 10 }) });
      const payload = await response.json() as { items?: Candidate[]; created?: number; message?: string; theme?: string };
      if (!response.ok) { setMessage(payload.message ?? "Reddit proposals could not be loaded. Check Reddit API credentials."); return; }
      const items = payload.items ?? [];
      setCandidates((current) => [...items, ...current.filter((candidate) => !items.some((item) => item.id === candidate.id))]);
      setMessage(`${payload.created ?? items.length} Reddit stor${(payload.created ?? items.length) === 1 ? "y" : "ies"} proposed${payload.theme ? ` for ${payload.theme}` : ""}. Select exactly 5 for today.`);
    } catch { setMessage("API unavailable. Start the API service and try again."); }
    finally { setRedditLoading(false); }
  }

  function toggleRedditSelection(candidateId: string): void {
    setSelectedRedditIds((current) => {
      if (current.includes(candidateId)) {
        setRedditScheduleById((schedules) => { const next = { ...schedules }; delete next[candidateId]; return next; });
        return current.filter((id) => id !== candidateId);
      }
      if (current.length >= 5) { setMessage("Select a maximum of 5 stories for today."); return current; }
      setRedditScheduleById((schedules) => ({ ...schedules, [candidateId]: schedules[candidateId] ?? "EUROPE_EVENING" }));
      return [...current, candidateId];
    });
  }

  async function generateAndScheduleDailySelection(): Promise<void> {
    if (selectedRedditIds.length !== 5) { setMessage("Select exactly 5 Reddit stories before generating the daily list."); return; }
    setDailyPlanLoading(true);
    const result = await request<LocalPlan>("/api/v1/local-pipeline/daily", { channelId, selectionDate: localDateIso(), items: selectedRedditIds.map((candidateId) => ({ candidateId, band: redditScheduleById[candidateId] ?? "EUROPE_EVENING", platforms })) });
    if (result) {
      setLocalPlans((plans) => [result, ...plans.filter((plan) => plan.id !== result.id)]);
      const refreshed = await load<Candidate>("/api/v1/candidates").catch(() => undefined);
      if (refreshed) setCandidates(refreshed.items);
      setMessage("5 storie inviate alla pipeline locale del Mac. La generazione parte ora e l'upload attende gli orari scelti.");
    }
    setDailyPlanLoading(false);
  }

  async function runPipeline(candidate: Candidate): Promise<void> {
    const result = await request<{ video: Video; previewUrl?: string; thumbnailUrl?: string }>("/api/v1/pipeline/test", { candidateId: candidate.id });
    if (!result) return;
    setVideos((items) => [result.video, ...items.filter((item) => item.id !== result.video.id)]);
    setPreview({ videoUrl: result.previewUrl ? `${apiUrl}/api/v1${result.previewUrl}` : undefined, thumbnailUrl: result.thumbnailUrl ? `${apiUrl}/api/v1${result.thumbnailUrl}` : undefined });
    setActive("Review Queue");
  }

  async function videoAction(video: Video, action: "approve" | "rerender"): Promise<void> {
    const updated = await request<Video>(`/api/v1/videos/${video.id}/${action}`, {});
    if (updated) setVideos((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  async function publish(video: Video, platform: Platform): Promise<void> {
    const publication = await request<Publication>("/api/v1/publications", { videoId: video.id, platform });
    if (publication) setPublications((items) => [publication, ...items]);
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const created = await request<PlatformAccount>("/api/v1/platform-accounts", { channelId, platform: accountPlatform, externalAccountId: accountExternalId, displayName: accountDisplayName, status: "DISCONNECTED" });
    if (created) { setAccounts((items) => [created, ...items]); setAccountExternalId(""); setAccountDisplayName(""); }
  }

  async function connectIntegration(platform: "YOUTUBE" | "TIKTOK"): Promise<void> {
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}/api/v1/integrations/${platform.toLowerCase()}/start?channelId=${encodeURIComponent(channelId)}`, { credentials: "include" });
      const payload = await response.json() as { authorizationUrl?: string; message?: string };
      if (!response.ok || !payload.authorizationUrl) { setMessage(payload.message ?? "Integration is not configured yet."); return; }
      (globalThis as unknown as BrowserGlobals).location.assign(payload.authorizationUrl);
    } catch { setMessage("API unavailable. Start the API service and try again."); }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const channel = availableChannels.find((item) => item.id === channelId) ?? availableChannels[0];
    if (!channel) return;
    const currentSettings = channel.settings ?? {};
    const updated = await request<Channel>(`/api/v1/channels/${channel.id}`, { videosPerDay: Number(settingsDraft.videosPerDay), minDuration: Number(settingsDraft.minDuration), maxDuration: Number(settingsDraft.maxDuration), manualReviewRequired: settingsDraft.reviewRequired, monthlyBudget: Number(settingsDraft.monthlyBudget), publishingSlots: settingsDraft.publishingSlots.split(",").map((slot) => slot.trim()).filter(Boolean), settings: { ...currentSettings, minScore: Number(settingsDraft.minScore), cleanupRetentionDays: Number(settingsDraft.cleanupRetentionDays), renderQuality: settingsDraft.renderQuality, concurrency: Number(settingsDraft.concurrency) } }, "PATCH");
    if (updated) setMessage(`Settings saved for ${updated.name}.`);
  }

  const dependency = (name: string): DependencyHealth | undefined => health.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const ready = (name: string): boolean => dependency(name)?.status === "ok";
  const setupItems = [
    { step: "Create Admin", ready: ready("auth"), detail: dependency("auth")?.detail ?? "Authentication status unavailable." },
    { step: "Configure Storage", ready: ready("storage"), detail: dependency("storage")?.detail ?? "Storage status unavailable." },
    { step: "Configure AI", ready: ready("llm"), detail: dependency("llm")?.detail ?? "LLM status unavailable." },
    { step: "Configure Budget", ready: ready("budget"), detail: dependency("budget")?.detail ?? "Budget status unavailable." },
    { step: "Create Channels", ready: availableChannels.length >= 3, detail: `${availableChannels.length}/3 configured channels.` },
    { step: "Connect YouTube", ready: accounts.some((account) => account.platform === "YOUTUBE" && account.status === "CONNECTED"), detail: "OAuth connection is kept private until you approve a publication." },
    { step: "Connect TikTok", ready: accounts.some((account) => account.platform === "TIKTOK" && account.status === "CONNECTED"), detail: "Videos are sent as drafts for the first verification." },
    { step: "Connect Instagram", ready: ready("platforms"), detail: "Credentials are validated at publish time." },
    { step: "Add Sources", ready: sources.length > 0, detail: `${sources.length} source(s) configured.` },
    { step: "Run Test Pipeline", ready: videos.some((video) => video.storageKey), detail: "Run it from Candidates to create a reviewable preview." }
  ];
  const redditCandidates = candidates.filter((candidate) => candidate.channelId === channelId && Boolean(redditInfo(candidate)));
  const manualCandidates = candidates.filter((candidate) => candidate.channelId === channelId && !redditInfo(candidate));
  const selectedRedditCandidates = selectedRedditIds.map((id) => redditCandidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is Candidate => Boolean(candidate));
  const today = localDateIso();

  return <section className="operations" aria-label="operations workspace">
    <nav className="section-tabs" aria-label="dashboard sections">
      {sections.map((section) => <button className={section === active ? "active" : ""} key={section} type="button" onClick={() => setActive(section)}>{section}</button>)}
    </nav>
    <div className="operations-panel">
      <p className="eyebrow">{active.toUpperCase()}</p>
      {active === "First Run" ? <div className="wizard" aria-label="first run wizard"><p className="muted">Complete the setup in order. A degraded or unvalidated integration is never shown as ready.</p>{setupItems.map((item, index) => <article className="wizard-item" key={item.step}><span className={`status-dot ${item.ready ? "ok" : "degraded"}`} aria-hidden="true" /><div><strong>{index + 1}. {item.step}</strong><small>{item.ready ? "READY" : "NOT READY"} · {item.detail}</small></div></article>)}</div> : null}
      {active === "Overview" ? <div className="overview-grid"><strong>{availableChannels.length} channels configured</strong><span>{candidates.length} candidates · {videos.length} videos · {publications.length} publications</span><span>Manual review is required before publishing.</span><span>Pipeline order: discover → ingest → transcribe → analyze → plan → TTS → render → QC → review → publish → analytics → cleanup.</span></div> : null}
      {active === "Channels" ? <div className="stack-list">{availableChannels.map((channel) => <div className="channel-row" key={channel.id}><span>{channel.name}</span><small>{channel.timezone} · {channel.videosPerDay}/day · {channel.status}</small></div>)}</div> : null}
      {active === "Sources" ? <><form className="inline-form" onSubmit={(event) => void createSource(event)}><input required placeholder="Source name" value={sourceName} onChange={(event) => setSourceName((event.currentTarget as unknown as { value: string }).value)} /><input required type="url" placeholder="https://example.com" value={sourceUrl} onChange={(event) => setSourceUrl((event.currentTarget as unknown as { value: string }).value)} /><select value={sourceRights} onChange={(event) => setSourceRights((event.currentTarget as unknown as { value: RightsStatus }).value)}>{rightsStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><input placeholder="keywords, comma separated" value={sourceKeywords} onChange={(event) => setSourceKeywords((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add manual source</button></form><div className="entity-list">{sources.map((source) => <article className="entity-card" key={source.id}><strong>{source.name}</strong><small>{source.rightsStatus} · {source.enabled ? "enabled" : "disabled"} · {(source.keywords ?? []).join(", ") || "no keywords"}</small><div className="review-actions"><button type="button" onClick={() => void toggleSource(source)}>{source.enabled ? "Disable" : "Enable"}</button></div></article>)}</div></> : null}
      {active === "Candidates" ? <>
        <div className="reddit-discovery-panel">
          <div>
            <strong>Reddit story proposals</strong>
            <small>Find filtered public stories, review the originals, then select exactly 5 for today.</small>
          </div>
          <div className="inline-form">
            <select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select>
            <select value={redditTheme} onChange={(event) => setRedditTheme(fieldValue(event) as (typeof redditThemes)[number])}>{redditThemes.map((theme) => <option key={theme} value={theme}>{theme === "rotation" ? "Random theme rotation" : theme}</option>)}</select>
            <button type="button" disabled={redditLoading || !channelId} onClick={() => void discoverReddit()}>{redditLoading ? "Finding stories…" : "Propose Reddit stories"}</button>
          </div>
          <div className="selection-bar">
            <strong>{selectedRedditIds.length}/5 selected for {today}</strong>
            <button type="button" disabled={dailyPlanLoading || selectedRedditIds.length !== 5} onClick={() => void generateAndScheduleDailySelection()}>{dailyPlanLoading ? "Starting generation…" : "Confirm times · generate & schedule 5"}</button>
          </div>
          {selectedRedditCandidates.length > 0 ? <div className="selected-reddit-list"><strong>Selected stories and publication times</strong><small>After confirmation, all five videos are generated first. Each upload then waits for its selected time.</small>{selectedRedditCandidates.map((candidate) => { const band = redditScheduleBands.find((option) => option.id === (redditScheduleById[candidate.id] ?? "EUROPE_EVENING")); return <div className="selected-reddit-row" key={candidate.id}><span>{candidate.topic}</span><small>{band?.label ?? "Europe · evening"} · {band?.time ?? "19:30"} · {band?.timezone ?? "Europe/Rome"}</small></div>; })}</div> : null}
          <div className="local-pipeline-panel">
            <div><strong>Pipeline locale del Mac</strong><small>La pagina controlla lo stato ogni 5 secondi. Il Mac deve rimanere acceso per attendere gli orari programmati.</small></div>
            <div className="review-actions">
              <button type="button" disabled={connectionLoading} onClick={() => void checkLocalConnection()}>{connectionLoading ? "Verifica in corso…" : "Collega / verifica Mac"}</button>
              <button type="button" disabled={!localConnection?.connected || uploadJob?.status === "RUNNING"} onClick={() => void runLocalUpload()}>{uploadJob?.status === "RUNNING" ? "Upload in corso…" : "Esegui upload ultimo video"}</button>
              <button type="button" onClick={() => void loadLocalPlans()}>Aggiorna piani</button>
            </div>
            {localConnection ? <small className={localConnection.connected ? "review-message" : "error-text"}>{localConnection.connected ? `Mac collegato · ${localConnection.hostname ?? "locale"} · ${localConnection.nodeVersion ?? "Node"}` : localConnection.message ?? "Mac non raggiungibile"}</small> : <small className="muted">Premi “Collega / verifica Mac” per controllare il server locale.</small>}
            {uploadJob ? <div className="local-upload-status"><strong>Upload: {uploadJob.status}</strong>{uploadJob.error ? <small className="error-text">{uploadJob.error}</small> : null}{uploadJob.output ? <pre>{uploadJob.output}</pre> : null}</div> : null}
            {localPlans.length === 0 ? <small className="muted">No local plans yet.</small> : localPlans.slice(0, 3).map((plan) => <div className="local-plan" key={plan.id}><strong>{plan.selectionDate} · {plan.status}</strong><small>{plan.items.filter((item) => item.status === "COMPLETED").length}/{plan.items.length} completed</small><div>{plan.items.map((item) => <span className="local-plan-item" key={item.candidateId}>{item.status} · {item.title} · {new Date(item.scheduledAt).toLocaleString()}</span>)}</div></div>)}
          </div>
        </div>
        <div className="entity-list">
          {redditCandidates.length === 0 ? <p className="muted">No Reddit proposals yet. Choose a theme and fetch stories.</p> : redditCandidates.map((candidate) => {
            const info = redditInfo(candidate);
            const selected = selectedRedditIds.includes(candidate.id);
            return <article className={`entity-card reddit-card${selected ? " selected" : ""}`} key={candidate.id}>
              <label className="proposal-select"><input type="checkbox" checked={selected} onChange={() => toggleRedditSelection(candidate.id)} /><strong>{candidate.topic}</strong></label>
              <small>r/{info?.subreddit ?? "reddit"} · {info?.score ?? 0} upvotes · {info?.theme ?? "story"} · {candidate.status}</small>
              <details className="reddit-source" open={selected}><summary>{selected ? "Selected Reddit text" : "Read full Reddit text"}</summary><p>{String(info?.sourceText ?? "")}</p></details>
              {selected ? <label className="schedule-choice">Publication time<select aria-label={`Publication time for ${candidate.topic}`} value={redditScheduleById[candidate.id] ?? "EUROPE_EVENING"} onChange={(event) => setRedditScheduleById((schedules) => ({ ...schedules, [candidate.id]: fieldValue(event) }))}>{redditScheduleBands.map((band) => <option key={band.id} value={band.id}>{band.label} · {band.time} ({band.timezone})</option>)}</select></label> : null}
              <div className="review-actions">
                {info?.permalink ? <a className="source-link" href={info.permalink} target="_blank" rel="noreferrer">Open original</a> : null}
                <button type="button" onClick={() => void candidateAction(candidate, "analyze")}>Analyze</button>
                <button type="button" onClick={() => void candidateAction(candidate, "plan")}>Plan</button>
                <button type="button" onClick={() => void runPipeline(candidate)}>Run test pipeline</button>
              </div>
            </article>;
          })}
        </div>
        <form className="inline-form" onSubmit={(event) => void createCandidate(event)}><select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><input required placeholder="Candidate topic" value={candidateTopic} onChange={(event) => setCandidateTopic(fieldValue(event))} /><button type="submit">Add manual candidate</button></form>
        {manualCandidates.length > 0 ? <div className="entity-list">{manualCandidates.map((candidate) => <article className="entity-card" key={candidate.id}><strong>{candidate.topic}</strong><small>{candidate.status} · score {candidate.scoreTotal}</small><div className="review-actions"><button type="button" onClick={() => void candidateAction(candidate, "analyze")}>Analyze</button><button type="button" onClick={() => void candidateAction(candidate, "plan")}>Plan</button><button type="button" onClick={() => void runPipeline(candidate)}>Run test pipeline</button></div></article>)}</div> : null}
      </> : null}
      {active === "Videos" ? <div className="entity-list">{videos.length === 0 ? <p className="muted">No videos yet.</p> : videos.map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{video.status} · rights {video.rightsStatus} · render v{video.renderVersion}</small><div className="review-actions"><button type="button" onClick={() => void videoAction(video, "rerender")}>Rerender</button><button type="button" onClick={() => void videoAction(video, "approve")}>Approve</button></div>{video.storageKey ? <video controls preload="metadata" width="180" src={`${apiUrl}/api/v1/media/${video.storageKey}`} /> : null}</article>)}</div> : null}
      {active === "Review Queue" ? <><p className="muted">Review cards below expose edit metadata, rerender, approve, and reject actions.</p>{preview.videoUrl ? <div className="preview"><video controls width="240" src={preview.videoUrl} />{preview.thumbnailUrl ? <img alt="Latest pipeline thumbnail" src={preview.thumbnailUrl} width="160" /> : null}</div> : null}</> : null}
      {active === "Publishing" ? <div className="entity-list">{videos.filter((video) => video.status === "APPROVED").length === 0 ? <p className="muted">Approve a video before scheduling it.</p> : videos.filter((video) => video.status === "APPROVED").map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{publications.filter((item) => item.videoId === video.id).length} publication(s)</small><div className="review-actions">{platforms.map((platform) => <button type="button" key={platform} onClick={() => void publish(video, platform)}>Schedule {platform}</button>)}</div></article>)}</div> : null}
      {active === "Analytics" ? <div className="overview-grid"><strong>{analytics.snapshotCount} snapshots · {analytics.totals.views} views · {analytics.totals.followersGained} followers</strong><span>Likes {analytics.totals.likes} · comments {analytics.totals.comments} · shares {analytics.totals.shares}</span>{Object.entries(analytics.byFormat).sort(([, left], [, right]) => right.views - left.views).slice(0, 5).map(([format, totals]) => <span key={format}>Format {format}: {totals.views} views</span>)}</div> : null}
      {active === "Costs" ? <div className="overview-grid"><strong>{costs.length} cost records · €{costs.reduce((total, cost) => total + (cost.actualCostEur ?? cost.estimatedCostEur), 0).toFixed(2)} observed</strong>{costs.slice(0, 10).map((cost) => <span key={cost.id}>{cost.service}/{cost.operation}: €{(cost.actualCostEur ?? cost.estimatedCostEur).toFixed(2)} · {cost.unit}</span>)}{costs.length === 0 ? <span className="muted">No cost records yet.</span> : null}</div> : null}
      {active === "Accounts" ? <><div className="overview-grid"><p className="muted">Connect your accounts with the official authorization pages. Tokens stay on this computer, encrypted and excluded from Git.</p><label>Channel<select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><div className="review-actions"><button type="button" onClick={() => void connectIntegration("YOUTUBE")}>Connect YouTube</button><button type="button" onClick={() => void connectIntegration("TIKTOK")}>Connect TikTok</button></div></div><form className="inline-form" onSubmit={(event) => void createAccount(event)}><select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><select value={accountPlatform} onChange={(event) => setAccountPlatform(fieldValue(event) as Platform)}>{platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select><input required placeholder="External account ID" value={accountExternalId} onChange={(event) => setAccountExternalId(fieldValue(event))} /><input required placeholder="Display name" value={accountDisplayName} onChange={(event) => setAccountDisplayName(fieldValue(event))} /><button type="submit">Add manual account</button></form><div className="entity-list">{accounts.length === 0 ? <p className="muted">No platform accounts connected yet.</p> : accounts.map((account) => <article className="entity-card" key={account.id}><strong>{account.displayName}</strong><small>{account.platform} · {account.externalAccountId} · {account.status}</small></article>)}</div></> : null}
      {active === "Settings" ? <form className="overview-grid" onSubmit={(event) => void saveSettings(event)}><label>Channel<select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label>Daily target<input type="number" min="0" max="100" value={settingsDraft.videosPerDay} onChange={(event) => setSettingsDraft({ ...settingsDraft, videosPerDay: fieldValue(event) })} /></label><label>Min duration<input type="number" min="1" max="600" value={settingsDraft.minDuration} onChange={(event) => setSettingsDraft({ ...settingsDraft, minDuration: fieldValue(event) })} /></label><label>Max duration<input type="number" min="1" max="600" value={settingsDraft.maxDuration} onChange={(event) => setSettingsDraft({ ...settingsDraft, maxDuration: fieldValue(event) })} /></label><label>Min score<input type="number" min="0" max="100" value={settingsDraft.minScore} onChange={(event) => setSettingsDraft({ ...settingsDraft, minScore: fieldValue(event) })} /></label><label>Monthly budget EUR<input type="number" min="0" step="0.01" value={settingsDraft.monthlyBudget} onChange={(event) => setSettingsDraft({ ...settingsDraft, monthlyBudget: fieldValue(event) })} /></label><label>Publishing slots<input value={settingsDraft.publishingSlots} onChange={(event) => setSettingsDraft({ ...settingsDraft, publishingSlots: fieldValue(event) })} /></label><label>Cleanup retention days<input type="number" min="1" value={settingsDraft.cleanupRetentionDays} onChange={(event) => setSettingsDraft({ ...settingsDraft, cleanupRetentionDays: fieldValue(event) })} /></label><label>Render quality<input value={settingsDraft.renderQuality} onChange={(event) => setSettingsDraft({ ...settingsDraft, renderQuality: fieldValue(event) })} /></label><label>Concurrency<input type="number" min="1" value={settingsDraft.concurrency} onChange={(event) => setSettingsDraft({ ...settingsDraft, concurrency: fieldValue(event) })} /></label><label><input type="checkbox" checked={settingsDraft.reviewRequired} onChange={(event) => setSettingsDraft({ ...settingsDraft, reviewRequired: fieldChecked(event) })} /> Review required</label><button type="submit">Save channel settings</button><p className="muted">Providers, global kill switches and runtime credentials are shown by readiness and remain controlled by server configuration. Kill switches can be changed through the admin-only settings API.</p></form> : null}
      {active === "System Health" ? <p className="muted">Open <code>/ready</code> for Postgres, Redis, storage, FFmpeg, provider, and worker dependency status.</p> : null}
      {message ? <p className="review-message" role="status">{message}</p> : null}
    </div>
  </section>;
}

function fieldValue(event: { currentTarget: unknown }): string { return (event.currentTarget as { value: string }).value; }
function fieldChecked(event: { currentTarget: unknown }): boolean { return (event.currentTarget as { checked: boolean }).checked; }

interface BrowserGlobals { location: { search: string; pathname: string; assign(url: string): void }; history: { replaceState(data: unknown, unused: string, url?: string): void }; }

function draftForChannel(channel: Channel | undefined): SettingsDraft {
  const settings = channel?.settings ?? {};
  return { videosPerDay: String(channel?.videosPerDay ?? 6), minDuration: String(channel?.minDuration ?? 18), maxDuration: String(channel?.maxDuration ?? 45), minScore: typeof settings.minScore === "number" ? String(settings.minScore) : "0", monthlyBudget: String(channel?.monthlyBudget ?? 0), publishingSlots: (channel?.publishingSlots ?? []).join(", "), reviewRequired: channel?.manualReviewRequired ?? true, cleanupRetentionDays: typeof settings.cleanupRetentionDays === "number" ? String(settings.cleanupRetentionDays) : "30", renderQuality: typeof settings.renderQuality === "string" ? settings.renderQuality : "1080x1920-h264", concurrency: typeof settings.concurrency === "number" ? String(settings.concurrency) : "1" };
}
