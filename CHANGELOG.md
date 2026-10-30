# Changelog

All notable changes to 10Router will be documented in this file.

## [0.1.18] — 2026-10-30

- Synced OpenCode free-tier and OpenCode Go improvements from 9router: TLS-impersonating client (wreq-js) for the free tier, opencode free-tier capability entries (glm-5.3-flash-free on openai format, mimo reasoning, deepseek-v4.1-flash-free 330k context cap), and `isOpencodeFreeTierModel`/`isDeepSeekModel` helpers.

## [0.1.17] — 2026-10-26

- Fix: OpenCode Go routed each model to the provider's default endpoint instead of one it actually serves. An OpenAI-format client asking for a claude-only model (`claude-haiku-5-5`, `minimax-m2.7`) was sent to `/chat/completions` and rejected upstream with `ModelProtocolUnsupported`; `chatCore` and the tests now share `resolveModelTransport` (`open-sse/services/provider.js`), which prefers the sourceFormat-matched endpoint (no translation) and otherwise a model-declared one.
- OpenCode Go transports are ordered `claude → openai → openai-responses → gemini`, so the fallback prefers Anthropic Messages, which is what Claude Code traffic uses.
- OpenCode Go `supportedFormats` re-verified against the live endpoints (the published table is stale): `kimi-k3`, `kimi-k3.1-pro`, `minimax-m3` and `deepseek-v4.1-flash` also answer on `/messages`, most chat models also answer `/responses`, and `minimax-m2.7` is Messages-only. Models disabled in an account's console read as unavailable, so only `ModelProtocolUnsupported` narrows a model's formats.
- Added the documented `step-5-preview` and `beam-free` models, plus `gemini-4-argon` on the Google wire: the executor builds the model-scoped `/{model}:generateContent` URL and authenticates with `x-goog-api-key`.

## [0.1.16] — 2026-10-26

- Removed the fish-audio, glm-cn, groq, huggingface, minimax, minimax-cn, siliconflow, vercel-ai-gateway, xiaomi-tokenplan and xquik providers: registry entries, executors, usage, TTS and image handlers, logos and their tests are gone.
- Added an OpenCode Go connection probe and a dashboard connection card that checks every Go wire format (`open-sse/services/opencodeGoProbe.js`, `open-sse/config/opencodeGo.js`).
- Fix: OpenCode Go, Zen and System One use the v2 inference paths; free-tier entitlement errors are surfaced instead of cooling accounts.
- Fix: Zed and OpenCode keep thinking blocks, surface stream failures and preserve custom tools.
- Fix: reasoning tokens are folded into the completion count for usage, and the OAuth route is force-dynamic.
- Dashboard: console logs are surfaced in the sidebar, and the disable toggle is removed from provider cards.

## [0.1.15] — 2026-10-21

- Fix: a non-streaming `/v1/messages` request routed to a provider that only streams came back as an OpenAI `chat.completion` body when the upstream spoke Anthropic on the wire. Claude Code reads `message.content[]` and threw, which auto mode reported as "classifier unavailable". Both the forced-stream and the non-streaming paths now aggregate Claude-dialect SSE with `parseClaudeSSEToMessage` (`open-sse/handlers/chatCore/claudeMessageBody.js`); the chat parser stays for chat-native upstreams and each path falls back to the other when no Anthropic event was seen.
- Fix: an Anthropic Messages request that omits `stream` defaults to a JSON body, but the gateway used to answer SSE. The client preference is now resolved during stream negotiation, so a Claude client keeps JSON even when the provider forces streaming upstream; an explicit `Accept: text/event-stream` still opts into SSE.
- Fix: auto mode could not read the classifier verdict it asked for. Claude Code also sends `</severity>` as a stop hint, and an OpenAI-dialect `stop` trims the matched text, leaving an unparseable `<severity>0`. The classifier's own closing tag is dropped from `stop_sequences`; ordinary terminators are forwarded unchanged.
- Fix: `reasoning_effort: "auto"` reached upstreams from the `openai`, `zai`, `step` and `commandcode` wires, where it is not a declared enum member. Adaptive thinking with no explicit effort now omits the field and takes the provider default — most visibly on the zai path, whose fallback branch promoted "let the model decide" to `max`.
- Fix: a model that cannot reason dropped the client's effort selection silently, so a fallback combo made an ignored selection look like a provider quirk. The drop is now reported once per request as a `THINKING` warning; the request itself is unchanged.
- Fix: `top_p`, `stop` and `stop_sequences` round-trip between Claude and OpenAI bodies, and a `response.failed` event from a Responses upstream is a 502 instead of an empty success.
- The Claude settings route and card also write `CLAUDE_CODE_AUTO_MODE_SERVER=0` (the new `CLI_TOOLS.claude.envVars.autoModeServer` constant, reset with the other gateway keys): auto mode's server-side classifier review is an Anthropic API call a gateway cannot serve, so declaring it skips the dead round-trip and the billing notice while the local classifier still runs.
- Tests: `tests/unit/mode-wire-diff.test.js`, `opencode-combo-reasoning-contract.test.js` (all five combo members against the OpenAI wire enum), `system-inject-once.test.js`, `effort-unsupported-observable.test.js`, `claude-message-body.test.js`, `claude-forced-stream-dispatch.test.js`, `claude-nonstream-response-shape.test.js` and `request-stop-sequences.test.js`.

## [0.1.14] — 2026-10-21

- Fix: Claude Code never showed its task list when the model was routed through this gateway. The CLI only advertises `TodoWrite`/`TodoRead` when the model id is one of Anthropic's own (an internal allowlist), and every routed model is a custom id (`oc/...`, a combo name, …), so the todo tools silently disappeared. The Claude settings route now writes `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` alongside the gateway env, and the card's env preview shows the same flag. The key comes from the new `CLI_TOOLS.claude.envVars.todoTools` constant and is reset with the rest of the gateway env keys.
- Tests: `tests/unit/claude-settings-todo-tools.test.js` covers the route writing the flag next to the existing settings and the reset removing it.

## [0.1.13] — 2026-10-21

- Removed the built-in chat page (`/dashboard/basic-chat`) and its sidebar entry. The page was a thin UI over `/v1/chat/completions` with sessions kept in `localStorage`, and nothing else in the app linked to it. The `/api/dashboard/chat/completions` route it called is gone as well — the OpenAI-compatible `/v1/chat/completions` endpoint is unchanged.
- The dashboard layout no longer special-cases the chat route: every page uses the same padding and content width again.
- The markdown styles shared with the chat panel are now scoped to the changelog modal only, and the `dompurify` dependency the chat page introduced was dropped (`marked` stays — the changelog modal still uses it).

## [0.1.12] — 2026-10-20

- Fix: Claude Code routed through the `opencode` free lane failed tool calls with `400 unknown field "thinking"`. The OpenAI-dialect endpoint inherited the model's `zai`/`deepseek` capability thinking shape and sent `body.thinking`; the transport now declares `thinkingFormat: "openai"` (opencode, opencode-zen and opencode-go OpenAI transports) and `resolveFormat` prefers the transport matching the target format. Claude- and Gemini-format transports keep their native shape.
- Fix: a stream that closed without `finish_reason` left the `tool_use` block open and the message unterminated, so the client dropped the turn as failed. The end-of-stream flush now closes open blocks, emits buffered tool arguments, and always sends `message_delta` + `message_stop`; truncated tool JSON degrades to `end_turn` instead of a broken `tool_use`.
- Fix: empty `tool_result` content (empty array, image-only, or a missing response) was sent as `""` or `"[]"` and rejected by OpenAI-dialect upstreams with `Message content must contain text`. A shared `EMPTY_TOOL_RESULT` placeholder is now applied when converting Claude tool results, when backfilling missing tool responses, and in `filterToOpenAIFormat`.
- Fix: the built-in chat page posted to `/api/dashboard/chat/completions`, a route that never existed, so every message 404'd. The route now delegates to `handleChat` and mints/reuses a local API key server-side; the page is reachable from the sidebar, renders markdown, and surfaces SSE error events.
- Tests: `tests/unit/claude-code-tool-flow.test.js` covers the thinking wire format per provider/transport, stream finalize without `finish_reason`, truncated tool arguments, empty tool results, and the flush contract.

## [0.1.11] — 2026-10-18

- Fix: the CLI update notice never fired on networks that silently drop IPv6. `registry.npmjs.org` resolves to both A and AAAA records, so Node blackholes the first connection for ~10s before Happy Eyeballs falls back to IPv4, while the check aborted at 3s — a cold check routinely needs 2-14s. Measured 5/8 fetches and 1/12 notices here; the 10s budget now measures 8/8.
- Fix: a failed check was never remembered, so every invocation re-paid the full timeout stall and then re-served the same stale version ("stale cache beats silence"). Failures are now recorded with a 10-minute cooldown (`FAIL_TTL`, mirroring `FAIL_TTL_MS` in `src/lib/versionCheck.js`), so an unreachable registry costs one stall per window instead of one per run, and a version published during the window still surfaces once the link recovers.
- Tests: cover the failure memory (no retry inside the cooldown, retry past it) and the recovery path (a version published while the registry was down appears after the cooldown without waiting out `UPDATE_TTL`).

## [0.1.10] — 2026-10-18

- Fix: every combo edit made from the dashboard failed with a 500 `Failed to update combo`. `PUT /api/combos/[id]` declared the parsed request body as `const` but reassigns it after cleaning the members array, so `Assignment to constant variable` was thrown inside the try and swallowed by the catch; only requests carrying `models` hit it, which is why name-only edits and combo creation worked. Introduced with the member-validation block in v0.1.9.
- Tests: cover the combo update path — model/name updates, member trim/dedupe, invalid-member rejection, and name-only updates — so a regression here fails loudly instead of returning an opaque 500.

## [0.1.9] — 2026-10-17

- Zed: detect context-window overflow reported as an in-stream `status:failed` frame and return it as a request-scoped `400 context_length_exceeded` instead of assistant text — the account is no longer cooled down by the fallback layer. History is trimmed to the model's catalog limit before sending, and a pre-send guard fails fast when even the trimmed body does not fit.
- Zed: retry transient network failures (`ECONNRESET`/`ETIMEDOUT`) on auth and completion fetches using the shared 502 retry config; caller aborts are never retried.
- Combos: validate members on create/update (`POST`/`PUT /api/combos`) — bare words from a bad paste, duplicates, self-references, and unknown names are rejected at save time with a message naming the offending entries, instead of failing every run at request time.
- Zed: model-list and usage resolvers now honour the connection's proxy pool instead of falling back to a direct call.
- Claude → OpenAI: stop emitting literal `<think>`/`</think>` markers into `delta.content` — thinking text streams as `reasoning_content` only.
- Fix: opencode model-list URL for Anthropic-compatible providers built `.../v1/messag` (`slice(0, -9)` ate a character); now sliced by `"/messages".length`.
- Fix: xAI OAuth poll interval was never cleared on the 5-minute auth timeout, leaking a 100 ms timer.
- Fix: `useShutdown` called `setState` inside an effect (cascading render); the transition now happens where the poll completes.
- Perf: `/api/usage/stream` ran the full usage-stats recompute once per open tab per event; all subscribers now share one cache and one in-flight recompute, so N tabs cost the same as one.
- Perf: `matchPattern` recompiled a `RegExp` on every call inside ~100-entry pricing/capability loops; patterns are now memoized.
- Perf: settings were read from the DB and re-merged against ~40 defaults three times per chat request; added a short-TTL cache with write invalidation.
- Perf: remote-image prefetch for base64-only targets now fetches in parallel instead of serially in the pre-first-byte path.
- Perf: custom provider-node prefix resolution did three identical type-filtered table scans per request; now one scan.
- Fix: token-keyed Claude/Antigravity usage caches never evicted retired tokens; added unref'd sweepers.
- Fix: silently swallowed failures now log — background projectId persistence and provider-node name lookup.
- Types: resolved 11 pre-existing `tsc --noEmit` errors under `src/` (stale generated `.next/types` route-tag warnings remain, covered by `ignoreBuildErrors`).

## [0.1.8] — 2026-10-15

- Deps: drop `better-sqlite3` — fixes `npm i -g` install-script warning (`allowScripts`) and the deprecated `prebuild-install` warning. DB chain is now built-in `node:sqlite` (≥22.5) → `sql.js` (WASM fallback); the adapter loads `better-sqlite3` lazily as a manual opt-in only, so the Next.js build no longer resolves it.
- CLI: shorten update-check TTL from 24h to 1h so same-day releases trigger the update notice.
- Dashboard: ProviderHealth fallback inspector (per-account health + why fallback triggered) with `/api/usage/health` route.

## [0.1.7] — 2026-10-15

- OpenCode Free/Zen: migrate chat/responses/messages endpoints to Console Inference v2 (`/inference/openai/v1/*`, `/inference/anthropic/v1/messages`); SystemOne to `/inference/v1/systemone` with v2 client UA.
- OpenCode Go: migrate from `/zen/go/v1/*` to `/inference/go/v1/*` (chat, messages, responses, usage).
- Dashboard: provider test/validate probes use v2 Go endpoint and v2 free-tier UA.

## [0.1.6] — 2026-10-15

- Version badge: check npm registry latest instead of GitHub tags for sidebar update notice.
- OpenCode: merge upstream PR 4860 — free-tier v2 fingerprint and `/inference/v1` endpoint table.
- OpenCode: restore renamed (fingerprinted) tool names across streaming, SSE-to-JSON, non-streaming, and direct-translate response paths so clients see original names.
- Changelog API: ship `CHANGELOG.md` into the standalone Docker bundle (`Dockerfile`, `next.config.mjs` tracing, npm `files`) and migrate `/api/changelog` route from JS to TS with read-failure logging.

## [0.1.5] — 2026-10-15

- Fix: pin `next` to exact `16.3.5` in package dependencies to prevent runtime ENOENT on `preview-props.json` when npm resolves `next@16.4.0` against a prebuilt `.next` artifact.
- CLI: add pre-publish package test guard verifying exact `dependencies.next` pin and detecting version skew against the prebuilt bundle.

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
