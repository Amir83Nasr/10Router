# open-sse

Provider-agnostic SSE engine: one OpenAI-style request → any provider (chat, image, embedding, tts, stt, video, search), streamed back in the client's format.

## Request lifecycle (chat)

`handlers/chatCore.js` → `services/model.js` `parseModel` (resolve `provider/model`) + `services/provider.js` (`detectFormat`, `getTargetFormat`, `resolveTransport`) → **pre-translate hooks** (tool dedupe, `rtk/` compress, `headroom`, `pxpipe`, `caveman`/`ponytail` inject, image prefetch, modality strip — all fail-open) → `executors/index.js` `getExecutor(provider)` → `translator/index.js` `translateRequest` → `executor.execute()` → `translateResponse` → `handlers/chatCore/{streaming,nonStreaming,sseToJson}Handler.js` → SSE out.

## Directory map

- `config/` — ALL constants (no hardcode elsewhere). `providers.js` + `registry/` (provider defs), `providerModels.js` (alias→models matrix), `runtimeConfig.js` (timeouts, token limits), per-area files (`grokCli.js`, `mediaConfig.js`, `ttsModels.js`, `ollamaModels.js`…).
- `translator/` — format conversion. `request/` (7 files) + `response/` (6 files), `schema/` (roles, blocks, finishReasons), `concerns/` (thinking, toolCall, modality, prefetch…), `formats/` (openai, claude, gemini, responsesApi, maxTokens). `index.js` is the registry/entry.
- `executors/` — per-provider upstream call. `base.js` (BaseExecutor) + specialized: `antigravity`, `codex`, `cursor`, `opencode` (+`go`, +`zen`), `xiaomi-mimo`, `xiaomi-tokenplan`, `zed`. Everything else falls back to `default.js` (OpenAI-compatible).
- `providers/` — registry build + `capabilities.js` + `pricing.js` + `thinkingLevels.js` + `visionPatterns.js` + `models/`. Entry: `index.js` (PROVIDERS).
- `handlers/` — per-modality cores (`chatCore`, `imageGenerationCore`, `embeddingsCore`, `ttsCore`, `sttCore`, `videoCore`, `responsesHandler`, `systemoneCore`) + per-provider subfolders. `chatCore/` splits streaming / non-streaming / sse-to-json / requestDetail.
- `rtk/` — token savers, all **fail-open**. `index.js` (`tool_result` compress), `headroom.js` (external proxy), `pxpipe.js`, `caveman.js` + `ponytail.js` (system inject), `filters/` + `registry.js` + `applyFilter.js`.
- `transformer/` — `responsesTransformer.js` (Chat SSE → Codex Responses SSE), `streamToJsonConverter.js`.
- `shared/` — cross-provider auth: `machineId.js`, `mimoAccount.js`, `zedAuth.js`, `qoder/`.
- `services/` — `model.js`, `provider.js`, `accountFallback.js`, `combo.js`, `compact.js`, `oauthCredentialManager.js`, `tokenRefresh/`+`tokenRefresh.js`, `projectId.js`, `usage/`, per-provider model files (`cursorModels`, `copilotModels`, `grokCliModels`, `kimchiModels`, `qoderModels`), `thoughtSignatureStore.js`, `capacityAdapter.js`.
- `utils/` — `streamHandler`, `stream`, `sse`, `error`, `sessionManager`, `clientDetector`, `proxyFetch`, `toolDeduper`, `bypassHandler`, `requestLogger`, `usageTracking`, `cursorProtobuf`/`cursorChecksum`, `claudeCloaking`, `ollamaTransform`, `modelMarkers`.

## Conventions

- Config-driven, DRY, camelCase. NEVER hardcode values, models, or block/role strings — use `config/` + `schema/` constants.
- Pipeline pivots through OpenAI. A translator on the exact `source:target` pair runs as a **direct route**, skipping the lossy double-hop.
- Translators self-register via `register(from, to, reqFn, resFn)` as an import side-effect — new files MUST be imported in `translator/index.js`.

## How to add

- **Provider**: copy `providers/REGISTRY_TEMPLATE.js` → `providers/registry/{id}.js`; add models to `config/providerModels.js`. No executor needed for OpenAI-compatible APIs.
- **Executor** (only non-standard upstream): subclass `BaseExecutor` (override `getBaseUrls`/`buildHeaders`/`buildUrl`/`execute`), register in `executors/index.js` map. `getExecutor` falls back to cached `DefaultExecutor` when absent.
- **Translator**: add `request|response/<from>-to-<to>.js` calling `register(...)`, import it in `translator/index.js`. Reuse `schema/` + `concerns/` — don't re-implement parsing.

## Pitfalls

- OpenAI bridge is lossy (thinking, non-base64 images, tool ids, is_error) — prefer a direct route for fragile pairs.
- `providers/registry/index.js` is auto-generated; regenerate via `scripts/migrate-registry.mjs` (don't hand-edit). REGISTRY_TEMPLATE is excluded by design.
- Binary/protobuf formats (kiro EventStream, cursor protobuf, commandcode NDJSON) don't round-trip through OpenAI — handle in their executor.
- `rtk/` hooks mutate the body in-place and are **fail-open**: never throw; RTK skips `is_error`/`status:"error"` tool results to preserve traces.
