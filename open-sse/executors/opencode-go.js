import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { modelTargetFormat } from "../providers/models/schema.js";
import { getProviderModels, isFreeTierModel } from "../config/providerModels.js";
import { normalizeResponsesInput } from "../translator/formats/responsesApi.js";
import {
  baseModelId,
  normalizeSession,
  normalizeResponsesTools,
  sanitizeResponsesItems,
} from "./opencodeShared.js";
import { syntheticEntitlementResponse } from "../utils/opencodeFreeUsage.js";
import { parseOpenCodeAccountError } from "../utils/opencodeErrors.js";

const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeGoSession";

const RESPONSES_BASE_URL = "https://opencode.ai/inference/go/openai/v1/responses";

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) return normalizeSession(value);
  }
  return null;
}

function translatedSession(sessionId, clientTool) {
  const digest = crypto
    .createHash("sha256")
    .update(`opencode-go\0${clientTool || "generic"}\0${sessionId}`)
    .digest("hex")
    .slice(0, 32);
  return `ses_${digest}`;
}

// Responses-only per the provider registry (grok-4.6, gpt-5.6-luna, muse-spark, …).
// Reading the registry keeps this in sync with config — never hardcode model ids here.
function isResponsesModel(model) {
  const entry = getProviderModels("opencode-go").find((m) => m.id === baseModelId(model));
  return modelTargetFormat(entry) === "openai-responses";
}

export class OpenCodeGoExecutor extends DefaultExecutor {
  constructor() {
    super("opencode-go");
  }

  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    // Muse Spark lives on /responses even when a stale runtimeTransport leaks in.
    if (isResponsesModel(model)) return RESPONSES_BASE_URL;
    return super.buildUrl(model, stream, urlIndex, credentials);
  }

  prepareRequestCredentials({ body, credentials, providerSessionId, clientTool } = {}) {
    const sourceCredentials = credentials || {};
    const native = nativeSession(sourceCredentials.rawHeaders);
    const resolved =
      normalizeSession(providerSessionId) ||
      resolveSessionId({
        headers: sourceCredentials.rawHeaders,
        body,
        connectionId: sourceCredentials.connectionId,
        scope: "opencode-go",
      });

    return {
      ...sourceCredentials,
      [SESSION_FIELD]: native || translatedSession(resolved, clientTool),
    };
  }

  async execute(args) {
    // Free-tier models belong to the unauthenticated free lane. A Go key cannot
    // unlock them, so answer with the same actionable entitlement error upstream
    // would return instead of spending a call.
    if (isFreeTierModel(this.provider, args?.model)) {
      return {
        response: syntheticEntitlementResponse(),
        url: this.buildUrl(args?.model),
        headers: {},
        transformedBody: args?.body,
      };
    }
    const credentials = this.prepareRequestCredentials(args);
    return super.execute({ ...args, credentials });
  }

  parseError(response, bodyText) {
    return (
      parseOpenCodeAccountError(response, bodyText, { go: true, url: response?.url }) ||
      super.parseError(response, bodyText)
    );
  }

  buildHeaders(credentials, stream = true, url, model) {
    const headers = super.buildHeaders(credentials || {}, stream, url, model);
    const prepared = credentials?.[SESSION_FIELD];
    if (prepared) {
      headers[SESSION_HEADER] = prepared;
      headers["x-opencode-session-id"] = prepared;
      return headers;
    }

    const fallback = this.prepareRequestCredentials({ credentials });
    headers[SESSION_HEADER] = fallback[SESSION_FIELD];
    headers["x-opencode-session-id"] = fallback[SESSION_FIELD];
    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    const out = super.transformRequest(model, body);
    if (!isResponsesModel(model || body?.model)) return out;
    const normalized = normalizeResponsesInput(out.input);
    if (normalized) out.input = normalized;
    if (!Array.isArray(out.input) || out.input.length === 0) {
      out.input = [
        { type: "message", role: "user", content: [{ type: "input_text", text: "..." }] },
      ];
    }
    // Responses names the output cap max_output_tokens, not max_tokens.
    if (out.max_output_tokens === undefined) {
      if (out.max_completion_tokens !== undefined)
        out.max_output_tokens = out.max_completion_tokens;
      else if (out.max_tokens !== undefined) out.max_output_tokens = out.max_tokens;
    }
    delete out.max_tokens;
    delete out.max_completion_tokens;
    if (out.reasoning_effort !== undefined && out.reasoning === undefined) {
      out.reasoning = { effort: out.reasoning_effort, summary: "auto" };
    }
    if (out.reasoning && typeof out.reasoning === "object" && !Array.isArray(out.reasoning)) {
      if (!out.reasoning.summary) out.reasoning.summary = "auto";
    }
    delete out.reasoning_effort;
    out.stream = true;
    out.store = false;
    normalizeResponsesTools(out);
    sanitizeResponsesItems(out);
    return out;
  }
}
