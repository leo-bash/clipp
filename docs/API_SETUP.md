# API setup and access control

The API listens on port 4000 by default. `GET /health` is a liveness check and `GET /ready` reports dependency readiness plus whether local memory/mock adapters are active.

Local development can keep `AUTH_MODE=disabled` for deterministic tests, but the operator dashboard should use `AUTH_MODE=password`. Generate a scrypt password hash with `pnpm auth:hash`, put the returned value in `AUTH_PASSWORD_HASH`, and restart the API. The server never stores or logs the plaintext password. `AUTH_SESSION_TTL_SECONDS` controls the in-memory session lifetime and `AUTH_COOKIE_SECURE=true` should be enabled when the API is served only over HTTPS.

For service-to-service deployments, `AUTH_MODE=api-key` remains available with distinct runtime-only values for `ADMIN_API_KEY`, `EDITOR_API_KEY` and `VIEWER_API_KEY`. Readiness reports the configured access boundary without returning secrets.

In password mode, the dashboard sends the HttpOnly session cookie automatically; the dashboard is not rendered until `/api/v1/auth/session` confirms an active session. `POST /api/v1/auth/logout` revokes the session immediately. Health, readiness and metrics endpoints remain public for probes, as do the OAuth callback endpoints. All other API resources require a valid session. Login successes, failed logins, logouts and denied requests are written as JSON lines to `AUTH_AUDIT_LOG_PATH` and to the structured server log without recording passwords or session tokens.

In API-key mode, send the selected key in the `x-api-key` header. Resource reads require any configured role, while mutations require ADMIN or EDITOR; do not expose keys to browser bundles.

Operational resources are available under `/api/v1`: `platform-accounts`, `source-assets`, `transcripts`, `content-plans` and `jobs-audit`, each with paginated GET collection endpoints and validated POST creation (platform accounts also support PATCH status updates). Credentials are represented only by a runtime `credentialsReference`; access tokens are never accepted as persisted domain fields. `GET/PATCH /api/v1/settings/controls` exposes the three operational kill switches; PATCH requires the admin API key when `AUTH_MODE=api-key` and is intentionally process-scoped so a restart returns control to the runtime `.env` defaults.
