"use client";

import { useEffect, useState } from "react";
import type { Channel, DependencyHealth } from "@shortfactory/shared";
import type { Cost, Publication, Video } from "@shortfactory/shared";
import ReviewQueue from "./ReviewQueue";
import OperationsPanel from "./OperationsPanel";
import AuthGate from "./AuthGate";

const services = ["API", "Postgres", "Redis", "Storage", "FFmpeg", "Workers", "LLM", "TTS", "YouTube", "TikTok", "Instagram"] as const;
type AnalyticsDimensionTotals = { views: number; likes: number; comments: number; shares: number; followersGained: number };

type AnalyticsOverview = { snapshotCount: number; totals: AnalyticsDimensionTotals; byChannel: Record<string, AnalyticsDimensionTotals>; byFormat: Record<string, AnalyticsDimensionTotals> };
const emptyAnalytics = (): AnalyticsOverview => ({ snapshotCount: 0, totals: { views: 0, likes: 0, comments: 0, shares: 0, followersGained: 0 }, byChannel: {}, byFormat: {} });

export default function Home(): React.JSX.Element {
  return <AuthGate><AuthenticatedDashboard /></AuthGate>;
}

function AuthenticatedDashboard(): React.JSX.Element {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsOverview>(emptyAnalytics());
  const [health, setHealth] = useState<DependencyHealth[]>([]);

  useEffect(() => {
    const getItems = async <T,>(path: string): Promise<T[]> => {
      const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
      if (!response.ok) return [];
      const payload = await response.json() as { items?: T[] };
      return payload.items ?? [];
    };
    void Promise.all([
      getItems<Channel>("/api/v1/channels?page=1&pageSize=20"),
      getItems<Video>("/api/v1/videos?page=1&pageSize=20"),
      getItems<Publication>("/api/v1/publications?page=1&pageSize=100"),
      getItems<Cost>("/api/v1/costs?page=1&pageSize=100"),
      fetch(`${apiUrl}/api/v1/analytics/overview`, { credentials: "include" }).then(async (response) => response.ok ? await response.json() as AnalyticsOverview : emptyAnalytics()),
      fetch(`${apiUrl}/ready`, { credentials: "include" }).then(async (response) => { const payload = await response.json() as { dependencies?: DependencyHealth[] }; return payload.dependencies ?? []; }).catch(() => [])
    ]).then(([channelItems, videoItems, publicationItems, costItems, analyticsOverview, dependencies]) => {
      setChannels(channelItems); setVideos(videoItems); setPublications(publicationItems); setCosts(costItems); setAnalytics(analyticsOverview); setHealth(dependencies);
    });
  }, [apiUrl]);

  const statusFor = (service: string): DependencyHealth => health.find((item) => item.name.toLowerCase() === service.toLowerCase()) ?? { name: service.toLowerCase(), status: "down", mode: "mock", detail: "not reported by readiness endpoint" };
  const count = (status: Video["status"]): number => videos.filter((video) => video.status === status).length;
  const spend = costs.reduce((total, cost) => total + (cost.actualCostEur ?? cost.estimatedCostEur), 0);
  const topDimension = (dimensions: Record<string, AnalyticsDimensionTotals>): [string, AnalyticsDimensionTotals] | undefined => Object.entries(dimensions).sort(([, left], [, right]) => right.views - left.views)[0];
  const topChannel = topDimension(analytics.byChannel);
  const topFormat = topDimension(analytics.byFormat);
  const topChannelName = topChannel ? channels.find((channel) => channel.id === topChannel[0])?.name ?? topChannel[0] : "—";

  return (
    <main className="shell">
      <p className="eyebrow">SHORTFACTORY / OPERATIONS</p>
      <h1>Content operations, ready to scale.</h1>
      <p className="lede">A rights-aware production line from candidate to reviewed short-form video.</p>
      <section className="status-grid" aria-label="foundation services">
        {services.map((service) => { const dependency = statusFor(service); return (
          <div className="status-card" key={service}>
            <span className={`status-dot ${dependency.status}`} aria-hidden="true" />
            <span>{service}</span>
            <small>{dependency.status.toUpperCase()} · {dependency.detail ?? dependency.mode}</small>
          </div>
        ); })}
      </section>
      <section className="analytics-strip" aria-label="analytics overview">
        <div><small>SNAPSHOTS</small><strong>{analytics.snapshotCount}</strong></div>
        <div><small>VIEWS</small><strong>{analytics.totals.views}</strong></div>
        <div><small>LIKES</small><strong>{analytics.totals.likes}</strong></div>
        <div><small>SHARES</small><strong>{analytics.totals.shares}</strong></div>
        <div><small>FOLLOWERS</small><strong>{analytics.totals.followersGained}</strong></div>
      </section>
      <section className="analytics-strip" aria-label="successful dimensions">
        <div><small>TOP CHANNEL</small><strong>{topChannelName}</strong><span>{topChannel ? `${topChannel[1].views} views` : "No analytics yet"}</span></div>
        <div><small>TOP FORMAT</small><strong>{topFormat?.[0] ?? "—"}</strong><span>{topFormat ? `${topFormat[1].views} views` : "No experiment data yet"}</span></div>
      </section>
      <section className="kpi-section" aria-label="today production status">
        <p className="eyebrow">TODAY</p>
        <div className="kpi-grid"><div><small>PLANNED</small><strong>{count("PLANNED")}</strong></div><div><small>RENDERED</small><strong>{count("RENDERED") + count("READY_FOR_REVIEW")}</strong></div><div><small>WAITING REVIEW</small><strong>{count("READY_FOR_REVIEW")}</strong></div><div><small>APPROVED</small><strong>{count("APPROVED")}</strong></div><div><small>PUBLISHED</small><strong>{count("PUBLISHED")}</strong></div><div><small>FAILED</small><strong>{count("FAILED") + count("QC_FAILED")}</strong></div></div>
      </section>
      <section className="kpi-section" aria-label="monthly production status">
        <p className="eyebrow">MONTHLY</p>
        <div className="kpi-grid"><div><small>VIDEOS PRODUCED</small><strong>{videos.length}</strong></div><div><small>PUBLICATIONS</small><strong>{publications.length}</strong></div><div><small>YOUTUBE</small><strong>{publications.filter((publication) => publication.platform === "YOUTUBE").length}</strong></div><div><small>TIKTOK</small><strong>{publications.filter((publication) => publication.platform === "TIKTOK").length}</strong></div><div><small>INSTAGRAM</small><strong>{publications.filter((publication) => publication.platform === "INSTAGRAM").length}</strong></div><div><small>SPEND EUR</small><strong>{spend.toFixed(2)}</strong></div><div><small>COST / VIDEO</small><strong>{videos.length > 0 ? (spend / videos.length).toFixed(2) : "0.00"}</strong></div></div>
      </section>
      <section className="channels" aria-label="configured channels">
        <div>
          <p className="eyebrow">CHANNELS</p>
          <h2>Configured editorial lanes</h2>
        </div>
        {channels.length === 0 ? <p className="muted">No channels available. Start the API and seed the database.</p> : (
          <div className="channel-list">
            {channels.map((channel) => <div className="channel-row" key={channel.id}><span>{channel.name}</span><small>{channel.type} · {channel.videosPerDay}/day</small></div>)}
          </div>
        )}
      </section>
      <OperationsPanel channels={channels} health={health} />
      <aside className="rights-note" aria-label="rights safety notice">
        <strong>Rights safety active</strong>
        <span>Blocked assets cannot render; unknown and commentary assets require manual review.</span>
      </aside>
      <ReviewQueue initialVideos={videos} />
    </main>
  );
}
