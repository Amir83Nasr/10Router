import { describe, expect, it, vi } from "vitest";

// ── DISPATCH-LEVEL EFFORT OBSERVABILITY ──────────────────────────────
// applyThinking discards a requested effort when the model cannot reason. On a
// fallback combo that is invisible: the request succeeds, so nothing tells the
// operator their selection was dropped on rung 4. chatCore must say so once,
// without changing the outcome.

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({
    noAuth: true,
    execute: vi.fn(async () => ({
      response: new Response(
        JSON.stringify({
          id: "c1",
          object: "chat.completion",
          created: 1,
          model: "m",
          choices: [
            { index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
      url: "https://upstream.test/v1",
      headers: {},
      transformedBody: null,
      responseFormat: "openai",
    })),
  }),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logProviderResponse: vi.fn(),
    logConvertedResponse: vi.fn(),
    logOpenAIRequest: vi.fn(),
    logError: vi.fn(),
  }),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
const { FORMATS } = await import("../../open-sse/translator/formats.js");

const makeLog = () => {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), line: vi.fn() };
  log.fmtThink = (intent) =>
    !intent
      ? null
      : intent.mode === "none"
        ? "off"
        : intent.mode === "level"
          ? intent.level
          : "auto";
  return log;
};

const claudeRequest = (provider, model) => ({
  body: {
    model,
    max_tokens: 1024,
    system: "You are Claude Code.",
    messages: [{ role: "user", content: "hello" }],
    thinking: { type: "adaptive", display: "updates" },
    output_config: { effort: "high" },
  },
  modelInfo: { provider, model },
  credentials: { rawHeaders: {} },
  clientRawRequest: {
    endpoint: "/v1/messages",
    body: {},
    headers: { "user-agent": "claude-cli/2.1.306" },
  },
  connectionId: "c1",
  log: makeLog(),
  sourceFormatOverride: FORMATS.CLAUDE,
});

const warnings = (log) => log.warn.mock.calls.filter(([tag]) => tag === "THINKING");

describe("unsupported effort is observable", () => {
  it("warns when the routed model cannot reason", async () => {
    const request = claudeRequest("opencode", "mimo-v2.6-flash-free");
    const result = await handleChatCore(request);

    expect(result?.success).toBe(true);
    const [tag, message] = warnings(request.log)[0] ?? [];
    expect(tag).toBe("THINKING");
    expect(message).toContain("mimo-v2.6-flash-free");
    expect(message).toContain("high");
  });

  it("does not warn for a reasoning model", async () => {
    const request = claudeRequest("opencode", "deepseek-v4.1-flash-free");
    await handleChatCore(request);
    expect(warnings(request.log)).toHaveLength(0);
  });

  it("does not warn when no effort was requested", async () => {
    const request = claudeRequest("opencode", "mimo-v2.6-flash-free");
    delete request.body.thinking;
    delete request.body.output_config;
    await handleChatCore(request);
    expect(warnings(request.log)).toHaveLength(0);
  });

  it("does not warn when thinking was explicitly disabled", async () => {
    const request = claudeRequest("opencode", "mimo-v2.6-flash-free");
    request.body.thinking = { type: "disabled" };
    delete request.body.output_config;
    await handleChatCore(request);
    expect(warnings(request.log)).toHaveLength(0);
  });

  it("still drops the field — reporting does not change the request", async () => {
    const request = claudeRequest("opencode", "mimo-v2.6-flash-free");
    const result = await handleChatCore(request);
    expect(result?.success).toBe(true);
  });
});
