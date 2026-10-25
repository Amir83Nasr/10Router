import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: fetchMock,
}));

const dbMocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => dbMocks);
vi.mock("@/lib/network/connectionProxy", () => ({
  pickProxyPoolId: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { DefaultExecutor } from "../../open-sse/executors/default.js";
import { getExecutor } from "../../open-sse/executors/index.js";
import { checkFallbackError } from "../../open-sse/services/accountFallback.js";
import { parseUpstreamError } from "../../open-sse/utils/error.js";
import { clearFreeUsageBreaker } from "../../open-sse/utils/opencodeFreeUsage.js";

const { markAccountUnavailable } = await import("../../src/sse/services/auth.js");

const ENTITLEMENT_429 = JSON.stringify({
  type: "error",
  error: {
    type: "FreeUsageLimitError",
    message:
      "Free usage limit reached. Free models work in OpenCode (https://opencode.ai); subscribe to OpenCode Go to keep going: https://opencode.ai/go",
  },
});

const QUOTA_429 = JSON.stringify({
  type: "error",
  error: { type: "FreeUsageLimitError", message: "Rate limit exceeded. Please try again later." },
  metadata: {},
});

const FUNDS_402 = JSON.stringify({
  type: "error",
  error: { type: "api_error", message: "Upstream request failed: Insufficient account funds" },
});

const SESSION_400 = JSON.stringify({
  type: "error",
  error: {
    type: "MissingSessionID",
    message: "Request is missing x-opencode-session and cannot be routed efficiently.",
  },
});

const response = (status, body) =>
  new Response(body, { status, headers: { "content-type": "application/json" } });

const CREDS = { connectionId: "noauth", rawHeaders: {} };
const BODY = { messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  clearFreeUsageBreaker();
  fetchMock.mockReset();
  dbMocks.getProviderConnections.mockReset();
  dbMocks.updateProviderConnection.mockReset();
});

describe("OpenCode entitlement 429 (free models through an API key)", () => {
  it("returns an actionable message instead of the bare plan gate", async () => {
    const executor = getExecutor("opencode");
    const parsed = executor.parseError(response(429, ENTITLEMENT_429), ENTITLEMENT_429);

    expect(parsed.kind).toBe("entitlement");
    expect(parsed.message).toMatch(/free models work in opencode/i);
    expect(parsed.message).toMatch(/opencode ai\/go|opencode\.ai\/go/i);
    expect(parsed.message).toMatch(/paid\/top-up|own provider key/i);
    expect(parsed.resetsAtMs).toBeNull();
  });

  it("does not trip the local quota breaker (next call reaches upstream again)", async () => {
    const executor = getExecutor("opencode");
    fetchMock.mockResolvedValue(response(429, ENTITLEMENT_429));

    for (let i = 0; i < 2; i++) {
      const result = await executor.execute({
        model: "big-pickle",
        body: BODY,
        stream: true,
        credentials: CREDS,
      });
      expect(result.response.status).toBe(429);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the quota-window breaker behaviour for the rate-limit 429", async () => {
    const executor = getExecutor("opencode");
    fetchMock.mockResolvedValue(response(429, QUOTA_429));

    await executor.execute({ model: "big-pickle", body: BODY, stream: true, credentials: CREDS });
    const second = await executor.execute({
      model: "big-pickle",
      body: BODY,
      stream: true,
      credentials: CREDS,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.response.headers.get("retry-after")).toBeTruthy();
  });

  it("does not cool down or fall back a keyed account for the entitlement", () => {
    const parsed = { message: "" };
    const executor = getExecutor("opencode");
    parsed.message = executor.parseError(response(429, ENTITLEMENT_429), ENTITLEMENT_429).message;

    expect(checkFallbackError(429, parsed.message)).toEqual({
      shouldFallback: false,
      cooldownMs: 0,
    });
  });
});

describe("OpenCode free-tier models on keyed lanes", () => {
  it("fails fast on Zen without calling upstream", async () => {
    const executor = getExecutor("opencode-zen");
    const result = await executor.execute({
      model: "mimo-v2.5-free",
      body: BODY,
      stream: true,
      credentials: { apiKey: "oc_sk_test", connectionId: "zen-a", rawHeaders: {} },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.response.status).toBe(429);
    const parsed = executor.parseError(result.response, await result.response.clone().text());
    expect(parsed.kind).toBe("entitlement");
    expect(parsed.message).toMatch(/free models work in opencode/i);
  });

  it("fails fast on Go without calling upstream", async () => {
    const executor = getExecutor("opencode-go");
    const result = await executor.execute({
      model: "space-bunny-free",
      body: BODY,
      stream: true,
      credentials: { apiKey: "oc_sk_test", connectionId: "go-a", rawHeaders: {} },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.response.status).toBe(429);
  });
});

describe("OpenCode keyed-lane account errors", () => {
  it("maps 402 insufficient funds to a billing message and keeps the 402 cooldown", () => {
    const executor = getExecutor("opencode-zen");
    const parsed = executor.parseError(response(402, FUNDS_402), FUNDS_402);

    expect(parsed.status).toBe(402);
    expect(parsed.kind).toBe("insufficient_funds");
    expect(parsed.message).toMatch(/insufficient account funds/i);
    expect(parsed.message).toMatch(/top up/i);

    const fallback = checkFallbackError(402, parsed.message);
    expect(fallback.shouldFallback).toBe(true);
    expect(fallback.cooldownMs).toBeGreaterThan(0);
  });

  it("marks the account unavailable on 402 (dashboard state)", async () => {
    dbMocks.getProviderConnections.mockResolvedValue([
      { id: "zen-a", provider: "opencode-zen", name: "zen-a", backoffLevel: 0 },
    ]);
    const executor = getExecutor("opencode-zen");
    const parsed = executor.parseError(response(402, FUNDS_402), FUNDS_402);

    const result = await markAccountUnavailable(
      "zen-a",
      402,
      parsed.message,
      "opencode-zen",
      "claude-opus-5",
    );

    expect(result.shouldFallback).toBe(true);
    expect(dbMocks.updateProviderConnection).toHaveBeenCalledWith(
      "zen-a",
      expect.objectContaining({
        testStatus: "unavailable",
        errorCode: 402,
        "modelLock_claude-opus-5": expect.any(String),
      }),
    );
  });

  it("maps MissingSessionID on Go paths only", async () => {
    const go = await parseUpstreamError(response(400, SESSION_400), getExecutor("opencode-go"));
    expect(go.statusCode).toBe(400);
    expect(go.message).toMatch(/x-opencode-session/i);
    expect(go.message).toMatch(/\/inference\/go/);

    const zen = await parseUpstreamError(response(400, SESSION_400), getExecutor("opencode-zen"));
    expect(zen.statusCode).toBe(400);
    expect(zen.message).toMatch(/Request is missing x-opencode-session/);
    expect(zen.message).not.toMatch(/do not strip these headers/i);
  });
});

describe("parseUpstreamError envelope normalization", () => {
  it("extracts Anthropic error messages instead of returning raw JSON", async () => {
    const body = JSON.stringify({
      type: "error",
      error: { type: "overloaded_error", message: "Overloaded" },
    });
    const parsed = await parseUpstreamError(response(429, body), new DefaultExecutor("openai"));
    expect(parsed).toEqual({ statusCode: 429, message: "Overloaded", resetsAtMs: undefined });
  });

  it("extracts Google error messages, including array envelopes", async () => {
    const body = JSON.stringify([
      { error: { code: 400, message: "API key not valid", status: "INVALID_ARGUMENT" } },
    ]);
    const parsed = await parseUpstreamError(response(400, body), new DefaultExecutor("openai"));
    expect(parsed.statusCode).toBe(400);
    expect(parsed.message).toBe("API key not valid");
  });

  it("uses the same shape for OpenAI envelopes", async () => {
    const body = JSON.stringify({ error: { message: "bad request", type: "invalid_request" } });
    const parsed = await parseUpstreamError(response(400, body), new DefaultExecutor("openai"));
    expect(parsed.statusCode).toBe(400);
    expect(parsed.message).toBe("bad request");
  });
});
