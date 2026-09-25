<img src="icons/icon.svg" width="128" alt="10Router icon" />

# 10Router

Local AI routing gateway + dashboard. One OpenAI-compatible endpoint (`/v1/*`)
routing across 40+ upstream providers, with fallback, token refresh, and usage tracking.

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)

## Quick start

npm (recommended):

```bash
npm install -g @amir83nasr/10router
10router start
```

Docker (server/VPS):

```bash
docker run -d \
  -p 20128:20128 \
  -v "$HOME/.10router:/app/data" \
  -v "$HOME:/host-home:rw" \
  -e DATA_DIR=/app/data \
  -e HOST_HOME=/host-home \
  --name 10router \
  amir83nasr/10router:latest
```

Dashboard opens at `http://localhost:20128/dashboard`.

## Use

Point any OpenAI-compatible client at `http://localhost:20128/v1` with an API key
copied from the dashboard. Works with Claude Code, Codex, Cursor, Cline, OpenCode,
and anything speaking OpenAI/Claude-compatible APIs.

## Features

- Model-combo and multi-account fallback (subscription → cheap → free)
- Request/response translation (OpenAI pivot, direct routes for fragile pairs)
- OAuth + API-key management with auto token refresh
- RTK token saver (compresses `tool_result` content, fail-open)
- Quota/usage tracking, optional cloud sync

## Layout

- `src/` — gateway + Next.js dashboard
- `open-sse/` — routing/translation engine (see `open-sse/AGENTS.md`)
- `tests/` — vitest suite with regression baselines

## Develop

```bash
cp .env.example .env
pnpm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 pnpm run dev
pnpm run build && PORT=20128 pnpm run start
```

Full contract: [ARCHITECTURE.md](ARCHITECTURE.md), [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE.md](LICENSE.md).
