"use client";

import { useState } from "react";
import type { Channel } from "@shortfactory/shared";

interface OperationsPanelProps { channels: Channel[]; }
const sections = ["Overview", "Channels", "Candidates", "Videos", "Review Queue", "Publishing", "Analytics", "Costs", "Sources", "Accounts", "Settings", "System Health"] as const;

export default function OperationsPanel({ channels }: OperationsPanelProps): React.JSX.Element {
  const [active, setActive] = useState<(typeof sections)[number]>("Overview");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [candidateTopic, setCandidateTopic] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  async function createSource(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await request("/api/v1/sources", { name: sourceName, type: "MANUAL", url: sourceUrl, rightsStatus: "UNKNOWN", enabled: true, keywords: [] });
  }

  async function createCandidate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await request("/api/v1/candidates", { channelId, topic: candidateTopic });
  }

  async function request(path: string, payload: unknown): Promise<void> {
    setMessage("");
    try {
      const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      setMessage(response.ok ? "Saved. The next pipeline worker can continue this item." : `Action failed (${response.status})`);
    } catch { setMessage("API unavailable. Start the API service and try again."); }
  }

  return <section className="operations" aria-label="operations workspace">
    <nav className="section-tabs" aria-label="dashboard sections">
      {sections.map((section) => <button className={section === active ? "active" : ""} key={section} type="button" onClick={() => setActive(section)}>{section}</button>)}
    </nav>
    <div className="operations-panel">
      <p className="eyebrow">{active.toUpperCase()}</p>
      {active === "Overview" ? <div className="overview-grid"><strong>{channels.length} channels configured</strong><span>Manual review is required before publishing.</span><span>Pipeline order: discover → ingest → transcribe → analyze → plan → TTS → render → QC → review → publish → analytics → cleanup.</span></div> : null}
      {active === "Channels" ? <div className="stack-list">{channels.map((channel) => <div className="channel-row" key={channel.id}><span>{channel.name}</span><small>{channel.timezone} · {channel.videosPerDay}/day · {channel.status}</small></div>)}</div> : null}
      {active === "Sources" ? <form className="inline-form" onSubmit={(event) => void createSource(event)}><input required placeholder="Source name" value={sourceName} onChange={(event) => setSourceName((event.currentTarget as unknown as { value: string }).value)} /><input required type="url" placeholder="https://example.com" value={sourceUrl} onChange={(event) => setSourceUrl((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add manual source</button></form> : null}
      {active === "Candidates" ? <form className="inline-form" onSubmit={(event) => void createCandidate(event)}><select required value={channelId} onChange={(event) => setChannelId((event.currentTarget as unknown as { value: string }).value)}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><input required placeholder="Candidate topic" value={candidateTopic} onChange={(event) => setCandidateTopic((event.currentTarget as unknown as { value: string }).value)} /><button type="submit">Add candidate</button></form> : null}
      {active === "Videos" ? <p className="muted">Create a video from a selected candidate through the API, then use Review Queue for rerender and approval.</p> : null}
      {active === "Review Queue" ? <p className="muted">Review cards below expose edit metadata, rerender, approve, and reject actions.</p> : null}
      {active === "Publishing" ? <p className="muted">Publishing is disabled until a platform account is configured. YouTube is the first real adapter; TikTok and Instagram remain explicit mock/configuration states.</p> : null}
      {active === "Analytics" ? <p className="muted">Analytics snapshots are collected per publication and exposed through the overview and publication APIs.</p> : null}
      {active === "Costs" ? <p className="muted">Reservations, hard stops, forecasts, and cost records are available under the cost-control and costs APIs.</p> : null}
      {active === "Accounts" ? <p className="muted">Credentials are runtime-only and never rendered in the dashboard. Connect accounts through the configured OAuth boundary.</p> : null}
      {active === "Settings" ? <p className="muted">Global kill switches: STOP_ALL_PUBLISHING, STOP_RENDERING, STOP_PAID_APIS. Changes require an environment/runtime configuration update.</p> : null}
      {active === "System Health" ? <p className="muted">Open <code>/ready</code> for Postgres, Redis, storage, FFmpeg, provider, and worker dependency status.</p> : null}
      {message ? <p className="review-message" role="status">{message}</p> : null}
    </div>
  </section>;
}
