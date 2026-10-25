// ZedHostedExecutor — routes requests to Zed's hosted LLM aggregator
// (cloud.zed.dev/completions), a multi-format proxy fronting
// Anthropic/OpenAI/Google/xAI depending on the requested model.
//
// Wire protocol: POST /completions with an NDJSON/SSE-ish body-per-line
// response stream (`{"event": <provider-shaped-chunk>}` / `{"status": ...}` /
// `[DONE]`), authenticated with a short-lived LLM bearer token exchanged from
// the RSA-decrypted access_token (see open-sse/shared/zedAuth.js). The
// provider-shaped chunk is Claude/Gemini/OpenAI-Responses/xAI(OpenAI-shaped)
// depending on which upstream Zed fronts for the model — translated back to
// OpenAI Chat Completions by reusing the existing translators.
//
// Overrides execute() entirely (does NOT use DefaultExecutor's pipeline) because the Zed wire
// shape (thread envelope, LLM-token exchange, NDJSON status frames) doesn't
// fit the generic transformRequest/buildUrl contract.

import { BaseExecutor } from "./base.js";
import { FORMATS } from "../translator/formats.js";
import { initState } from "../translator/index.js";
import { openaiToClaudeRequest } from "../translator/request/openai-to-claude.js";
import { openaiToGeminiRequest } from "../translator/request/openai-to-gemini.js";
import { openaiToOpenAIResponsesRequest } from "../translator/request/openai-responses.js";
import { claudeToOpenAIResponse } from "../translator/response/claude-to-openai.js";
import { geminiToOpenAIResponse } from "../translator/response/gemini-to-openai.js";
import { openaiResponsesToOpenAIResponse } from "../translator/response/openai-responses.js";
import { ZED_HEADERS, resolveZedModels, zedLlmFetch } from "../shared/zedAuth.js";
import { estimateInputTokens } from "../utils/usageTracking.js";
import { stripHistoryForContext } from "../services/capacityAdapter.js";
import {
  stripThinkingSuffix,
  extractThinking,
  applyThinking,
} from "../translator/concerns/thinkingUnified.js";
import { reconcileThinkingBudget } from "../translator/formats/claude.js";
import { DEFAULT_MAX_TOKENS } from "../config/runtimeConfig.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";

// Wire values for the `provider` field of POST /completions. These are NOT
// display names: cloud.zed.dev matches them exactly, and an unrecognized value
// fails the whole request with `500 {"message":"An internal server error
// occurred."}` before the model is ever looked at. Spellings come from Zed's
// own GET /models catalog: `anthropic`, `open_ai`, `google` (note underscore),
// `x_ai` follows the same convention — so feeding a catalog value back through
// normalizeZedProvider is identity.
const ZED_PROVIDER = {
  anthropic: "anthropic",
  openai: "open_ai",
  google: "google",
  xai: "x_ai",
};

function normalizeZedProvider(value, model) {
  const raw = String(value || "").toLowerCase();
  if (raw === "anthropic") return ZED_PROVIDER.anthropic;
  if (raw === "openai" || raw === "open_ai") return ZED_PROVIDER.openai;
  if (raw === "google" || raw === "gemini") return ZED_PROVIDER.google;
  if (raw === "xai" || raw === "x_ai" || raw === "x-ai") return ZED_PROVIDER.xai;

  const m = String(model || "").toLowerCase();
  if (m.includes("claude")) return ZED_PROVIDER.anthropic;
  if (m.includes("gemini")) return ZED_PROVIDER.google;
  if (m.includes("grok") || m.includes("xai")) return ZED_PROVIDER.xai;
  return ZED_PROVIDER.openai;
}

// The shared Claude translator copies sampling fields only — thinking intent is
// applied later by the translator pipeline, against the executor's target
// format. Zed's Claude path bypasses that pipeline, so `model(high)` and
// reasoning_effort used to be dropped with no error.
//
// `model` keeps the client's thinking suffix here: applyThinking parses it into
// the budget/level override, and the cleaned id is only used on the wire.
function applyZedThinking(claudeRequest, sourceBody, model, raw, log) {
  if (!raw?.supports_thinking) {
    const intent = extractThinking(sourceBody);
    if (intent && intent.mode !== "none") {
      log?.warn?.(
        "ZED",
        `${stripThinkingSuffix(model)} does not support thinking — requested depth omitted`,
      );
    }
    return claudeRequest;
  }
  // No early return on a missing intent: the depth may come from the model
  // suffix alone (`claude-sonnet-4.5(high)`) with no body field to extract.
  applyThinking(FORMATS.CLAUDE, model, claudeRequest, "zed", extractThinking(sourceBody));
  const ceiling =
    Number(raw?.max_output_tokens ?? raw?.maxOutputTokens) ||
    getCapabilitiesForModel("zed", stripThinkingSuffix(model)).maxOutput ||
    DEFAULT_MAX_TOKENS;
  // The shared translator clamps against provider capabilities, not Zed's live
  // catalog, so a model whose real ceiling is lower would still 400 upstream.
  if (claudeRequest.max_tokens) {
    claudeRequest.max_tokens = Math.min(claudeRequest.max_tokens, ceiling);
  }
  return reconcileThinkingBudget(claudeRequest, ceiling);
}

function buildProviderRequest(
  provider,
  model,
  body,
  stream,
  credentials,
  raw = null,
  { log = null, sourceModel = model } = {},
) {
  if (provider === ZED_PROVIDER.anthropic) {
    const claudeRequest = openaiToClaudeRequest(model, body, true);
    return applyZedThinking(claudeRequest, body, sourceModel, raw, log);
  }
  if (provider === ZED_PROVIDER.google) {
    const geminiRequest = openaiToGeminiRequest(model, body, true);
    // Zed's hosted Gemini backend speaks the Vertex safety vocabulary, not the
    // public Gemini API enum the shared translator emits (`OFF`, `CIVIC_INTEGRITY`,
    // `DANGEROUS_CONTENT`). Drop client-side safetySettings for the Zed Google
    // path so Zed applies its own defaults — scoped here so native Gemini/
    // Antigravity is untouched.
    delete geminiRequest.safetySettings;
    return geminiRequest;
  }
  if (provider === ZED_PROVIDER.openai) {
    return openaiToOpenAIResponsesRequest(model, body, true, credentials);
  }
  // xAI is OpenAI-shaped — forward as-is.
  return { ...(body || {}), model, stream: stream !== false };
}

function initProviderState(provider, model) {
  if (provider === ZED_PROVIDER.anthropic) return initState(FORMATS.CLAUDE);
  if (provider === ZED_PROVIDER.google) return initState(FORMATS.GEMINI);
  if (provider === ZED_PROVIDER.openai) return initState(FORMATS.OPENAI_RESPONSES);
  const state = initState(FORMATS.OPENAI);
  state.model = model;
  return state;
}

function convertProviderEvent(provider, event, state) {
  if (provider === ZED_PROVIDER.anthropic) return claudeToOpenAIResponse(event, state);
  if (provider === ZED_PROVIDER.google) return geminiToOpenAIResponse(event, state);
  if (provider === ZED_PROVIDER.openai) return openaiResponsesToOpenAIResponse(event, state);
  return event;
}

// A stream that ends without a terminal frame leaves non-streaming aggregation
// (parseSSEToOpenAIResponse) with a finish_reason-less answer and streaming
// clients waiting for a terminator, so close it explicitly.
function createFinishChunk(model) {
  return {
    id: `chatcmpl-zed-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
}

function errorMessageOf(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);
  const nested = value.error && typeof value.error === "object" ? value.error.message : value.error;
  return String(value.message || value.detail || nested || value.code || value.type || "");
}

/**
 * Provider error carried inside a stream frame, or null.
 *
 * Zed forwards the upstream body untouched, so a failure can arrive as an
 * Anthropic `{"type":"error","error":{…}}`, an OpenAI `{"error":{…}}`, or a
 * Responses `response.failed`. The response translators have no case for any of
 * them: passing one through would silently drop the failure.
 */
function frameErrorOf(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  if (event.type === "error") {
    return {
      message: errorMessageOf(event.error) || errorMessageOf(event) || "upstream error",
      code: String(event.error?.code || event.code || "upstream_error"),
    };
  }
  if (event.type === "response.failed") {
    const failed = event.response || event;
    return {
      message: errorMessageOf(failed) || "upstream response failed",
      code: String(failed.error?.code || failed.code || "response_failed"),
    };
  }
  // Bare `{"error": {…}}` envelope. A normal payload always carries at least one
  // of choices / candidates / output, so those exclude a legitimate `error: null`.
  if (event.error && !event.choices && !event.candidates && !event.output) {
    return {
      message: errorMessageOf(event.error) || "upstream error",
      code: String(event.error?.code || event.error?.type || "upstream_error"),
    };
  }
  return null;
}

// HTTP status for an in-band failure, so the fallback layer reacts the way it
// would to the equivalent HTTP error (quota cools down, overflow is request-scoped).
function statusForStreamError(message, code = "") {
  const text = `${code} ${message}`;
  if (isContextOverflowText(text)) return 400;
  if (/rate.?limit|quota|too many requests|tokens per (minute|day)/i.test(text)) return 429;
  if (/overloaded|unavailable|try again/i.test(text)) return 503;
  return 502;
}

// In-band error frame in the shared buildErrorBody shape. Clients aggregate
// delta.content into the answer and non-streaming aggregation keys off
// chunk.error, so a failure must travel as an error — never as assistant text.
function createErrorFrame(message, status, code) {
  const type = status === 400 ? "invalid_request_error" : "upstream_error";
  return `data: ${JSON.stringify({ error: { message, type, code, status } })}\n\n`;
}

function createErrorResponse(message, status, code) {
  const type = status === 400 ? "invalid_request_error" : "upstream_error";
  return new Response(JSON.stringify({ error: { message, type, code, status } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function enqueueSseObject(controller, encoder, chunk) {
  if (!chunk) return;
  const items = Array.isArray(chunk) ? chunk : [chunk];
  for (const item of items) {
    if (!item) continue;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(item)}\n\n`));
  }
}

function unwrapZedLine(line) {
  let text = line.replace(/\r$/, "").trim();
  if (!text) return null;
  if (text.startsWith("data:")) text = text.slice(5).trimStart();
  if (text === "[DONE]") return { done: true };
  try {
    const parsed = JSON.parse(text);
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, "event")) {
      return { event: parsed.event };
    }
    if (parsed && Object.prototype.hasOwnProperty.call(parsed, "status")) {
      return { status: parsed.status };
    }
    return { event: parsed };
  } catch {
    return null;
  }
}

function normalizeStatus(status) {
  if (!status) return null;
  if (typeof status === "string") return { type: status };
  if (typeof status === "object") {
    const key = Object.keys(status)[0];
    if (key && typeof status[key] === "object") return { type: key, ...status[key] };
    return status;
  }
  return null;
}

// Zed reports context overflow inside a `status:failed` frame on an HTTP-200
// stream (and occasionally as a non-200 body) — never as a typed API error.
// Detect it by wording so both paths below can treat it as request-scoped.
const OVERFLOW_RE =
  /context_length_exceeded|\bcontext\b.*\b(window|length|limit)\b|exceeds.*token|too many tokens|prompt (is )?too long|maximum.*token/i;

function isContextOverflowText(value) {
  return OVERFLOW_RE.test(String(value || ""));
}

function statusFailureOf(status) {
  if (!status) return null;
  if (status.type === "failed" || status.failed) {
    const failed = status.failed || status;
    const message = String(failed.message || failed.error || failed.code || "request failed");
    const code = String(failed.code || failed.error?.code || "");
    return { message, ...failureDetails(message, code) };
  }
  return null;
}

function failureDetails(message, code) {
  const status = statusForStreamError(message, code);
  if (status !== 400) return { status, code: code || "upstream_error" };
  return {
    status,
    code: "context_length_exceeded",
    message:
      `Context window exceeded: ${message}. ` + `Shorten the conversation or use a larger model.`,
  };
}

/**
 * Read up to the first real payload frame so an immediate failure can still be
 * answered with a real HTTP status (account fallback, non-streaming clients,
 * correct status codes) instead of an HTTP-200 stream that fails silently.
 * `consumed` holds every byte read — the caller replays it, so nothing is lost.
 */
async function peekZedStream(reader, decoder) {
  let consumed = "";
  let offset = 0;
  let upstreamDone = false;

  while (true) {
    let nl = consumed.indexOf("\n", offset);
    if (nl === -1 && !upstreamDone) {
      const { done, value } = await reader.read();
      upstreamDone = done;
      consumed += done ? decoder.decode() : decoder.decode(value, { stream: true });
      continue;
    }
    if (offset >= consumed.length) return { failure: null, consumed, upstreamDone };
    if (nl === -1) nl = consumed.length;

    const line = consumed.slice(offset, nl).replace(/\r$/, "").trim();
    offset = nl + 1;
    if (!line || line.startsWith(":")) continue;

    const payload = unwrapZedLine(line);
    if (!payload) {
      // Not a JSON frame: an HTML/text error page (proxy, gateway) rather than a
      // provider chunk. Surface it instead of streaming garbage to the client.
      return {
        failure: {
          message: `Zed returned a non-JSON stream frame: ${line.slice(0, 200)}`,
          status: 502,
          code: "invalid_stream_frame",
        },
        consumed,
        upstreamDone,
      };
    }
    if (payload.done) return { failure: null, consumed, upstreamDone };
    if (payload.status) {
      const failure = statusFailureOf(normalizeStatus(payload.status));
      if (failure) return { failure, consumed, upstreamDone };
      continue; // status-only frames (started, …) carry no payload
    }
    const frameError = frameErrorOf(payload.event);
    return {
      failure: frameError
        ? { ...frameError, ...failureDetails(frameError.message, frameError.code) }
        : null,
      consumed,
      upstreamDone,
    };
  }
}

async function wrapZedCompletionStream(response, provider, model) {
  if (!response.ok || !response.body) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const reader = response.body.getReader();

  const peek = await peekZedStream(reader, decoder);
  if (peek.failure) {
    await reader.cancel().catch(() => {});
    return createErrorResponse(peek.failure.message, peek.failure.status, peek.failure.code);
  }

  const state = initProviderState(provider, model);
  let buffer = peek.consumed;
  let done = false;
  let emittedFinish = false;

  const finish = (controller) => {
    if (done) return;
    enqueueSseObject(controller, encoder, convertProviderEvent(provider, null, state));
    if (!emittedFinish) enqueueSseObject(controller, encoder, createFinishChunk(model));
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    done = true;
  };

  const abort = (controller, failure) => {
    controller.enqueue(
      encoder.encode(createErrorFrame(failure.message, failure.status, failure.code)),
    );
    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    done = true;
  };

  const processLine = (line, controller) => {
    if (done) return;
    const payload = unwrapZedLine(line);
    if (!payload) return;
    if (payload.done) {
      finish(controller);
      return;
    }
    if (payload.status) {
      const status = normalizeStatus(payload.status);
      const failure = statusFailureOf(status);
      if (failure) abort(controller, failure);
      else if (status?.type === "stream_ended" || status === "stream_ended") finish(controller);
      return;
    }
    const frameError = frameErrorOf(payload.event);
    if (frameError) {
      abort(controller, { ...frameError, ...failureDetails(frameError.message, frameError.code) });
      return;
    }
    const converted = convertProviderEvent(provider, payload.event, state);
    for (const item of Array.isArray(converted) ? converted : [converted]) {
      if (item?.choices?.some((choice) => choice?.finish_reason)) emittedFinish = true;
    }
    enqueueSseObject(controller, encoder, converted);
  };

  const transformed = new ReadableStream({
    async start(controller) {
      try {
        while (!done) {
          let nl;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            processLine(line, controller);
            if (done) break;
          }
          if (done) break;
          const { done: upstreamDone, value } = await reader.read();
          if (upstreamDone) {
            buffer += decoder.decode();
            if (buffer) {
              processLine(buffer, controller);
              buffer = "";
            }
            break;
          }
          buffer += decoder.decode(value, { stream: true });
        }
      } catch (error) {
        if (!done) {
          abort(controller, {
            message: `Zed stream failed: ${error?.message || error}`,
            status: 502,
            code: "stream_failed",
          });
        }
      } finally {
        await Promise.resolve()
          .then(() => reader.cancel())
          .catch(() => {});
        if (!done) {
          try {
            finish(controller);
          } catch {
            /* controller already closed */
          }
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason).catch(() => {});
    },
  });

  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}

class ZedExecutor extends BaseExecutor {
  constructor() {
    super("zed");
  }

  async resolveModel(model, credentials, signal, log, proxyOptions = null) {
    try {
      const catalog = await resolveZedModels(credentials, {
        config: this.config,
        signal,
        proxyOptions,
      });
      let raw = catalog?.rawById?.get(model) ?? null;
      if (!raw) {
        const refreshed = await resolveZedModels(credentials, {
          config: this.config,
          signal,
          proxyOptions,
          forceRefresh: true,
        });
        raw = refreshed?.rawById?.get(model) ?? null;
      }
      return { raw, provider: normalizeZedProvider(raw?.provider, model) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.warn?.("ZED", `model catalog unavailable, inferring provider for ${model}: ${message}`);
      return { raw: null, provider: normalizeZedProvider(null, model) };
    }
  }

  async execute({ model, body, stream, credentials, signal, log, proxyOptions = null }) {
    // chatCore forwards the client's thinking suffix (`model(high)`) so translators
    // can read it, but the upstream model id must never carry it: it breaks the
    // catalog lookup (and with it the context guard) and Zed rejects it.
    const upstreamModel = stripThinkingSuffix(model);
    const { raw, provider } = await this.resolveModel(
      upstreamModel,
      credentials,
      signal,
      log,
      proxyOptions,
    );
    let requestBody = body || {};
    // Pre-send context guard: Zed reports overflow as an in-stream
    // `status:failed` frame (HTTP 200 already sent), which can only surface
    // as assistant text — never as a clean error. Trim history to the
    // catalog window first; fail fast with 400 (request-scoped, no account
    // lock) when even the trimmed body doesn't fit.
    const contextLimit = Number(raw?.max_token_count ?? raw?.maxTokenCount) || null;
    if (contextLimit) {
      if (estimateInputTokens(requestBody) > contextLimit) {
        const trimmed = stripHistoryForContext(requestBody, contextLimit);
        if (trimmed !== requestBody) {
          log?.info?.("ZED", `trimmed history for ${upstreamModel} to fit ${contextLimit} tokens`);
          requestBody = trimmed;
        }
      }
      const estimated = estimateInputTokens(requestBody);
      if (estimated > contextLimit) {
        const message =
          `Context window exceeded: ~${estimated} tokens exceeds the limit of ` +
          `${contextLimit} tokens for ${upstreamModel}. Shorten the conversation or use a larger model.`;
        return {
          response: new Response(
            JSON.stringify({
              error: {
                message,
                type: "invalid_request_error",
                code: "context_length_exceeded",
              },
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
          url: `${this.config?.llmBaseUrl || "https://cloud.zed.dev"}/completions`,
          headers: { "Content-Type": "application/json", Authorization: "Bearer <zed-llm-token>" },
          transformedBody: { model: upstreamModel, estimatedInputTokens: estimated, contextLimit },
        };
      }
    }
    const providerRequest = buildProviderRequest(
      provider,
      upstreamModel,
      requestBody,
      stream,
      credentials,
      raw,
      { log, sourceModel: model },
    );
    const bodyRecord = requestBody;
    const payload = {
      thread_id: bodyRecord.thread_id || credentials?._clientSessionId,
      prompt_id: bodyRecord.prompt_id,
      provider,
      model: upstreamModel,
      provider_request: providerRequest,
    };

    const response = await zedLlmFetch(credentials, "/completions", {
      config: this.config,
      signal,
      proxyOptions,
      fetchOptions: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson, text/event-stream, */*",
          "User-Agent": "9router/zed",
          "x-zed-version": this.config?.appVersion?.toString() || "0.200.0",
          [ZED_HEADERS.clientSupportsStatus]: "true",
          [ZED_HEADERS.clientSupportsStreamEnded]: "true",
        },
        body: JSON.stringify(payload),
      },
    });

    const wrapped = response.ok
      ? await wrapZedCompletionStream(response, provider, upstreamModel)
      : response;
    return {
      response: wrapped,
      url: `${this.config?.llmBaseUrl || "https://cloud.zed.dev"}/completions`,
      headers: { "Content-Type": "application/json", Authorization: "Bearer <zed-llm-token>" },
      transformedBody: payload,
    };
  }

  parseError(response, bodyText) {
    let parsed = null;
    try {
      parsed = JSON.parse(bodyText || "{}");
    } catch {
      parsed = null;
    }

    const errorObj = parsed?.error || undefined;
    const code = parsed?.code || errorObj?.code || "";
    const rawMessage = parsed?.message || errorObj?.message || bodyText || response.statusText;
    // Overflow is request-scoped: return it as-is (no proxy/lock guidance, no
    // retry wording) so the fallback layer hands it back without cooling the
    // account. checkFallbackError already treats non-quota 400s this way.
    if (code === "context_length_exceeded" || isContextOverflowText(rawMessage)) {
      return {
        status: 400,
        message: `Context window exceeded for this request: ${rawMessage}. Shorten the conversation or use a larger model.`,
      };
    }
    if (code === "trial_blocked") {
      return {
        status: response.status,
        message: `Zed trial access is blocked upstream. The account can list hosted models, but Zed is refusing completions until trial/billing access is enabled or unblocked. Zed says: ${rawMessage}`,
      };
    }
    // HTTP 451 = upstream geo-block (e.g. OpenAI models unavailable from an IR
    // egress IP). Same-account immediate retry won't help — route a non-IR
    // egress proxy (connection proxy / PROXY pool / vercel relay) on this
    // connection so cloud.zed.dev sees a different source IP.
    if (response.status === 451) {
      return {
        status: 451,
        message: `Zed geo-blocked this model upstream: ${rawMessage}. Set an egress proxy outside the blocked region on this Zed connection (connection proxy / vercel relay) and retry.`,
      };
    }
    if (code) {
      return { status: response.status, message: `Zed ${code}: ${rawMessage}` };
    }
    return {
      status: response.status,
      message: rawMessage || `Zed upstream error: ${response.status}`,
    };
  }

  async refreshCredentials() {
    // Zed uses a long-lived RSA-decrypted access_token — no OAuth refresh.
    return null;
  }

  needsRefresh() {
    return false;
  }
}

export default ZedExecutor;
