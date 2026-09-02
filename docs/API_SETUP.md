# API setup

The API listens on port 4000 by default. `GET /health` is a liveness check and `GET /ready` reports dependency readiness plus whether local memory/mock adapters are active.
