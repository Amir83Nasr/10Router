# CLAUDE.md

read first @AGENTS.md, @ARCHITECTURE.md, @open-sse/AGENTS.md

## What this is

10Router (`10router-app`, v0.5.96) — local AI routing gateway + Next.js dashboard. One OpenAI-compatible endpoint (`/v1/*`), routes across ~28 upstream providers (format translation, model-combo + multi-account fallback, OAuth/API-key management, token refresh, usage tracking, optional cloud sync). Runtime data dir `~/.10router` (`APP_NAME="10router"` in `src/lib/dataDir.js`, overridable via `DATA_DIR`).

Code: `src/` (Next.js app + dashboard/compat APIs + `src/sse/` entry glue), `open-sse/` (provider-agnostic routing/translation engine), `tests/` (independent ESM vitest package).

## Commands

```bash
cp .env.example .env
pnpm install
pnpm dev      # scripts/dev-local.mjs (port 20127); pnpm dev:ui → isolated UI server 20129 + DATA_DIR ~/.10router-dev
pnpm build && pnpm start   # production, port 20127
```

- Runtime default `PORT` is 20128 (`.env.example`, Dockerfile); dev scripts use 20127. Dashboard `/dashboard`, API `/v1`.
- Lint/format: `pnpm lint` / `pnpm format:check` — legacy debt, not a commit gate (lint-staged pre-commit on staged files only).
- Tests (root `pnpm test` = no-regression gate via `scripts/run-tests.mjs`):

```bash
pnpm install && cd tests && pnpm install   # both installs needed (tests import from src/)
npx vitest run                             # from tests/; single file: npx vitest run unit/capabilities.test.js
pnpm test --real                           # include live-provider tests (need credentials, skip otherwise)
```

- Suite is green on plain checkout. Baseline (`tests/__baseline__/baseline-results.json`): 1536 tests, 0 failed, 528 files. Gate (`scripts/run-tests.mjs`) fails only on regression vs baseline. Live/credential tests (`translator/real/*.real.test.js`, `*.e2e.test.js` without env) are excluded/skipped by default; run with `pnpm test --real`.
- After touching provider registry / aliases / OAuth URLs: run `tests/__baseline__/verify-*.mjs`.

## Architecture

Request flow: `src/app/api/v1/*` (Next rewrites in `next.config.mjs`: `/v1/*` → `/api/v1/*`, `/v1/v1/*` dedupe, `/codex/*` → `/api/v1/responses`, `/responses` → `/api/v1/responses`, `/v1beta/*`) → `src/sse/handlers/chat.js` (parse, combo expansion, account loop) → `open-sse/handlers/chatCore.js` (format detect, translate, dispatch, retry/refresh, stream) → `open-sse/executors/*` (`default.js` = any OpenAI-compatible provider) → `open-sse/translator/*` (client ↔ provider) → SSE out.

- Translator pivots through OpenAI; exact `source:target` pair (`register(from, to, …)` import side effect in `translator/index.js`) = direct route, skips lossy double-hop. Prefer direct for fragile pairs (thinking blocks, tool ids, non-base64 images, `is_error`). Never hardcode role/block/model strings — `translator/schema/` + `config/` constants.
- Provider registry: one file per provider in `providers/registry/`; `registry/index.js` auto-generated (regenerate via `scripts/migrate-registry.mjs`, never hand-edit). New provider: copy `REGISTRY_TEMPLATE.js`, add models to `config/providerModels.js`; executor only for non-OpenAI-compatible upstreams.
- Persistence: SQLite `DATA_DIR/db/data.sqlite` (`src/lib/db/paths.js`), fallback chain `driver.js`: `bun:sqlite` → `better-sqlite3` (optionalDep) → `node:sqlite` (≥22.5) → `sql.js`. New code imports `@/lib/db/index.js` (`localDb.js`/`usageDb.js` = compat shims); repos `src/lib/db/repos/*`, migrations `src/lib/db/migrations/`. `db.json`/`usage.json` = legacy import sources only.
- RTK (`open-sse/rtk/`): in-place `tool_result` compression, **fail-open** (never throw, skips `is_error`/`status:"error"`).
- Binary/protobuf upstreams (kiro EventStream, cursor protobuf, commandcode NDJSON) handled in own executor, not translator.

## Gotchas (not in AGENTS.md)

- `next.config.mjs`: `typescript.ignoreBuildErrors`; `tsc --noEmit` source of truth. `@/*` → `src/*`.
- `custom-server.js` derives client IP from TCP socket, strips `X-Forwarded-For` (trust only loopback proxy). Preserve on request/IP/rate-limit changes.
- Security env: `JWT_SECRET`, `INITIAL_PASSWORD` (default `123456`, must override), `API_KEY_SECRET`, `MACHINE_ID_SALT`. Full contract `.env.example` + ARCHITECTURE.md env matrix.
