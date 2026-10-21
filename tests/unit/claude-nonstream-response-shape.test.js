import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/usageDb.js", () => ({
  appendRequestLog: vi.fn(async () => {}),
  saveRequestDetail: vi.fn(async () => {}),
  saveRequestUsage: vi.fn(async () => {}),
}));

const { FORMATS } = await import("../../open-sse/translator/formats.js");
const { chatCompletionToClaudeMessage } =
  await import("../../open-sse/handlers/chatCore/claudeMessageBody.js");
const { translateNonStreamingResponse } =
  await import("../../open-sse/handlers/chatCore/nonStreamingHandler.js");
const { handleForcedSSEToJson } =
  await import("../../open-sse/handlers/chatCore/sseToJsonHandler.js");

// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// A Claude-format client routed to a chat-native provider used to receive a raw
// `chat.completion` body from `/v1/messages`. Claude Code reads
// `message.content[]`, so it threw a TypeError — surfacing as "Auto mode check
// unavailable" on every auto-mode classifier call, which is the only
// non-streaming request it makes. These tests pin the Claude shape on both
// non-streaming paths.

const CHAT_BODY = {
  id: "chatcmpl-abc123",
  object: "chat.completion",
  created: 1700000000,
  model: "deepseek-v4.1-flash-free",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "<block>no</block>" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 7, total_tokens: 107 },
};

describe("chat completion → Claude message", () => {
  it("produces an Anthropic message with a text block", () => {
    const out = chatCompletionToClaudeMessage(CHAT_BODY);
    expect(out.type).toBe("message");
    expect(out.role).toBe("assistant");
    expect(out.content).toEqual([{ type: "text", text: "<block>no</block>" }]);
    expect(out.stop_reason).toBe("end_turn");
    expect(out.id).toBe("abc123");
  });

  it("maps finish reasons onto Claude stop reasons", () => {
    const toolBody = structuredClone(CHAT_BODY);
    toolBody.choices[0].finish_reason = "tool_calls";
    expect(chatCompletionToClaudeMessage(toolBody).stop_reason).toBe("tool_use");

    const cutBody = structuredClone(CHAT_BODY);
    cutBody.choices[0].finish_reason = "length";
    expect(chatCompletionToClaudeMessage(cutBody).stop_reason).toBe("max_tokens");
  });

  it("turns tool_calls into tool_use blocks with parsed input", () => {
    const body = structuredClone(CHAT_BODY);
    body.choices[0].message = {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", type: "function", function: { name: "Bash", arguments: '{"a":1}' } },
      ],
    };
    body.choices[0].finish_reason = "tool_calls";

    const out = chatCompletionToClaudeMessage(body);
    expect(out.content).toEqual([
      { type: "tool_use", id: "call_1", name: "Bash", input: { a: 1 } },
    ]);
  });

  it("reports cached tokens outside input_tokens, as Anthropic does", () => {
    const body = structuredClone(CHAT_BODY);
    body.usage = {
      prompt_tokens: 1000,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 800 },
    };
    const out = chatCompletionToClaudeMessage(body);
    expect(out.usage.input_tokens).toBe(200);
    expect(out.usage.cache_read_input_tokens).toBe(800);
    expect(out.usage.output_tokens).toBe(10);
  });

  it("never returns a body without a content array (the client's TypeError)", () => {
    const out = chatCompletionToClaudeMessage({
      choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
    });
    expect(Array.isArray(out.content)).toBe(true);
    expect(out.type).toBe("message");
  });
});

describe("non-streaming translation picks the Claude shape", () => {
  it("converts when the client spoke Claude and the upstream spoke OpenAI", () => {
    const out = translateNonStreamingResponse(CHAT_BODY, FORMATS.OPENAI, FORMATS.CLAUDE);
    expect(out.type).toBe("message");
    expect(out.content[0]).toEqual({ type: "text", text: "<block>no</block>" });
  });

  it("leaves an OpenAI client on chat.completion", () => {
    const out = translateNonStreamingResponse(CHAT_BODY, FORMATS.OPENAI, FORMATS.OPENAI);
    expect(out.object).toBe("chat.completion");
  });

  it("converts a Gemini upstream body for a Claude client", () => {
    const gemini = {
      response: {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "<severity>0</severity>" }] },
            finishReason: "STOP",
            index: 0,
          },
        ],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 },
        modelVersion: "gemini",
        responseId: "r1",
      },
    };
    const out = translateNonStreamingResponse(gemini, FORMATS.GEMINI, FORMATS.CLAUDE);
    expect(out.type).toBe("message");
    expect(out.content).toEqual([{ type: "text", text: "<severity>0</severity>" }]);
  });
});

describe("forced-SSE-to-JSON returns the Claude shape", () => {
  const ctx = (sourceFormat) => {
    const encoder = new TextEncoder();
    const raw = [
      'data: {"id":"chatcmpl-sse","object":"chat.completion.chunk","created":1700000000,"model":"gpt-x","choices":[{"delta":{"content":"<block>no</block>"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-sse","object":"chat.completion.chunk","created":1700000000,"model":"gpt-x","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    return {
      providerResponse: new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(raw));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
      sourceFormat,
      targetFormat: FORMATS.OPENAI,
      provider: "opencode",
      model: "gpt-x",
      body: { model: "gpt-x", messages: [] },
      stream: false,
      requestStartTime: Date.now(),
      connectionId: "test-connection",
      clientRawRequest: { endpoint: "/v1/messages" },
      trackDone: vi.fn(),
      appendLog: vi.fn(),
    };
  };

  it("answers a Claude client with a message, not a chat.completion", async () => {
    const result = await handleForcedSSEToJson(ctx(FORMATS.CLAUDE));
    expect(result.success).toBe(true);
    const json = await result.response.json();
    expect(json.type).toBe("message");
    expect(json.object).toBeUndefined();
    expect(json.content[0]).toEqual({ type: "text", text: "<block>no</block>" });
    expect(json.stop_reason).toBe("end_turn");
  });

  it("still answers a chat client with chat.completion", async () => {
    const result = await handleForcedSSEToJson(ctx(FORMATS.OPENAI));
    const json = await result.response.json();
    expect(json.object).toBe("chat.completion");
  });
});
