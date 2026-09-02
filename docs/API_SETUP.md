# API setup and access control

The API listens on port 4000 by default. `GET /health` is a liveness check and `GET /ready` reports dependency readiness plus whether local memory/mock adapters are active.

Local development keeps `AUTH_MODE=disabled` so the deterministic dashboard and tests can run without credentials. For a deployed API, set `AUTH_MODE=api-key` and provide distinct runtime-only values for `ADMIN_API_KEY`, `EDITOR_API_KEY` and `VIEWER_API_KEY`. Readiness reports the admin setup step as ready only when `AUTH_MODE=api-key` and `ADMIN_API_KEY` are both configured; the key is never returned.

Send the selected key in the `x-api-key` header. Health, readiness and metrics endpoints remain public for probes; resource reads require any configured role, while mutations require ADMIN or EDITOR. The API does not use cookie authentication, so the API-key header boundary avoids cookie-based CSRF; do not expose keys to browser bundles.

Operational resources are available under `/api/v1`: `platform-accounts`, `source-assets`, `transcripts`, `content-plans` and `jobs-audit`, each with paginated GET collection endpoints and validated POST creation (platform accounts also support PATCH status updates). Credentials are represented only by a runtime `credentialsReference`; access tokens are never accepted as persisted domain fields. `GET/PATCH /api/v1/settings/controls` exposes the three operational kill switches; PATCH requires the admin API key when `AUTH_MODE=api-key` and is intentionally process-scoped so a restart returns control to the runtime `.env` defaults.
