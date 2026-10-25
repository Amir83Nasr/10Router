import crypto from "node:crypto";
import { DefaultExecutor } from "./default.js";
import { resolveSessionId } from "../utils/sessionManager.js";
import { modelTargetFormat } from "../providers/models/schema.js";
import { getProviderModels, isFreeTierModel } from "../config/providerModels.js";
import { isMuseSparkModel } from "../providers/models/helpers.js";
import { applyFingerprintTools, detectToolShape } from "../utils/opencodeFingerprint.js";
import {
  baseModelId,
  normalizeSession,
  normalizeResponsesTools,
  sanitizeResponsesItems,
} from "./opencodeShared.js";
import { syntheticEntitlementResponse } from "../utils/opencodeFreeUsage.js";
import { parseOpenCodeAccountError } from "../utils/opencodeErrors.js";
import { normalizeResponsesInput } from "../translator/formats/responsesApi.js";

const SESSION_HEADER = "x-opencode-session";
const SESSION_FIELD = "_opencodeZenSession";
const RESPONSES_BASE_URL = "https://opencode.ai/inference/openai/v1/responses";
// OpenCode v2 UA shape: opencode/<channel>/<version>/<client>. Upstream rejects
// the v1 "opencode/1.18.x" form with 403 FreeTierError on free-tier models even
// when authenticated with a Zen API key on /inference/*.
const OPENCODE_UA = "opencode/latest/2.0.26/cli";
const OPENCODE_CLIENT = "cli";
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function hasValidOpencodeVersion(ua) {
  const m = String(ua || "").match(/^opencode\/[a-z0-9-]+\/(\d+)\.\d+\.\d+\/[a-z0-9-]+$/i);
  return !!m && parseInt(m[1], 10) >= 2;
}

function unstableRandom() {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

// Session prefix = 12 hex of ~(timeMs * 0x1000 + counter), low 48 bits, like the CLI.
// Upstream decodes it and rejects a non-small counter with 403 FreeTierError
// (live probes: counter 0–16 pass, >=100 fail), so the counter must stay real.
const SESSION_PREFIX_MASK = (1n << 48n) - 1n;
const SESSION_TIME_MASK = (1n << 36n) - 1n;

function descendingTimeHex(time, counterValue) {
  return (~(BigInt(time) * 0x1000n + BigInt(counterValue)) & SESSION_PREFIX_MASK)
    .toString(16)
    .padStart(12, "0");
}

export function generateSessionId(timestamp = Date.now()) {
  return `ses_${descendingTimeHex(timestamp, 1)}${unstableRandom()}`;
}

export function generateRequestId(timestamp = Date.now()) {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  const value = current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  return `msg_${time}${unstableRandom()}`;
}

export function translateSessionId(sessionId, clientTool = "") {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const digest = crypto
    .createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`)
    .digest();
  // Deterministic time field from the digest, counter pinned to 1 (what the CLI sends).
  const time = BigInt(`0x${digest.subarray(0, 5).toString("hex")}`) & SESSION_TIME_MASK;
  const timeHex = descendingTimeHex(time, 1);
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  return `ses_${timeHex}${randomPart}`;
}

function nativeSession(headers) {
  if (!headers || typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === SESSION_HEADER) {
      const normalized = normalizeSession(value);
      if (normalized && OPENCODE_SESSION_RE.test(normalized)) return normalized;
    }
  }
  return null;
}

function translatedSession(sessionId, clientTool) {
  return translateSessionId(sessionId, clientTool);
}

function isResponsesModel(model) {
  // PROVIDER_MODELS is keyed by alias ("ocz"), not provider id.
  const entry = getProviderModels("ocz").find((m) => m.id === baseModelId(model));
  return modelTargetFormat(entry) === "openai-responses";
}

export class OpenCodeZenExecutor extends DefaultExecutor {
  constructor() {
    super("opencode-zen");
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
        scope: "opencode-zen",
      });

    return {
      ...sourceCredentials,
      [SESSION_FIELD]: native || translatedSession(resolved, clientTool),
    };
  }

  async execute(args) {
    // Free-tier models are entitlement-gated on the keyed lane: upstream would
    // answer 429 FreeUsageLimitError and the request would burn a call (and trip
    // account fallback). Fail fast with the same shape + actionable message.
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
      parseOpenCodeAccountError(response, bodyText, { url: response?.url }) ||
      super.parseError(response, bodyText)
    );
  }

  buildHeaders(credentials, stream = true, url, model) {
    const headers = super.buildHeaders(credentials || {}, stream, url, model);
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;
    const downstreamUa = lower["user-agent"] || "";
    // Free-tier gate: spoof the official v2 client UA and session header mirrors.
    headers["User-Agent"] = hasValidOpencodeVersion(downstreamUa) ? downstreamUa : OPENCODE_UA;
    headers["x-opencode-client"] = lower["x-opencode-client"] || OPENCODE_CLIENT;
    headers["x-opencode-project"] = lower["x-opencode-project"] || "global";
    const session =
      credentials?.[SESSION_FIELD] ||
      this.prepareRequestCredentials({ credentials })[SESSION_FIELD];
    headers[SESSION_HEADER] = session;
    headers["x-opencode-session-id"] = session;
    headers["x-session-affinity"] = session;
    headers["x-session-id"] = session;
    return headers;
  }

  transformRequest(model, body, stream, credentials) {
    const out = super.transformRequest(model, body);
    // Free-tier gate: upstream 403s stream:false even when everything else is valid.
    if (out && typeof out === "object") out.stream = true;
    if (!isResponsesModel(model || body?.model)) {
      // Shape must match the body: a Claude transport (union-alpha, Qwen/GLM on
      // the Anthropic-compatible lane) reads input_schema, not chat envelopes.
      if (out && typeof out === "object") applyFingerprintTools(out, detectToolShape(out));
      return out;
    }
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
    applyFingerprintTools(out, true);
    return out;
  }
}
