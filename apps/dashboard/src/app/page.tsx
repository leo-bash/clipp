const services = ["API", "Postgres", "Redis", "FFmpeg"];

export default function Home(): React.JSX.Element {
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
    </main>
  );
}
