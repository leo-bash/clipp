import type { Channel } from "@shortfactory/shared";
import type { Video } from "@shortfactory/shared";
import ReviewQueue from "./ReviewQueue";

export const dynamic = "force-dynamic";

const services = ["API", "Postgres", "Redis", "FFmpeg"];

async function getChannels(): Promise<Channel[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/api/v1/channels?page=1&pageSize=20`);
    if (!response.ok) return [];
    const payload = await response.json() as { items?: Channel[] };
    return payload.items ?? [];
  } catch {
    return [];
  }
}

async function getVideos(): Promise<Video[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/api/v1/videos?page=1&pageSize=20`);
    if (!response.ok) return [];
    const payload = await response.json() as { items?: Video[] };
    return payload.items ?? [];
  } catch { return []; }
}

async function getAnalytics(): Promise<{ snapshotCount: number; totals: { views: number; likes: number; comments: number; shares: number } }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${apiUrl}/api/v1/analytics/overview`);
    if (!response.ok) return { snapshotCount: 0, totals: { views: 0, likes: 0, comments: 0, shares: 0 } };
    return await response.json() as { snapshotCount: number; totals: { views: number; likes: number; comments: number; shares: number } };
  } catch { return { snapshotCount: 0, totals: { views: 0, likes: 0, comments: 0, shares: 0 } }; }
}

export default async function Home(): Promise<React.JSX.Element> {
  const channels = await getChannels();
  const videos = await getVideos();
  const analytics = await getAnalytics();

  return (
    <main className="shell">
      <p className="eyebrow">SHORTFACTORY / OPERATIONS</p>
      <h1>Content operations, ready to scale.</h1>
      <p className="lede">A rights-aware production line from candidate to reviewed short-form video.</p>
      <section className="status-grid" aria-label="foundation services">
        {services.map((service) => (
          <div className="status-card" key={service}>
            <span className="status-dot" aria-hidden="true" />
            <span>{service}</span>
            <small>{service === "FFmpeg" ? "local capability" : "foundation ready"}</small>
          </div>
        ))}
      </section>
      <section className="analytics-strip" aria-label="analytics overview">
        <div><small>SNAPSHOTS</small><strong>{analytics.snapshotCount}</strong></div>
        <div><small>VIEWS</small><strong>{analytics.totals.views}</strong></div>
        <div><small>LIKES</small><strong>{analytics.totals.likes}</strong></div>
        <div><small>SHARES</small><strong>{analytics.totals.shares}</strong></div>
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
      <aside className="rights-note" aria-label="rights safety notice">
        <strong>Rights safety active</strong>
        <span>Blocked assets cannot render; unknown and commentary assets require manual review.</span>
      </aside>
      <ReviewQueue initialVideos={videos} />
    </main>
  );
}
