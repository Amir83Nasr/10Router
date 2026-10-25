// Zed context-overflow handling: overflow arrives as an in-stream
// `status:failed` frame on an HTTP-200 stream (cannot become a status code),
// so the executor must (1) pre-trim history to the catalog window, (2) fail
// fast 400 when the trimmed body still doesn't fit, (3) emit overflow as a
// clean in-band error frame (never assistant text), (4) parse non-200
// overflow bodies as 400 (request-scoped, no account lock).
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("open-sse/shared/zedAuth.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveZedModels: vi.fn(),
    zedLlmFetch: vi.fn(),
  };
});

import { resolveZedModels } from "open-sse/shared/zedAuth.js";
import ZedExecutor from "open-sse/executors/zed.js";

function catalogFor(entries) {
  return { rawById: new Map(entries), models: [] };
}

function makeExecutor() {
  const executor = new ZedExecutor();
  executor.config = {};
  return executor;
}

async function streamText(response) {
  return new Response(response.body).text();
}

const BIG_BODY = (chars) => ({ messages: [{ role: "user", content: "x".repeat(chars) }] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pre-send context guard", () => {
  // Multi-turn body: system + 20 turns of 20k chars (~100k+ tokens over the
  // 100k window). Trim keeps system + first 6 + trailing user run → fits.
  const overBody = () => ({
    messages: [
      { role: "system", content: "sys" },
      ...Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "y".repeat(20000),
      })),
      { role: "user", content: "latest question" },
    ],
  });

  it("trims history to the catalog window before sending", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    let sentBytes = 0;
    zedLlmFetch.mockImplementation(async (credentials, path, options) => {
      sentBytes = options.fetchOptions.body.length;
      return new Response("[DONE]", { status: 200 });
    });
    const executor = makeExecutor();
    const rawLen = JSON.stringify(overBody()).length;
    expect(rawLen / 4).toBeGreaterThan(100000); // sanity: actually over the window
    const { response } = await executor.execute({
      model: "m",
      body: overBody(),
      stream: false,
      credentials: {},
      log: { info: () => {}, warn: () => {} },
    });
    expect(response.status).toBe(200); // trimmed, sent, not fail-fast 400
    expect(sentBytes).toBeGreaterThan(0);
    expect(sentBytes).toBeLessThan(rawLen);
  });

  it("fails fast 400 when a single message exceeds the window", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100 }]]),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: BIG_BODY(4000),
      stream: false,
      credentials: {},
      log: {},
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("context_length_exceeded");
    expect(body.error.message).toMatch(/exceeds the limit of 100 tokens/);
  });

  it("sends untouched when under the window (no catalog limit, no regression)", async () => {
    resolveZedModels.mockResolvedValue(catalogFor([["m", { provider: "anthropic" }]]));
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    let sent = null;
    zedLlmFetch.mockImplementation(async (credentials, path, options) => {
      sent = JSON.parse(options.fetchOptions.body);
      return new Response("[DONE]", { status: 200 });
    });
    const executor = makeExecutor();
    const body = { messages: [{ role: "user", content: "hi" }] };
    await executor.execute({ model: "m", body, stream: false, credentials: {}, log: {} });
    // Anthropic translator reshapes messages — assert routing, not shape.
    expect(sent.provider).toBe("anthropic");
    expect(sent.model).toBe("m");
    expect(JSON.stringify(sent.provider_request)).toContain("hi");
  });
});

describe("failure as the first stream frame", () => {
  it("answers an overflow status:failed frame with a real 400, never assistant text", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(async () =>
      Response.json(
        { status: { failed: { message: "100637 tokens exceeds the limit of 100000 tokens" } } },
        { status: 200 },
      ),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    // Peeked before committing to HTTP 200, so the fallback layer sees a real
    // status: overflow is request-scoped (400, no account cooldown).
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("context_length_exceeded");
    expect(body.error.message).toMatch(/Shorten the conversation/);
  });

  it("answers any other first-frame failure with 502 JSON", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(async () =>
      Response.json({ status: { failed: { message: "upstream boom" } } }, { status: 200 }),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.message).toBe("upstream boom");
    expect(body.error.code).toBe("upstream_error");
  });

  it("maps a quota failure to 429 so the account fallback cools it down", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(async () =>
      Response.json(
        {
          status: {
            failed: { message: "rate limit reached for this account", code: "rate_limit" },
          },
        },
        { status: 200 },
      ),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    expect(response.status).toBe(429);
  });

  it("treats a non-JSON first frame as an upstream gateway error", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(
      async () => new Response("<html>bad gateway</html>\n", { status: 200 }),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_stream_frame");
  });
});

describe("failure after the stream has started", () => {
  const CONTENT_FRAME = JSON.stringify({
    event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hi" } },
  });

  it("emits an error frame + DONE without faking assistant text", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(
      async () =>
        new Response(`${CONTENT_FRAME}\n{"status":{"failed":{"message":"upstream boom"}}}\n`, {
          status: 200,
        }),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    // A payload frame already arrived, so the response is committed to 200.
    expect(response.status).toBe(200);
    const text = await streamText(response);
    expect(text).toContain('"content":"hi"');
    expect(text).toContain('"message":"upstream boom"');
    expect(text).toContain('"code":"upstream_error"');
    expect(text).toContain("data: [DONE]");
    expect(text).not.toContain("[Zed error]");
  });

  it("surfaces a typed provider error frame instead of dropping it", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(
      async () =>
        new Response(
          `${CONTENT_FRAME}\n{"event":{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}}\n`,
          { status: 200 },
        ),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    const text = await streamText(response);
    expect(text).toContain('"message":"Overloaded"');
    expect(text).toContain('"status":503');
    expect(text).toContain("data: [DONE]");
    expect(text).not.toContain("[Zed error]");
  });

  it("synthesizes a finish chunk when the stream ends without one", async () => {
    resolveZedModels.mockResolvedValue(
      catalogFor([["m", { provider: "anthropic", max_token_count: 100000 }]]),
    );
    const { zedLlmFetch } = await import("open-sse/shared/zedAuth.js");
    zedLlmFetch.mockImplementation(
      async () => new Response(`${CONTENT_FRAME}\ndata: [DONE]\n`, { status: 200 }),
    );
    const executor = makeExecutor();
    const { response } = await executor.execute({
      model: "m",
      body: { messages: [{ role: "user", content: "hi" }] },
      stream: true,
      credentials: {},
      log: {},
    });
    const text = await streamText(response);
    expect(text).toContain('"finish_reason":"stop"');
    expect(text).toContain("data: [DONE]");
  });
});

describe("parseError overflow", () => {
  it("normalizes overflow wording to 400 context_length_exceeded", () => {
    const executor = makeExecutor();
    const response = new Response("{}", { status: 413 });
    const parsed = executor.parseError(
      response,
      JSON.stringify({ message: "100637 tokens exceeds the limit of 100000 tokens" }),
    );
    expect(parsed.status).toBe(400);
    expect(parsed.message).toMatch(/Shorten the conversation/);
  });
});
