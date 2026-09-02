# Analytics

`AnalyticsCollector` calls each publication's platform adapter independently and saves a timestamped snapshot with views, likes, comments, shares, optional watch time and followers gained. A failure on one platform becomes a `PARTIAL_FAILURE` result without discarding successful snapshots.

Snapshots use the existing `analytics_snapshots` PostgreSQL table through `PostgresAnalyticsSnapshotStore`; the in-memory store keeps local development deterministic. The API exposes `/api/v1/analytics/overview` and `/api/v1/analytics/publications/:id`, while the dashboard renders the overview counters.

`computePerformanceScore` is deliberately simple and normalized. It combines log-scaled 24-hour views with engagement, completion, follower conversion, recency, relevance, novelty and historical-format signals using configurable weights. `BLOCKED` rights always produce score zero; no performance signal can override the rights gate.
