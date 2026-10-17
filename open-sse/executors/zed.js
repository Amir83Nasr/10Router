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

function buildProviderRequest(provider, model, body, stream, credentials) {
  if (provider === ZED_PROVIDER.anthropic) {
    return openaiToClaudeRequest(model, body, true);
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

function createErrorChunk(model, message) {
  return {
    id: `chatcmpl-zed-error-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta: { content: `[Zed error] ${message}` }, finish_reason: "stop" }],
  };
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

// SSE error frame in the shared buildErrorBody shape ({error:{message,type,
// code}}) so stream aggregation and clients treat it as a failure, not as
// assistant text. Never a fabricated finish_reason.
function createOverflowErrorFrame(message) {
  return `data: ${JSON.stringify({
    error: {
      message,
      type: "invalid_request_error",
      code: "context_length_exceeded",
    },
  })}\n\n`;
}

function wrapZedCompletionStream(response, provider, model) {
  if (!response.ok || !response.body) return response;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const state = initProviderState(provider, model);
  let buffer = "";
  let done = false;

  const finish = (controller) => {
    if (done) return;
    const finalChunk = convertProviderEvent(provider, null, state);
    enqueueSseObject(controller, encoder, finalChunk);
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
      if (status?.type === "failed" || status?.failed) {
        const failed = status.failed || status;
        const message = String(failed.message || failed.error || failed.code || "request failed");
        // Context overflow must be a clean error, not assistant text:
        // clients aggregate delta.content into the answer, and the fallback
        // layer keys off status — so emit the error frame + [DONE] with no
        // fabricated finish_reason, and skip the trailing translate flush.
        if (isContextOverflowText(message)) {
          controller.enqueue(
            encoder.encode(
              createOverflowErrorFrame(
                `Context window exceeded for ${model}: ${message}. ` +
                  `Shorten the conversation or use a larger model.`,
              ) + "data: [DONE]\n\n",
            ),
          );
          done = true;
        } else {
          enqueueSseObject(controller, encoder, createErrorChunk(model, message));
          finish(controller);
        }
      } else if (status?.type === "stream_ended" || status === "stream_ended") {
        finish(controller);
      }
      return;
    }
    const converted = convertProviderEvent(provider, payload.event, state);
    enqueueSseObject(controller, encoder, converted);
  };

  const transformed = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          processLine(line, controller);
        }
      },
      flush(controller) {
        buffer += decoder.decode();
        if (buffer) {
          processLine(buffer, controller);
          buffer = "";
        }
        finish(controller);
      },
    }),
  );

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
    const { raw, provider } = await this.resolveModel(
      model,
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
          log?.info?.("ZED", `trimmed history for ${model} to fit ${contextLimit} tokens`);
          requestBody = trimmed;
        }
      }
      const estimated = estimateInputTokens(requestBody);
      if (estimated > contextLimit) {
        const message =
          `Context window exceeded: ~${estimated} tokens exceeds the limit of ` +
          `${contextLimit} tokens for ${model}. Shorten the conversation or use a larger model.`;
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
          transformedBody: { model, estimatedInputTokens: estimated, contextLimit },
        };
      }
    }
    const providerRequest = buildProviderRequest(provider, model, requestBody, stream, credentials);
    const bodyRecord = requestBody;
    const payload = {
      thread_id: bodyRecord.thread_id || credentials?._clientSessionId,
      prompt_id: bodyRecord.prompt_id,
      provider,
      model,
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

    const wrapped = response.ok ? wrapZedCompletionStream(response, provider, model) : response;
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
