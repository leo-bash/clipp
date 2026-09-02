"use client";

import { useEffect, useState } from "react";
import type { Candidate, Channel, Cost, DependencyHealth, Platform, PlatformAccount, Publication, RightsStatus, Source, Video } from "@shortfactory/shared";

interface OperationsPanelProps { channels: Channel[]; health: DependencyHealth[]; }
const sections = ["First Run", "Overview", "Channels", "Candidates", "Videos", "Review Queue", "Publishing", "Analytics", "Costs", "Sources", "Accounts", "Settings", "System Health"] as const;
const platforms: Platform[] = ["YOUTUBE", "TIKTOK", "INSTAGRAM"];
const rightsStatuses: RightsStatus[] = ["OWNED", "LICENSED", "CREATIVE_COMMONS", "PUBLIC_DOMAIN", "COMMENTARY_REVIEW", "UNKNOWN", "BLOCKED"];
type AnalyticsOverview = { snapshotCount: number; totals: { views: number; likes: number; comments: number; shares: number; followersGained: number }; byChannel: Record<string, { views: number; likes: number; comments: number; shares: number; followersGained: number }>; byFormat: Record<string, { views: number; likes: number; comments: number; shares: number; followersGained: number }> };
type SettingsDraft = { videosPerDay: string; minDuration: string; maxDuration: string; minScore: string; monthlyBudget: string; publishingSlots: string; reviewRequired: boolean; cleanupRetentionDays: string; renderQuality: string; concurrency: string; };

export default function OperationsPanel({ channels, health }: OperationsPanelProps): React.JSX.Element {
  const [active, setActive] = useState<(typeof sections)[number]>("First Run");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceRights, setSourceRights] = useState<RightsStatus>("UNKNOWN");
  const [sourceKeywords, setSourceKeywords] = useState("");
  const [candidateTopic, setCandidateTopic] = useState("");
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
    void Promise.all([load<Candidate>("/api/v1/candidates"), load<Source>("/api/v1/sources"), load<Video>("/api/v1/videos"), load<Publication>("/api/v1/publications"), load<PlatformAccount>("/api/v1/platform-accounts"), load<Cost>("/api/v1/costs"), fetch(`${apiUrl}/api/v1/analytics/overview`).then(async (response) => await response.json() as AnalyticsOverview)]).then(([candidatePage, sourcePage, videoPage, publicationPage, accountPage, costPage, analyticsOverview]) => {
      setCandidates(candidatePage.items);
      setSources(sourcePage.items);
      setVideos(videoPage.items);
      setPublications(publicationPage.items);
      setAccounts(accountPage.items);
      setCosts(costPage.items);
      setAnalytics(analyticsOverview);
    }).catch(() => setMessage("API unavailable. Start the API service and try again."));
  }, []);

  useEffect(() => { setSettingsDraft(draftForChannel(channels.find((channel) => channel.id === channelId) ?? channels[0])); }, [channelId, channels]);

  async function load<T>(path: string): Promise<{ items: T[] }> {
    const response = await fetch(`${apiUrl}${path}?page=1&pageSize=100`);
    if (!response.ok) throw new Error(`GET ${path} failed`);
    return await response.json() as { items: T[] };
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
      const response = await fetch(`${apiUrl}${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
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

  async function saveSettings(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const channel = channels.find((item) => item.id === channelId) ?? channels[0];
    if (!channel) return;
    const currentSettings = channel.settings ?? {};
    const updated = await request<Channel>(`/api/v1/channels/${channel.id}`, { videosPerDay: Number(settingsDraft.videosPerDay), minDuration: Number(settingsDraft.minDuration), maxDuration: Number(settingsDraft.maxDuration), manualReviewRequired: settingsDraft.reviewRequired, monthlyBudget: Number(settingsDraft.monthlyBudget), publishingSlots: settingsDraft.publishingSlots.split(",").map((slot) => slot.trim()).filter(Boolean), settings: { ...currentSettings, minScore: Number(settingsDraft.minScore), cleanupRetentionDays: Number(settingsDraft.cleanupRetentionDays), renderQuality: settingsDraft.renderQuality, concurrency: Number(settingsDraft.concurrency) } }, "PATCH");
    if (updated) setMessage(`Settings saved for ${updated.name}.`);
  }

  const dependency = (name: string): DependencyHealth | undefined => health.find((item) => item.name.toLowerCase() === name.toLowerCase());
  const ready = (name: string): boolean => dependency(name)?.status === "ok";
  const setupItems = [
    { step: "Create Admin", ready: false, detail: "Authentication provider is not configured in this MVP boundary." },
    { step: "Configure Storage", ready: ready("storage"), detail: dependency("storage")?.detail ?? "Storage status unavailable." },
    { step: "Configure AI", ready: ready("llm"), detail: dependency("llm")?.detail ?? "LLM status unavailable." },
    { step: "Configure Budget", ready: ready("budget"), detail: dependency("budget")?.detail ?? "Budget status unavailable." },
    { step: "Create Channels", ready: channels.length >= 3, detail: `${channels.length}/3 configured channels.` },
    { step: "Connect YouTube", ready: ready("platforms"), detail: "Credentials are validated at publish time." },
    { step: "Connect TikTok", ready: ready("platforms"), detail: "Credentials are validated at publish time." },
    { step: "Connect Instagram", ready: ready("platforms"), detail: "Credentials are validated at publish time." },
    { step: "Add Sources", ready: sources.length > 0, detail: `${sources.length} source(s) configured.` },
    { step: "Run Test Pipeline", ready: videos.some((video) => video.storageKey), detail: "Run it from Candidates to create a reviewable preview." }
  ];

  return <section className="operations" aria-label="operations workspace">
    <nav className="section-tabs" aria-label="dashboard sections">
      {sections.map((section) => <button className={section === active ? "active" : ""} key={section} type="button" onClick={() => setActive(section)}>{section}</button>)}
    </nav>
    <div className="operations-panel">
      <p className="eyebrow">{active.toUpperCase()}</p>
      {active === "First Run" ? <div className="wizard" aria-label="first run wizard"><p className="muted">Complete the setup in order. A degraded or unvalidated integration is never shown as ready.</p>{setupItems.map((item, index) => <article className="wizard-item" key={item.step}><span className={`status-dot ${item.ready ? "ok" : "degraded"}`} aria-hidden="true" /><div><strong>{index + 1}. {item.step}</strong><small>{item.ready ? "READY" : "NOT READY"} · {item.detail}</small></div></article>)}</div> : null}
      {active === "Overview" ? <div className="overview-grid"><strong>{channels.length} channels configured</strong><span>{candidates.length} candidates · {videos.length} videos · {publications.length} publications</span><span>Manual review is required before publishing.</span><span>Pipeline order: discover → ingest → transcribe → analyze → plan → TTS → render → QC → review → publish → analytics → cleanup.</span></div> : null}
      {active === "Channels" ? <div className="stack-list">{channels.map((channel) => <div className="channel-row" key={channel.id}><span>{channel.name}</span><small>{channel.timezone} · {channel.videosPerDay}/day · {channel.status}</small></div>)}</div> : null}
      {active === "Sources" ? <><form className="inline-form" onSubmit={(event) => void createSource(event)}><input required placeholder="Source name" value={sourceName} onChange={(event) => setSourceName((event.currentTarget as unknown as { value: string }).value)} /><input required type="url" placeholder="https://example.com" value={sourceUrl} onChange={(event) => setSourceUrl((event.currentTarget as unknown as { value: string }).value)} /><select value={sourceRights} onChange={(event) => setSourceRights((event.currentTarget as unknown as { value: RightsStatus }).value)}>{rightsStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select><input placeholder="keywords, comma separated" value={sourceKeywords} onChange={(event) => setSourceKeywords((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add manual source</button></form><div className="entity-list">{sources.map((source) => <article className="entity-card" key={source.id}><strong>{source.name}</strong><small>{source.rightsStatus} · {source.enabled ? "enabled" : "disabled"} · {(source.keywords ?? []).join(", ") || "no keywords"}</small><div className="review-actions"><button type="button" onClick={() => void toggleSource(source)}>{source.enabled ? "Disable" : "Enable"}</button></div></article>)}</div></> : null}
      {active === "Candidates" ? <><form className="inline-form" onSubmit={(event) => void createCandidate(event)}><select required value={channelId} onChange={(event) => setChannelId((event.currentTarget as unknown as { value: string }).value)}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><input required placeholder="Candidate topic" value={candidateTopic} onChange={(event) => setCandidateTopic((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add candidate</button></form><div className="entity-list">{candidates.length === 0 ? <p className="muted">No candidates yet.</p> : candidates.map((candidate) => <article className="entity-card" key={candidate.id}><strong>{candidate.topic}</strong><small>{candidate.status} · score {candidate.scoreTotal}</small><div className="review-actions"><button type="button" onClick={() => void candidateAction(candidate, "analyze")}>Analyze</button><button type="button" onClick={() => void candidateAction(candidate, "plan")}>Plan</button><button type="button" onClick={() => void runPipeline(candidate)}>Run test pipeline</button></div></article>)}</div></> : null}
      {active === "Videos" ? <div className="entity-list">{videos.length === 0 ? <p className="muted">No videos yet.</p> : videos.map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{video.status} · rights {video.rightsStatus} · render v{video.renderVersion}</small><div className="review-actions"><button type="button" onClick={() => void videoAction(video, "rerender")}>Rerender</button><button type="button" onClick={() => void videoAction(video, "approve")}>Approve</button></div>{video.storageKey ? <video controls preload="metadata" width="180" src={`${apiUrl}/api/v1/media/${video.storageKey}`} /> : null}</article>)}</div> : null}
      {active === "Review Queue" ? <><p className="muted">Review cards below expose edit metadata, rerender, approve, and reject actions.</p>{preview.videoUrl ? <div className="preview"><video controls width="240" src={preview.videoUrl} />{preview.thumbnailUrl ? <img alt="Latest pipeline thumbnail" src={preview.thumbnailUrl} width="160" /> : null}</div> : null}</> : null}
      {active === "Publishing" ? <div className="entity-list">{videos.filter((video) => video.status === "APPROVED").length === 0 ? <p className="muted">Approve a video before scheduling it.</p> : videos.filter((video) => video.status === "APPROVED").map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{publications.filter((item) => item.videoId === video.id).length} publication(s)</small><div className="review-actions">{platforms.map((platform) => <button type="button" key={platform} onClick={() => void publish(video, platform)}>Schedule {platform}</button>)}</div></article>)}</div> : null}
      {active === "Analytics" ? <div className="overview-grid"><strong>{analytics.snapshotCount} snapshots · {analytics.totals.views} views · {analytics.totals.followersGained} followers</strong><span>Likes {analytics.totals.likes} · comments {analytics.totals.comments} · shares {analytics.totals.shares}</span>{Object.entries(analytics.byFormat).sort(([, left], [, right]) => right.views - left.views).slice(0, 5).map(([format, totals]) => <span key={format}>Format {format}: {totals.views} views</span>)}</div> : null}
      {active === "Costs" ? <div className="overview-grid"><strong>{costs.length} cost records · €{costs.reduce((total, cost) => total + (cost.actualCostEur ?? cost.estimatedCostEur), 0).toFixed(2)} observed</strong>{costs.slice(0, 10).map((cost) => <span key={cost.id}>{cost.service}/{cost.operation}: €{(cost.actualCostEur ?? cost.estimatedCostEur).toFixed(2)} · {cost.unit}</span>)}{costs.length === 0 ? <span className="muted">No cost records yet.</span> : null}</div> : null}
      {active === "Accounts" ? <><form className="inline-form" onSubmit={(event) => void createAccount(event)}><select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><select value={accountPlatform} onChange={(event) => setAccountPlatform(fieldValue(event) as Platform)}>{platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select><input required placeholder="External account ID" value={accountExternalId} onChange={(event) => setAccountExternalId(fieldValue(event))} /><input required placeholder="Display name" value={accountDisplayName} onChange={(event) => setAccountDisplayName(fieldValue(event))} /><button type="submit">Add account</button></form><div className="entity-list">{accounts.length === 0 ? <p className="muted">No platform accounts registered. Credentials remain runtime-only.</p> : accounts.map((account) => <article className="entity-card" key={account.id}><strong>{account.displayName}</strong><small>{account.platform} · {account.externalAccountId} · {account.status}</small></article>)}</div></> : null}
      {active === "Settings" ? <form className="overview-grid" onSubmit={(event) => void saveSettings(event)}><label>Channel<select required value={channelId} onChange={(event) => setChannelId(fieldValue(event))}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label>Daily target<input type="number" min="0" max="100" value={settingsDraft.videosPerDay} onChange={(event) => setSettingsDraft({ ...settingsDraft, videosPerDay: fieldValue(event) })} /></label><label>Min duration<input type="number" min="1" max="600" value={settingsDraft.minDuration} onChange={(event) => setSettingsDraft({ ...settingsDraft, minDuration: fieldValue(event) })} /></label><label>Max duration<input type="number" min="1" max="600" value={settingsDraft.maxDuration} onChange={(event) => setSettingsDraft({ ...settingsDraft, maxDuration: fieldValue(event) })} /></label><label>Min score<input type="number" min="0" max="100" value={settingsDraft.minScore} onChange={(event) => setSettingsDraft({ ...settingsDraft, minScore: fieldValue(event) })} /></label><label>Monthly budget EUR<input type="number" min="0" step="0.01" value={settingsDraft.monthlyBudget} onChange={(event) => setSettingsDraft({ ...settingsDraft, monthlyBudget: fieldValue(event) })} /></label><label>Publishing slots<input value={settingsDraft.publishingSlots} onChange={(event) => setSettingsDraft({ ...settingsDraft, publishingSlots: fieldValue(event) })} /></label><label>Cleanup retention days<input type="number" min="1" value={settingsDraft.cleanupRetentionDays} onChange={(event) => setSettingsDraft({ ...settingsDraft, cleanupRetentionDays: fieldValue(event) })} /></label><label>Render quality<input value={settingsDraft.renderQuality} onChange={(event) => setSettingsDraft({ ...settingsDraft, renderQuality: fieldValue(event) })} /></label><label>Concurrency<input type="number" min="1" value={settingsDraft.concurrency} onChange={(event) => setSettingsDraft({ ...settingsDraft, concurrency: fieldValue(event) })} /></label><label><input type="checkbox" checked={settingsDraft.reviewRequired} onChange={(event) => setSettingsDraft({ ...settingsDraft, reviewRequired: fieldChecked(event) })} /> Review required</label><button type="submit">Save channel settings</button><p className="muted">Providers, global kill switches and runtime credentials are shown by readiness and remain controlled by server configuration. Kill switches can be changed through the admin-only settings API.</p></form> : null}
      {active === "System Health" ? <p className="muted">Open <code>/ready</code> for Postgres, Redis, storage, FFmpeg, provider, and worker dependency status.</p> : null}
      {message ? <p className="review-message" role="status">{message}</p> : null}
    </div>
  </section>;
}

function fieldValue(event: { currentTarget: unknown }): string { return (event.currentTarget as { value: string }).value; }
function fieldChecked(event: { currentTarget: unknown }): boolean { return (event.currentTarget as { checked: boolean }).checked; }

function draftForChannel(channel: Channel | undefined): SettingsDraft {
  const settings = channel?.settings ?? {};
  return { videosPerDay: String(channel?.videosPerDay ?? 6), minDuration: String(channel?.minDuration ?? 18), maxDuration: String(channel?.maxDuration ?? 45), minScore: typeof settings.minScore === "number" ? String(settings.minScore) : "0", monthlyBudget: String(channel?.monthlyBudget ?? 0), publishingSlots: (channel?.publishingSlots ?? []).join(", "), reviewRequired: channel?.manualReviewRequired ?? true, cleanupRetentionDays: typeof settings.cleanupRetentionDays === "number" ? String(settings.cleanupRetentionDays) : "30", renderQuality: typeof settings.renderQuality === "string" ? settings.renderQuality : "1080x1920-h264", concurrency: typeof settings.concurrency === "number" ? String(settings.concurrency) : "1" };
}
