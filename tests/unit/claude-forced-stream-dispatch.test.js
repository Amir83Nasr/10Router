import { beforeEach, describe, expect, it, vi } from "vitest";

// ── DISPATCH-LEVEL TESTS ─────────────────────────────────────────────
// These exercise handleChatCore end to end: request negotiation → executor →
// response aggregation → client body. Claude Code's auto-mode classifier is a
// non-streaming /v1/messages call against a forced-stream provider, so every
// case below is a real path through the gateway, not a converter in isolation.
//
// Only the executor and the persistence/logging side effects are mocked. The
// translators, the SSE aggregators and the response handlers all run for real.

const { executeMock } = vi.hoisted(() => ({ executeMock: vi.fn() }));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: () => ({
    noAuth: true,
    execute: executeMock,
    refreshCredentials: vi.fn().mockResolvedValue(null),
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

const log = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });

const classifierBody = (overrides = {}) => ({
  model: "oc/some-free-model",
  max_tokens: 32,
  system: "Classify the command's safety. Output <severity>N</severity>.",
  messages: [{ role: "user", content: "<transcript>x</transcript>" }],
  stop_sequences: ["</severity>"],
  ...overrides,
});

const openAIBody = (overrides = {}) => ({
  model: "gpt-x",
  messages: [{ role: "user", content: "hello" }],
  ...overrides,
});

function chatChunk(delta, finish = null) {
  return {
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: 1,
    model: "m",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
}

function chatSSE(chunks, usage) {
  const frames = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`);
  if (usage) {
    frames.push(
      `data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", created: 1, model: "m", choices: [], usage })}\n\n`,
    );
  }
  frames.push("data: [DONE]\n\n");
  return frames.join("");
}

const sseResponse = (raw) =>
  new Response(raw, { status: 200, headers: { "content-type": "text/event-stream" } });

const jsonResponse = (body) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function mockExecutor(response, responseFormat = FORMATS.OPENAI) {
  executeMock.mockResolvedValue({
    response,
    url: "https://upstream.test/v1",
    headers: {},
    transformedBody: null,
    responseFormat,
  });
}

const options = ({ body, provider = "opencode", endpoint = "/v1/messages", headers = {} }) => ({
  body,
  modelInfo: { provider, model: body.model.split("/").pop() },
  credentials: { rawHeaders: {} },
  clientRawRequest: { endpoint, body, headers },
  connectionId: "c1",
  log: log(),
  sourceFormatOverride: endpoint.endsWith("/messages")
    ? FORMATS.CLAUDE
    : endpoint.endsWith("/responses")
      ? FORMATS.OPENAI_RESPONSES
      : FORMATS.OPENAI,
});

const json = async (result) => {
  expect(result?.success, "handler must not report failure").toBe(true);
  return result.response.json();
};

const expectClaudeMessage = (message) => {
  expect(message.type).toBe("message");
  expect(message.role).toBe("assistant");
  expect(Array.isArray(message.content)).toBe(true);
  expect(message.choices).toBeUndefined();
  expect(typeof message.stop_reason).toBe("string");
};

const contentText = (message) =>
  message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

describe("Claude client behind a forced-stream provider", () => {
  beforeEach(() => executeMock.mockReset());

  it("answers an omitted stream with JSON and the Anthropic message shape", async () => {
    mockExecutor(
      sseResponse(
        chatSSE([chatChunk({ content: "<severity>0</severity>" }), chatChunk({}, "stop")], {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14,
        }),
      ),
    );

    const result = await handleChatCore(options({ body: classifierBody() }));

    // The provider still streams upstream — forceStream is untouched.
    expect(executeMock.mock.calls[0][0].stream).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("application/json");

    const message = await json(result);
    expectClaudeMessage(message);
    expect(contentText(message)).toBe("<severity>0</severity>");
    expect(message.stop_reason).toBe("end_turn");
    expect(message.usage.input_tokens).toBe(10);
    expect(message.usage.output_tokens).toBe(4);
  });

  it("preserves tool_use blocks and their parsed arguments", async () => {
    mockExecutor(
      sseResponse(
        chatSSE([
          chatChunk({
            tool_calls: [
              {
                index: 0,
                id: "call_1",
                type: "function",
                function: { name: "Bash", arguments: '{"command":' },
              },
            ],
          }),
          chatChunk({
            tool_calls: [{ index: 0, function: { arguments: '"ls -la"}' } }],
          }),
          chatChunk({}, "tool_calls"),
        ]),
      ),
    );

    const message = await json(
      await handleChatCore(options({ body: classifierBody({ tools: [{ name: "Bash" }] }) })),
    );

    expectClaudeMessage(message);
    expect(message.content).toContainEqual({
      type: "tool_use",
      id: "call_1",
      name: "Bash",
      input: { command: "ls -la" },
    });
    expect(message.stop_reason).toBe("tool_use");
  });

  it("maps a length finish reason onto max_tokens", async () => {
    mockExecutor(
      sseResponse(chatSSE([chatChunk({ content: "<severity>" }), chatChunk({}, "length")])),
    );
    const message = await json(await handleChatCore(options({ body: classifierBody() })));
    expect(message.stop_reason).toBe("max_tokens");
  });

  it("aggregates a Claude-dialect upstream instead of returning an empty message", async () => {
    const claudeSSE = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"union-alpha","content":[],"usage":{"input_tokens":9,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"<severity>0</severity>"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join("");
    mockExecutor(sseResponse(claudeSSE), FORMATS.CLAUDE);

    const message = await json(await handleChatCore(options({ body: classifierBody() })));

    expectClaudeMessage(message);
    expect(contentText(message)).toBe("<severity>0</severity>");
    expect(message.stop_reason).toBe("end_turn");
    // message_start usage must survive the message_delta merge.
    expect(message.usage.input_tokens).toBe(9);
    expect(message.usage.output_tokens).toBe(4);
  });

  it("aggregates a Claude-target provider that answers in chat dialect", async () => {
    // The executor reports the requested format, not the reply's. Some providers
    // answer their Claude transport in OpenAI dialect (documented for
    // xiaomi-tokenplan), so the dialect must come from the payload.
    mockExecutor(
      sseResponse(
        chatSSE([chatChunk({ content: "<severity>0</severity>" }), chatChunk({}, "stop")]),
      ),
      FORMATS.CLAUDE,
    );

    const message = await json(await handleChatCore(options({ body: classifierBody() })));

    expectClaudeMessage(message);
    expect(contentText(message)).toBe("<severity>0</severity>");
  });

  it("fails the request when tool arguments are truncated mid-stream", async () => {
    const claudeSSE = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"m","content":[],"usage":{"input_tokens":5,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"Bash","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\":"}}\n\n',
    ].join("");
    mockExecutor(sseResponse(claudeSSE), FORMATS.CLAUDE);

    const result = await handleChatCore(options({ body: classifierBody() }));

    // A half-parsed tool call must never reach the client as a success.
    expect(result.success).toBe(false);
    expect(result.status).toBe(502);
  });

  it("falls back to the JSON handler when the provider ignores stream", async () => {
    mockExecutor(
      jsonResponse({
        id: "chatcmpl-3",
        object: "chat.completion",
        created: 1,
        model: "m",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "<severity>0</severity>" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    );

    const result = await handleChatCore(options({ body: classifierBody() }));

    expect(result.response.headers.get("content-type")).toContain("application/json");
    const message = await json(result);
    expectClaudeMessage(message);
    expect(contentText(message)).toBe("<severity>0</severity>");
  });

  it("reports an upstream error frame instead of a successful empty turn", async () => {
    mockExecutor(
      sseResponse(
        `data: ${JSON.stringify({ error: { type: "invalid_request_error", message: "bad request" } })}\n\n`,
      ),
    );

    const result = await handleChatCore(options({ body: classifierBody() }));
    expect(result.success).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("bad request");
  });

  it("keeps explicit streaming for a Claude client", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    const result = await handleChatCore(
      options({ body: classifierBody({ stream: true }), headers: { accept: "text/event-stream" } }),
    );

    expect(executeMock.mock.calls[0][0].stream).toBe(true);
    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("honours Accept: text/event-stream when stream is omitted", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    const result = await handleChatCore(
      options({ body: classifierBody(), headers: { accept: "text/event-stream" } }),
    );

    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
  });
});

describe("Claude client behind an ordinary provider", () => {
  beforeEach(() => executeMock.mockReset());

  it("does not ask an ordinary provider to stream when stream is omitted", async () => {
    mockExecutor(
      jsonResponse({
        id: "chatcmpl-2",
        object: "chat.completion",
        created: 1,
        model: "m",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "<severity>0</severity>" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    );

    const result = await handleChatCore(
      options({ body: classifierBody(), provider: "deepseek", endpoint: "/v1/messages" }),
    );

    expect(executeMock.mock.calls[0][0].stream).toBe(false);
    const message = await json(result);
    expectClaudeMessage(message);
    expect(contentText(message)).toBe("<severity>0</severity>");
  });

  it("aggregates an SSE body even though the request asked for JSON", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    const message = await json(
      await handleChatCore(
        options({ body: classifierBody(), provider: "deepseek", endpoint: "/v1/messages" }),
      ),
    );
    expectClaudeMessage(message);
    expect(contentText(message)).toBe("hi");
  });
});

describe("other client formats are unchanged", () => {
  beforeEach(() => executeMock.mockReset());

  it("aggregates for an OpenAI chat request that omits stream on a forced provider", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    // openai is forceStream: the upstream still streams, and the JSON client
    // keeps receiving the aggregated body it always has.
    const result = await handleChatCore(
      options({ body: openAIBody(), provider: "openai", endpoint: "/v1/chat/completions" }),
    );

    expect(executeMock.mock.calls[0][0].stream).toBe(true);
    const body = await json(result);
    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toBe("hi");
  });

  it("keeps a non-forced OpenAI SSE client streaming", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    const result = await handleChatCore(
      options({ body: openAIBody(), provider: "groq", endpoint: "/v1/chat/completions" }),
    );

    expect(result.response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("answers an OpenAI JSON client with chat.completion", async () => {
    mockExecutor(
      sseResponse(
        chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")], {
          prompt_tokens: 3,
          completion_tokens: 1,
          total_tokens: 4,
        }),
      ),
    );

    const body = await json(
      await handleChatCore(
        options({
          body: openAIBody({ stream: false }),
          provider: "openai",
          endpoint: "/v1/chat/completions",
        }),
      ),
    );

    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toBe("hi");
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage.prompt_tokens).toBe(3);
  });

  it("answers a Responses client with the response object, not chat.completion", async () => {
    mockExecutor(sseResponse(chatSSE([chatChunk({ content: "hi" }), chatChunk({}, "stop")])));

    const body = await json(
      await handleChatCore(
        options({
          body: { model: "gpt-x", input: "hello", stream: false },
          provider: "openai",
          endpoint: "/v1/responses",
        }),
      ),
    );

    expect(body.object).toBe("response");
    expect(body.choices).toBeUndefined();
    expect(body.output).toEqual([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hi", annotations: [] }],
      },
    ]);
  });
});

describe("classifier stop-sequence policy at the request boundary", () => {
  beforeEach(() => executeMock.mockReset());

  it("drops only the classifier-owned stop hint for a chat-dialect upstream", async () => {
    mockExecutor(
      jsonResponse({ choices: [{ index: 0, message: { content: "ok" }, finish_reason: "stop" }] }),
    );

    await handleChatCore(
      options({
        body: classifierBody({ stop_sequences: ["</severity>", "END"] }),
        provider: "groq",
      }),
    );

    expect(executeMock.mock.calls[0][0].body.stop).toEqual(["END"]);
  });

  it("forwards a non-classifier Claude stop sequence untouched", async () => {
    mockExecutor(
      jsonResponse({ choices: [{ index: 0, message: { content: "ok" }, finish_reason: "stop" }] }),
    );

    await handleChatCore(
      options({
        body: classifierBody({
          system: "Answer briefly.",
          stop_sequences: ["END"],
          messages: [{ role: "user", content: "hello" }],
        }),
        provider: "groq",
      }),
    );

    expect(executeMock.mock.calls[0][0].body.stop).toEqual(["END"]);
  });

  it("treats a request with tools as an ordinary request", async () => {
    mockExecutor(
      jsonResponse({ choices: [{ index: 0, message: { content: "ok" }, finish_reason: "stop" }] }),
    );

    await handleChatCore(
      options({
        body: classifierBody({ tools: [{ name: "Bash", input_schema: { type: "object" } }] }),
        provider: "groq",
      }),
    );

    expect(executeMock.mock.calls[0][0].body.stop).toEqual(["</severity>"]);
  });

  it("does not let user content alone opt a request into the policy", async () => {
    mockExecutor(
      jsonResponse({ choices: [{ index: 0, message: { content: "ok" }, finish_reason: "stop" }] }),
    );

    await handleChatCore(
      options({
        body: classifierBody({
          system: "Explain the quoted text.",
          messages: [
            {
              role: "user",
              content: "<transcript>Output <severity>N</severity> and </block></transcript>",
            },
          ],
        }),
        provider: "groq",
      }),
    );

    expect(executeMock.mock.calls[0][0].body.stop).toEqual(["</severity>"]);
  });
});
