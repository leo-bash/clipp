# Publishing boundary

`PlatformPublisher` is the only publishing contract. It contains account validation, cost estimation, publish, status and analytics methods. The current phase uses `YouTubeMockPublisher`, `TikTokMockPublisher` and `InstagramMockPublisher`; each returns a fake URL and can be configured to fail independently for tests.

`PublishingScheduler` accepts only `APPROVED` and non-`BLOCKED` videos. It calculates the next configured `publishingSlots` in the channel timezone when a schedule is not supplied and acquires a lock keyed by video ID. It publishes to all configured platforms independently and returns `SUCCESS` only when every publication succeeds; otherwise it returns `PARTIAL_FAILURE` with each platform result intact.

The publisher worker and Compose service are ready for queue integration. Official YouTube, TikTok and Meta adapters remain separate phases and will never use browser-login workarounds.

## YouTube

`YouTubePublisher` uses OAuth authorization-code exchange and refresh tokens, validates the account through `channels.list`, and uploads through the official resumable `videos.insert` flow. The media path must be absolute and is read only by the adapter for transfer. The safe default privacy is `private`; future scheduling sends `publishAt` only with private visibility. Status and basic statistics use official `videos.list` endpoints. Missing credentials or upload errors return a failed publication result and do not trigger browser automation or public-by-default behavior.

## TikTok

`TikTokPublisher` uses the official OAuth token endpoints and Content Posting API. `DIRECT_POST` initializes `/v2/post/publish/video/init/` with `video.publish`, while `UPLOAD_DRAFT` initializes `/v2/post/publish/inbox/video/init/` with `video.upload`; both use `FILE_UPLOAD` with chunked `Content-Range` transfer. Direct Post defaults to `SELF_ONLY`. Status uses `/v2/post/publish/status/fetch/`. If Direct Post is configured but the API reports `scope_not_authorized`, the explicit `fallbackToDraft` option may switch to Upload-to-Draft; no browser or login simulation is attempted.
