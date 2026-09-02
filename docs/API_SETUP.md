# API setup and access control

The API listens on port 4000 by default. `GET /health` is a liveness check and `GET /ready` reports dependency readiness plus whether local memory/mock adapters are active.

Local development keeps `AUTH_MODE=disabled` so the deterministic dashboard and tests can run without credentials. For a deployed API, set `AUTH_MODE=api-key` and provide distinct runtime-only values for `ADMIN_API_KEY`, `EDITOR_API_KEY` and `VIEWER_API_KEY`.

Send the selected key in the `x-api-key` header. Health, readiness and metrics endpoints remain public for probes; resource reads require any configured role, while mutations require ADMIN or EDITOR. The API does not use cookie authentication, so the API-key header boundary avoids cookie-based CSRF; do not expose keys to browser bundles.
