# Publishing boundary

`PlatformPublisher` is the only publishing contract. It contains account validation, cost estimation, publish, status and analytics methods. The current phase uses `YouTubeMockPublisher`, `TikTokMockPublisher` and `InstagramMockPublisher`; each returns a fake URL and can be configured to fail independently for tests.

`PublishingScheduler` accepts only `APPROVED` and non-`BLOCKED` videos. It calculates the next configured `publishingSlots` in the channel timezone when a schedule is not supplied and acquires a lock keyed by video ID. It publishes to all configured platforms independently and returns `SUCCESS` only when every publication succeeds; otherwise it returns `PARTIAL_FAILURE` with each platform result intact.

The publisher worker and Compose service are ready for queue integration. Official YouTube, TikTok and Meta adapters remain separate phases and will never use browser-login workarounds.

## YouTube

`YouTubePublisher` uses OAuth authorization-code exchange and refresh tokens, validates the account through `channels.list`, and uploads through the official resumable `videos.insert` flow. The media path must be absolute and is read only by the adapter for transfer. The safe default privacy is `private`; future scheduling sends `publishAt` only with private visibility. Status and basic statistics use official `videos.list` endpoints. Missing credentials or upload errors return a failed publication result and do not trigger browser automation or public-by-default behavior.
