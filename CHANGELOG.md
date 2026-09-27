# Changelog

All notable changes to 10Router will be documented in this file.

## [0.1.1] — 2026-09-27

- CLI: colored output (NO_COLOR-aware), npm update-check notice (fail-open, cached), npm installs always run prod, `logs` follows, `doctor` removed.
- `pnpm dev [cmd]` delegates to real CLI with isolated `~/.10router-dev`; new `pnpm dev:update` and `pnpm pkg:test`; prod default port 20128.
- `custom-server.js`: dropped dead background-refresh import; bootstrap owns scheduler, no src/ coupling.
- Logging: ANSI-colored SSE log lines; dashboard strips ANSI on ingest; console-log viewer gains per-level badge colors and warn rows.
- Proxy-pool test route uses native `fetch` instead of undici.
- `cn()` via `cn` package; pruned `clsx`, `tailwind-merge`, `prop-types`, single Radix packages; pnpm 12.6.0.
- Config: fixed `distDir` to `.next`, trimmed tsconfig includes, cleaned dev `.env.example` / `.gitignore` docs.
- Tests: new `cli-update-check` and `colored-log-lines` unit tests.

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
  (`start`, `stop`, `status`, `logs`, `open`).
- SQLite persistence (`DATA_DIR/db/data.sqlite`) with legacy JSON import.
- Docker image + npm package (`@amir83nasr/10router`) distribution.
- CI: Prettier check on changed files + no-regression test gate
  (`pnpm test`).
