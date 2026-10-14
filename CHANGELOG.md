# Changelog

All notable changes to 10Router will be documented in this file.

## [0.1.4] — 2026-10-14

- OpenCode Go: catalog synced to v2 API (`grok-4.7`, `gpt-6-luna`, `mimo-v2.6-flash/pro`, `space-bunny-free`, `longcat-2.5-preview-free`; removed `minimax-m2.5`, `qwen3.7-max`, `qwen3.6-plus`; `deepseek-v4.1-flash`).
- OpenCode Zen: executor routes all responses-family models (GPT/Grok/Muse Spark) to `/zen/v1/responses` from the registry instead of Muse Spark only — fixes GPT/Grok requests hitting `/chat/completions`.
- OpenCode / Zen: dead `/zen/v1/models` catalog URL and dashboard probe replaced with live `/inference/v1/models` from the v2 docs.
- Tests: Go catalog synced to the v2 endpoint table; new Zen responses-routing regression test.

## [0.1.3] — 2026-10-14

- Prettier formatting fixes (opencode executors, golden test).
- Golden snapshot updated for `is_error` boolean on Claude `tool_result` blocks.

## [0.1.2] — 2026-10-14

- OpenAI→Claude: always emit `is_error` boolean on `tool_result` blocks
  (Zed's strict parser requires it; Anthropic treats it as optional).
- OpenCode executor: request headers aligned to prevent 403 FreeTierError.
- CLI: `checkUpdate` tests pass explicit env so `CI=true` guard doesn't silence them.

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
