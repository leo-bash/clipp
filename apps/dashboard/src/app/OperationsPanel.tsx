"use client";

import { useEffect, useState } from "react";
import type { Candidate, Channel, Platform, Publication, Video } from "@shortfactory/shared";

interface OperationsPanelProps { channels: Channel[]; }
const sections = ["Overview", "Channels", "Candidates", "Videos", "Review Queue", "Publishing", "Analytics", "Costs", "Sources", "Accounts", "Settings", "System Health"] as const;
const platforms: Platform[] = ["YOUTUBE", "TIKTOK", "INSTAGRAM"];

export default function OperationsPanel({ channels }: OperationsPanelProps): React.JSX.Element {
  const [active, setActive] = useState<(typeof sections)[number]>("Overview");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [candidateTopic, setCandidateTopic] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [preview, setPreview] = useState<{ videoUrl?: string; thumbnailUrl?: string }>({});
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  useEffect(() => {
    void Promise.all([load<Candidate>("/api/v1/candidates"), load<Video>("/api/v1/videos"), load<Publication>("/api/v1/publications")]).then(([candidatePage, videoPage, publicationPage]) => {
      setCandidates(candidatePage.items);
      setVideos(videoPage.items);
      setPublications(publicationPage.items);
    }).catch(() => setMessage("API unavailable. Start the API service and try again."));
  }, []);

  async function load<T>(path: string): Promise<{ items: T[] }> {
    const response = await fetch(`${apiUrl}${path}?page=1&pageSize=100`);
    if (!response.ok) throw new Error(`GET ${path} failed`);
    return await response.json() as { items: T[] };
  }

  async function createSource(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await request("/api/v1/sources", { name: sourceName, type: "MANUAL", url: sourceUrl, rightsStatus: "UNKNOWN", enabled: true, keywords: [] });
  }

  async function createCandidate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const created = await request<Candidate>("/api/v1/candidates", { channelId, topic: candidateTopic });
    if (created) { setCandidates((items) => [created, ...items]); setCandidateTopic(""); }
  }

  async function request<T = unknown>(path: string, payload: unknown): Promise<T | undefined> {
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { setMessage(`Action failed (${response.status})`); return undefined; }
      setMessage("Action completed.");
      return await response.json() as T;
    } catch { setMessage("API unavailable. Start the API service and try again."); return undefined; }
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

  return <section className="operations" aria-label="operations workspace">
    <nav className="section-tabs" aria-label="dashboard sections">
      {sections.map((section) => <button className={section === active ? "active" : ""} key={section} type="button" onClick={() => setActive(section)}>{section}</button>)}
    </nav>
    <div className="operations-panel">
      <p className="eyebrow">{active.toUpperCase()}</p>
      {active === "Overview" ? <div className="overview-grid"><strong>{channels.length} channels configured</strong><span>{candidates.length} candidates · {videos.length} videos · {publications.length} publications</span><span>Manual review is required before publishing.</span><span>Pipeline order: discover → ingest → transcribe → analyze → plan → TTS → render → QC → review → publish → analytics → cleanup.</span></div> : null}
      {active === "Channels" ? <div className="stack-list">{channels.map((channel) => <div className="channel-row" key={channel.id}><span>{channel.name}</span><small>{channel.timezone} · {channel.videosPerDay}/day · {channel.status}</small></div>)}</div> : null}
      {active === "Sources" ? <form className="inline-form" onSubmit={(event) => void createSource(event)}><input required placeholder="Source name" value={sourceName} onChange={(event) => setSourceName((event.currentTarget as unknown as { value: string }).value)} /><input required type="url" placeholder="https://example.com" value={sourceUrl} onChange={(event) => setSourceUrl((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add manual source</button></form> : null}
      {active === "Candidates" ? <><form className="inline-form" onSubmit={(event) => void createCandidate(event)}><select required value={channelId} onChange={(event) => setChannelId((event.currentTarget as unknown as { value: string }).value)}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><input required placeholder="Candidate topic" value={candidateTopic} onChange={(event) => setCandidateTopic((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add candidate</button></form><div className="entity-list">{candidates.length === 0 ? <p className="muted">No candidates yet.</p> : candidates.map((candidate) => <article className="entity-card" key={candidate.id}><strong>{candidate.topic}</strong><small>{candidate.status} · score {candidate.scoreTotal}</small><div className="review-actions"><button type="button" onClick={() => void candidateAction(candidate, "analyze")}>Analyze</button><button type="button" onClick={() => void candidateAction(candidate, "plan")}>Plan</button><button type="button" onClick={() => void runPipeline(candidate)}>Run test pipeline</button></div></article>)}</div></> : null}
      {active === "Videos" ? <div className="entity-list">{videos.length === 0 ? <p className="muted">No videos yet.</p> : videos.map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{video.status} · rights {video.rightsStatus} · render v{video.renderVersion}</small><div className="review-actions"><button type="button" onClick={() => void videoAction(video, "rerender")}>Rerender</button><button type="button" onClick={() => void videoAction(video, "approve")}>Approve</button></div>{video.storageKey ? <video controls preload="metadata" width="180" src={`${apiUrl}/api/v1/media/${video.storageKey}`} /> : null}</article>)}</div> : null}
      {active === "Review Queue" ? <><p className="muted">Review cards below expose edit metadata, rerender, approve, and reject actions.</p>{preview.videoUrl ? <div className="preview"><video controls width="240" src={preview.videoUrl} />{preview.thumbnailUrl ? <img alt="Latest pipeline thumbnail" src={preview.thumbnailUrl} width="160" /> : null}</div> : null}</> : null}
      {active === "Publishing" ? <div className="entity-list">{videos.filter((video) => video.status === "APPROVED").length === 0 ? <p className="muted">Approve a video before scheduling it.</p> : videos.filter((video) => video.status === "APPROVED").map((video) => <article className="entity-card" key={video.id}><strong>{String(video.metadata?.title ?? video.id.slice(0, 8))}</strong><small>{publications.filter((item) => item.videoId === video.id).length} publication(s)</small><div className="review-actions">{platforms.map((platform) => <button type="button" key={platform} onClick={() => void publish(video, platform)}>Schedule {platform}</button>)}</div></article>)}</div> : null}
      {active === "Analytics" ? <p className="muted">Analytics snapshots are collected per publication and exposed through the overview and publication APIs.</p> : null}
      {active === "Costs" ? <p className="muted">Reservations, hard stops, forecasts, and cost records are available under the cost-control and costs APIs.</p> : null}
      {active === "Accounts" ? <p className="muted">Credentials are runtime-only and never rendered in the dashboard. Connect accounts through the configured OAuth boundary.</p> : null}
      {active === "Settings" ? <p className="muted">Global kill switches: STOP_ALL_PUBLISHING, STOP_RENDERING, STOP_PAID_APIS. Changes require an environment/runtime configuration update.</p> : null}
      {active === "System Health" ? <p className="muted">Open <code>/ready</code> for Postgres, Redis, storage, FFmpeg, provider, and worker dependency status.</p> : null}
      {message ? <p className="review-message" role="status">{message}</p> : null}
    </div>
  </section>;
}
