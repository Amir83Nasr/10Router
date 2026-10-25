import { describe, expect, it } from "vitest";

import {
  buildOpenCodeGoProbe,
  buildOpenCodeGoProbes,
} from "../../open-sse/services/opencodeGoProbe.js";
import { getDefaultModel } from "../../open-sse/config/providerModels.js";

const CHAT_URL = "https://opencode.ai/inference/go/openai/v1/chat/completions";
const MESSAGES_URL = "https://opencode.ai/inference/go/anthropic/v1/messages";

describe("OpenCode Go connection probe", () => {
  it("targets the registry chat-completions endpoint for the default model", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test");

    expect(probe.url).toBe(CHAT_URL);
  });

  it("authenticates with the bearer key and sends the executor session headers", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test");

    expect(probe.headers.Authorization).toBe("Bearer oc_sk_test");
    expect(probe.headers["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{32}$/);
    expect(probe.headers["x-opencode-session-id"]).toBe(probe.headers["x-opencode-session"]);
  });

  it("sends a minimal non-streaming chat request for the default model", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test");
    const body = JSON.parse(probe.body);

    expect(body).toEqual({
      model: getDefaultModel("opencode-go"),
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    });
  });

  it("does not put the API key in the request body", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test");

    expect(probe.body).not.toContain("oc_sk_test");
  });

  it("targets the anthropic messages endpoint for the claude format", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test", "claude");

    expect(probe.url).toBe(MESSAGES_URL);
  });

  it("authenticates the anthropic endpoint with x-api-key and the anthropic version", () => {
    const probe = buildOpenCodeGoProbe("oc_sk_test", "claude");

    expect(probe.headers["x-api-key"]).toBe("oc_sk_test");
    expect(probe.headers.Authorization).toBeUndefined();
    expect(probe.headers["anthropic-version"]).toBe("2023-06-01");
    expect(probe.headers["x-opencode-session"]).toMatch(/^ses_[0-9a-f]{32}$/);
  });

  it("sends a max_tokens request on the anthropic endpoint", () => {
    const body = JSON.parse(buildOpenCodeGoProbe("oc_sk_test", "claude").body);

    expect(body.max_tokens).toBe(1);
    expect(body.stream).toBe(false);
  });

  it("builds one probe per configured endpoint", () => {
    const urls = buildOpenCodeGoProbes("oc_sk_test").map((probe) => probe.url);

    expect(urls).toEqual([CHAT_URL, MESSAGES_URL]);
  });
});
