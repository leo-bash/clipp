import type { Channel } from "@shortfactory/shared";

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

export default async function Home(): Promise<React.JSX.Element> {
  const channels = await getChannels();

  return (
    <main className="shell">
      <p className="eyebrow">SHORTFACTORY / FOUNDATION</p>
      <h1>Content operations, ready to scale.</h1>
      <p className="lede">Phase 1 is online. Domain workflows and review queues arrive in the next milestones.</p>
      <section className="status-grid" aria-label="foundation services">
        {services.map((service) => (
          <div className="status-card" key={service}>
            <span className="status-dot" aria-hidden="true" />
            <span>{service}</span>
            <small>{service === "FFmpeg" ? "local capability" : "foundation ready"}</small>
          </div>
        ))}
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
    </main>
  );
}
