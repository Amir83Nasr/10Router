// zedFetchWithRetry guards every Zed call (token exchange, catalog, completions)
// with a connect deadline: a hung socket used to block the request until the
// client gave up. A connect timeout is ours, so it is retried like a transient
// socket failure; a caller abort is not.
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

vi.mock("../../open-sse/config/runtimeConfig.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    // Keep the retry shape without the multi-second waits.
    DEFAULT_RETRY_CONFIG: {
      ...actual.DEFAULT_RETRY_CONFIG,
      502: { attempts: 2, delayMs: 0 },
    },
  };
});

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { clearZedCaches, zedLlmFetch } from "../../open-sse/shared/zedAuth.js";

const CREDENTIALS = {
  accessToken: "token-1",
  providerSpecificData: { userId: "user-1", systemId: "sys-1", organizationId: "org-1" },
};

function json(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Never resolves on its own; fails as soon as the merged signal aborts. */
function hang(options) {
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    const fail = () => reject(signal?.reason ?? new Error("aborted"));
    if (!signal) return;
    // A signal aborted before the call (caller abort) dispatches no later event.
    if (signal.aborted) return fail();
    signal.addEventListener("abort", fail);
  });
}

/**
 * Route the auth endpoints so only the requested path can hang; record the
 * calls so retries and signal threading are observable.
 */
function routedFetch(hangPath) {
  const calls = [];
  proxyAwareFetch.mockImplementation((url, options) => {
    const target = String(url);
    calls.push({ target, options });
    if (target.endsWith(hangPath)) return hang(options);
    if (target.endsWith("/client/llm_tokens")) return Promise.resolve(json({ token: "llm-token" }));
    if (target.endsWith("/client/users/me")) {
      return Promise.resolve(json({ organizations: [{ id: "org-1", is_personal: true }] }));
    }
    return Promise.resolve(json({}));
  });
  return calls;
}

const callsTo = (calls, suffix) => calls.filter((call) => call.target.endsWith(suffix));

beforeEach(() => {
  vi.clearAllMocks();
  clearZedCaches();
});

describe("Zed connect timeout", () => {
  it("retries a hung connect deadline and then fails with a clear message", async () => {
    const calls = routedFetch("/completions");

    await expect(
      zedLlmFetch(CREDENTIALS, "/completions", {
        fetchOptions: { method: "POST", body: "{}" },
        connectTimeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out after 20ms/);

    // attempts: 2 → the initial call plus two retries.
    expect(callsTo(calls, "/completions")).toHaveLength(3);
  });

  it("bounds the token exchange with the same deadline", async () => {
    const calls = routedFetch("/client/llm_tokens");

    await expect(
      zedLlmFetch(CREDENTIALS, "/completions", {
        fetchOptions: { method: "POST", body: "{}" },
        connectTimeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out after 20ms/);

    expect(callsTo(calls, "/completions")).toHaveLength(0);
  });

  it("does not retry a caller abort and lets it propagate", async () => {
    const calls = routedFetch("/completions");

    const controller = new AbortController();
    const pending = zedLlmFetch(CREDENTIALS, "/completions", {
      fetchOptions: { method: "POST", body: "{}" },
      connectTimeoutMs: 60_000,
      signal: controller.signal,
    });
    controller.abort(new DOMException("client went away", "AbortError"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(callsTo(calls, "/completions")).toHaveLength(1);
  });

  it("passes a live signal through to the transport", async () => {
    const calls = routedFetch("/completions");

    const controller = new AbortController();
    await zedLlmFetch(CREDENTIALS, "/models", {
      fetchOptions: { method: "GET" },
      signal: controller.signal,
    });

    const [call] = callsTo(calls, "/models");
    expect(call.options.signal).toBeDefined();
    expect(call.options.signal.aborted).toBe(false);
  });
});
