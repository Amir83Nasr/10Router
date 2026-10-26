import { describe, expect, it } from "vitest";
import {
  PROVIDER_MODELS,
  getModelSupportedFormats,
  getModelTargetFormat,
} from "../../open-sse/config/providerModels.js";
import { PROVIDERS } from "../../open-sse/config/providers.js";
import {
  resolveTransport,
  resolveFallbackTransport,
  resolveModelTransport,
} from "../../open-sse/services/provider.js";
import { OpenCodeGoExecutor } from "../../open-sse/executors/opencode-go.js";

// Matrix verified against the live Go endpoints: the docs table omits reachable
// models and lists protocols the gateway rejects with ModelProtocolUnsupported.
// No /messages endpoint. Most also answer /responses (verified); the two free
// models are Chat Completions only.
const NO_CLAUDE = [
  "glm-5.3-flash",
  "glm-5.3",
  "glm-5.2",
  "glm-5.1",
  "kimi-k2.7-code",
  "kimi-k2.6",
  "longcat-2.0",
  "mimo-v2.6-flash",
  "mimo-v2.6-pro",
  "mimo-v2.5",
  "mimo-v2.5-pro",
  "hy4-preview",
  "space-bunny-free",
  "longcat-2.5-preview-free",
];
// Models that also expose the Anthropic /messages endpoint.
const CLAUDE_CAPABLE = [
  "deepseek-v4.1-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
  "deepseek-v4-flash-vision-exp",
  "kimi-k3",
  "kimi-k3.1-pro",
  "minimax-m3",
  "minimax-m3.1-flash",
  "minimax-m2.7",
  "claude-haiku-5-5",
  "qwen3.8-max",
  "qwen3.8-flash",
  "qwen3.7-plus",
];
// Models that answer on Anthropic Messages only.
const CLAUDE_ONLY = ["claude-haiku-5-5", "minimax-m2.7"];
// Models served by /responses only.
const RESPONSES_ONLY = [
  "grok-4.7",
  "grok-4.6",
  "gpt-6-luna",
  "gpt-5.6-luna",
  "muse-spark-1.2-contributor",
  "muse-spark-1.3-contributor",
];

const ANTHROPIC_URL = "https://opencode.ai/inference/go/anthropic/v1/messages";
const RESPONSES_URL = "https://opencode.ai/inference/go/openai/v1/responses";
const CHAT_URL = "https://opencode.ai/inference/go/openai/v1/chat/completions";

// The same helper chatCore uses, so the expectations below cannot drift from routing.
function pickRoute(provider, sourceFormat, alias, model) {
  return resolveModelTransport(provider, sourceFormat, getModelSupportedFormats(alias, model));
}

describe("OpenCode Go model catalog", () => {
  it("matches the verified model IDs", () => {
    const ids = (PROVIDER_MODELS["opencode-go"] || []).map((m) => m.id);
    expect(ids).toEqual([
      "deepseek-v4.1-flash",
      "glm-5.3-flash",
      "glm-5.3",
      "glm-5.2",
      "glm-5.1",
      "kimi-k2.7-code",
      "kimi-k2.6",
      "kimi-k3",
      "kimi-k3.1-pro",
      "deepseek-v4-pro",
      "deepseek-v4-flash",
      "deepseek-v4-flash-vision-exp",
      "longcat-2.0",
      "mimo-v2.6-flash",
      "mimo-v2.6-pro",
      "mimo-v2.5",
      "mimo-v2.5-pro",
      "minimax-m3",
      "minimax-m3.1-flash",
      "minimax-m2.7",
      "claude-haiku-5-5",
      "qwen3.8-max",
      "qwen3.8-flash",
      "qwen3.7-plus",
      "hy4-preview",
      "hy3",
      "step-5-preview",
      "space-bunny-free",
      "longcat-2.5-preview-free",
      "beam-free",
      "gemini-4-argon",
      "grok-4.7",
      "grok-4.6",
      "gpt-6-luna",
      "gpt-5.6-luna",
      "muse-spark-1.2-contributor",
      "muse-spark-1.3-contributor",
    ]);
  });
});

describe("OpenCode Go thinking-suffix model lookup", () => {
  it("preserves Responses routing for gpt-5.6-luna thinking variants", () => {
    expect(getModelSupportedFormats("opencode-go", "gpt-5.6-luna(high)")).toEqual([
      "openai-responses",
    ]);
    expect(getModelTargetFormat("opencode-go", "gpt-5.6-luna(high)")).toBe("openai-responses");
  });

  it("preserves Responses routing for grok-4.6 thinking variants", () => {
    expect(getModelSupportedFormats("opencode-go", "grok-4.6(high)")).toEqual(["openai-responses"]);
    expect(getModelTargetFormat("opencode-go", "grok-4.6(high)")).toBe("openai-responses");
  });
});

describe("OpenCode Go per-model supportedFormats", () => {
  it("never declares claude for chat-only models", () => {
    for (const m of NO_CLAUDE) {
      expect(getModelSupportedFormats("opencode-go", m)).not.toContain("claude");
      expect(getModelSupportedFormats("opencode-go", m)).toContain("openai");
    }
  });

  it("declares [openai] only for the free chat models", () => {
    for (const m of ["space-bunny-free", "longcat-2.5-preview-free"]) {
      expect(getModelSupportedFormats("opencode-go", m)).toEqual(["openai"]);
    }
  });

  it("declares the claude endpoint for every Claude-capable model", () => {
    for (const m of CLAUDE_CAPABLE) {
      expect(getModelSupportedFormats("opencode-go", m)).toContain("claude");
    }
  });

  it("keeps claude-only models off the OpenAI wires", () => {
    for (const m of CLAUDE_ONLY) {
      expect(getModelSupportedFormats("opencode-go", m)).toEqual(["claude"]);
    }
  });

  it("declares [openai-responses] only for responses-only models", () => {
    for (const m of RESPONSES_ONLY) {
      expect(getModelSupportedFormats("opencode-go", m)).toEqual(["openai-responses"]);
    }
  });
});

describe("OpenCode Go multi-endpoint transports", () => {
  it("orders transports claude → openai → responses (fallback preference)", () => {
    const formats = (PROVIDERS["opencode-go"].transports || []).map((t) => t.format);
    expect(formats).toEqual(["claude", "openai", "openai-responses", "gemini"]);
  });

  it("resolveTransport picks the endpoint matching the client sourceFormat", () => {
    expect(resolveTransport("opencode-go", "claude").baseUrl).toBe(ANTHROPIC_URL);
    expect(resolveTransport("opencode-go", "openai-responses").baseUrl).toBe(RESPONSES_URL);
    expect(resolveTransport("opencode-go", "openai").baseUrl).toBe(CHAT_URL);
  });

  it("uses x-api-key + anthropicVersion on the claude transport", () => {
    const t = resolveTransport("opencode-go", "claude");
    expect(t.auth.header).toBe("x-api-key");
    expect(t.auth.anthropicVersion).toBe(true);
  });
});

describe("OpenCode Go per-model transport selection (chatCore logic)", () => {
  it("routes a claude-format client to /messages for Claude-capable models", () => {
    for (const m of CLAUDE_CAPABLE) {
      expect(pickRoute("opencode-go", "claude", "opencode-go", m)?.baseUrl).toBe(ANTHROPIC_URL);
    }
  });

  it("keeps an OpenAI client on /chat/completions when the model supports it", () => {
    for (const m of [...NO_CLAUDE, ...CLAUDE_CAPABLE.filter((m) => !CLAUDE_ONLY.includes(m))]) {
      expect(pickRoute("opencode-go", "openai", "opencode-go", m)?.baseUrl).toBe(CHAT_URL);
    }
  });

  it("falls back to /messages when the client format has no model endpoint", () => {
    // Regression: an OpenAI-format client requesting claude-haiku-5-5 used to be
    // sent to /chat/completions and rejected with ModelProtocolUnsupported.
    for (const m of CLAUDE_ONLY) {
      expect(pickRoute("opencode-go", "openai", "opencode-go", m)?.baseUrl).toBe(ANTHROPIC_URL);
    }
  });

  it("falls back to /chat/completions for a claude-format client on chat-only models", () => {
    for (const m of NO_CLAUDE) {
      expect(pickRoute("opencode-go", "claude", "opencode-go", m)?.baseUrl).toBe(CHAT_URL);
    }
  });

  it("routes responses-only models to /responses from every client format", () => {
    for (const m of RESPONSES_ONLY) {
      for (const src of ["claude", "openai", "openai-responses"]) {
        expect(pickRoute("opencode-go", src, "opencode-go", m)?.baseUrl).toBe(RESPONSES_URL);
      }
    }
  });

  it("prefers the Anthropic endpoint among fallbacks", () => {
    // A client wire with no endpoint of its own (gemini) makes the model's declared
    // endpoints the candidates; claude comes first per the registry order.
    expect(pickRoute("opencode-go", "gemini", "opencode-go", "qwen3.8-max")?.baseUrl).toBe(
      ANTHROPIC_URL,
    );
    expect(pickRoute("opencode-go", "gemini", "opencode-go", "glm-5.3")?.baseUrl).toBe(CHAT_URL);
  });

  it("leaves undeclared models on the upstream default transport", () => {
    expect(resolveFallbackTransport("opencode-go", null)).toBeNull();
  });
});

describe("OpenCode Go Google-wire model", () => {
  it("routes gemini-4-argon to the Google endpoint from every client format", () => {
    for (const src of ["claude", "openai", "openai-responses"]) {
      expect(pickRoute("opencode-go", src, "opencode-go", "gemini-4-argon")?.format).toBe("gemini");
    }
  });

  it("builds the model-scoped generateContent URL", () => {
    const executor = new OpenCodeGoExecutor();
    const credentials = {
      apiKey: "oc_sk_test",
      runtimeTransport: resolveTransport("opencode-go", "gemini"),
    };

    expect(executor.buildUrl("gemini-4-argon", false, 0, credentials)).toBe(
      "https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:generateContent",
    );
    expect(executor.buildUrl("gemini-4-argon", true, 0, credentials)).toBe(
      "https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse",
    );
  });

  it("authenticates the Google wire with x-goog-api-key", () => {
    const executor = new OpenCodeGoExecutor();
    const credentials = {
      apiKey: "oc_sk_test",
      runtimeTransport: resolveTransport("opencode-go", "gemini"),
    };
    const headers = executor.buildHeaders(credentials, false, undefined, "gemini-4-argon");

    expect(headers["x-goog-api-key"]).toBe("oc_sk_test");
    expect(headers["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{32}$/);
  });
});
