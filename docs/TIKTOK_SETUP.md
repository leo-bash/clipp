# TikTok setup

The official TikTok adapter uses OAuth and the Content Posting API. Set `TIKTOK_MODE=UPLOAD_DRAFT` for the safest initial operation; `DIRECT_POST` uses the configured fallback to draft when scope authorization is rejected. Missing credentials select the mock publisher. No browser-upload workaround is permitted.
