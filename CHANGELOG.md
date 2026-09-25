# Changelog

All notable changes to 10Router will be documented in this file.

## [0.1.0] — 2026-09-25

Initial public release. Local AI routing gateway + Next.js dashboard.

### Added

- One OpenAI-compatible endpoint (`/v1/*`): chat, messages, responses,
  models, embeddings, images, audio, videos, search.
- Routing across 28 upstream providers with format translation
  (OpenAI pivot, direct routes for fragile pairs).
- Model-combo and multi-account fallback (subscription → cheap → free).
- OAuth + API-key connection management with auto token refresh.
- RTK token saver (`tool_result` compression, fail-open).
- Usage/cost tracking, request logging, optional cloud sync.
- Dashboard (`/dashboard`) + `10router` CLI
  (`start`, `stop`, `status`, `logs`, `open`, `doctor`).
- SQLite persistence (`DATA_DIR/db/data.sqlite`) with legacy JSON import.
- Docker image + npm package (`@amir83nasr/10router`) distribution.
- CI: Prettier check on changed files + no-regression test gate
  (`pnpm test`).
