"use client";

import { useState } from "react";
import type { ChangeEvent } from "react";
import type { Video } from "@shortfactory/shared";

interface ReviewQueueProps { initialVideos: Video[]; }

export default function ReviewQueue({ initialVideos }: ReviewQueueProps): React.JSX.Element {
  const [videos, setVideos] = useState(initialVideos);
  const [message, setMessage] = useState("");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  async function action(id: string, path: string, method = "POST", body?: unknown): Promise<void> {
    setMessage("");
    const response = await fetch(`${apiUrl}/api/v1/videos/${id}${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) { setMessage(`Action failed (${response.status})`); return; }
    const updated = await response.json() as Video;
    setVideos((items) => items.map((item) => item.id === updated.id ? updated : item));
    setMessage("Review item updated");
  }

  return (
    <section className="review" aria-label="video review queue">
      <div>
        <p className="eyebrow">REVIEW QUEUE</p>
        <h2>Approve the next cut</h2>
      </div>
      {message ? <p className="review-message" role="status">{message}</p> : null}
      {videos.length === 0 ? <p className="muted">No videos waiting for review yet. Rendered videos will appear here.</p> : (
        <div className="review-list">
          {videos.map((video) => <ReviewCard key={video.id} video={video} onAction={action} />)}
        </div>
      )}
    </section>
  );
}

function ReviewCard({ video, onAction }: { video: Video; onAction: (id: string, path: string, method?: string, body?: unknown) => Promise<void> }): React.JSX.Element {
  const [metadataText, setMetadataText] = useState(JSON.stringify(video.metadata ?? {}, null, 2));
  const [error, setError] = useState("");

  async function saveMetadata(): Promise<void> {
    try {
      const metadata = JSON.parse(metadataText) as unknown;
      if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) throw new Error("metadata must be a JSON object");
      setError("");
      await onAction(video.id, "", "PATCH", { metadata });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "invalid metadata"); }
  }

  return (
    <article className="review-card">
      <div className="review-card-header"><strong>{video.id.slice(0, 8)}</strong><span className="status-pill">{video.status}</span></div>
      <p className="muted">Rights: {video.rightsStatus} · render v{video.renderVersion}</p>
      <textarea aria-label="video metadata JSON" value={metadataText} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMetadataText((event.currentTarget as unknown as { value: string }).value)} rows={4} />
      {error ? <small className="error-text">{error}</small> : null}
      <div className="review-actions">
        <button type="button" onClick={() => void saveMetadata()}>Save metadata</button>
        <button type="button" onClick={() => void onAction(video.id, "/rerender")}>Rerender</button>
        <button type="button" onClick={() => void onAction(video.id, "/approve")}>Approve</button>
        <button type="button" className="danger" onClick={() => void onAction(video.id, "/reject")}>Reject</button>
      </div>
    </article>
  );
}
