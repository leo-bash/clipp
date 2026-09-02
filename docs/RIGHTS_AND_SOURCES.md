# Rights and sources

Rights safety is a required Phase 4 gate. External assets must carry an explicit rights status; `BLOCKED` must never be processed and `UNKNOWN` must never be auto-published.

`@shortfactory/rights` centralizes `ALLOW`, `MANUAL_REVIEW` and `BLOCK` decisions. The API rejects blocked videos before creation/rendering and rejects publication scheduling unless the asset/channel can auto-publish under policy. No crop, subtitle or duration rule is treated as a legal safe harbor.
