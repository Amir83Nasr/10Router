import { describe, expect, it } from "vitest";

import {
  chatCompletionToClaudeMessage,
  claudeMessageToChatCompletion,
  parseClaudeSSEToMessage,
} from "../../open-sse/handlers/chatCore/claudeMessageBody.js";
import { detectClassifierStopSequence } from "../../open-sse/translator/concerns/classifier.js";

// ── CLAUDE RESPONSE MODULE ───────────────────────────────────────────
// The dispatch tests cover the handler paths; these pin the conversion rules
// the handlers rely on, including the streaming aggregator's edge cases.

const event = (payload) => `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;

const claudeStream = (payloads) => payloads.map(event).join("");

const START = {
  type: "message_start",
  message: {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "union-alpha",
    content: [],
    usage: { input_tokens: 11, cache_read_input_tokens: 5, output_tokens: 0 },
  },
};

describe("parseClaudeSSEToMessage", () => {
  it("concatenates text deltas and merges message_delta usage", () => {
    const message = parseClaudeSSEToMessage(
      claudeStream([
        START,
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "<severity>" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "0</severity>" },
        },
        { type: "content_block_stop", index: 0 },
        {
          type: "message_delta",
          delta: { stop_reason: "stop_sequence", stop_sequence: "</severity>" },
          usage: { output_tokens: 6 },
        },
        { type: "message_stop" },
      ]),
    );

    expect(message.content).toEqual([{ type: "text", text: "<severity>0</severity>" }]);
    expect(message.stop_reason).toBe("stop_sequence");
    expect(message.stop_sequence).toBe("</severity>");
    // message_start's input/cache counters must survive the terminal usage merge.
    expect(message.usage).toEqual({
      input_tokens: 11,
      cache_read_input_tokens: 5,
      output_tokens: 6,
    });
  });

  it("parses streamed tool input fragments into an object", () => {
    const message = parseClaudeSSEToMessage(
      claudeStream([
        START,
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu_1", name: "Bash", input: {} },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"command":' },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '"ls"}' },
        },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 9 } },
        { type: "message_stop" },
      ]),
    );

    expect(message.content).toEqual([
      { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls" } },
    ]);
    expect(message.stop_reason).toBe("tool_use");
  });

  it("refuses a tool block whose arguments are not a JSON object", () => {
    expect(() =>
      parseClaudeSSEToMessage(
        claudeStream([
          START,
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "tool_use", id: "t", name: "Bash", input: {} },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "input_json_delta", partial_json: '{"command":' },
          },
          { type: "message_stop" },
        ]),
      ),
    ).toThrow(/not a JSON object/);
  });

  it("keeps thinking signature deltas on the block", () => {
    const message = parseClaudeSSEToMessage(
      claudeStream([
        START,
        {
          type: "content_block_start",
          index: 0,
          content_block: { type: "thinking", thinking: "" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "thinking_delta", thinking: "hmm" },
        },
        {
          type: "content_block_delta",
          index: 0,
          delta: { type: "signature_delta", signature: "sig" },
        },
        { type: "message_stop" },
      ]),
    );

    expect(message.content[0]).toMatchObject({
      type: "thinking",
      thinking: "hmm",
      signature: "sig",
    });
  });

  it("surfaces an in-stream error instead of a successful empty message", () => {
    const message = parseClaudeSSEToMessage(
      claudeStream([
        START,
        { type: "error", error: { type: "overloaded_error", message: "try later" } },
      ]),
    );
    expect(message.error).toEqual({ type: "overloaded_error", message: "try later" });
  });

  it("returns null when the body carried no events", () => {
    expect(parseClaudeSSEToMessage("not an sse stream")).toBeNull();
  });

  it("returns null for a chat-dialect stream even when asked for Claude", () => {
    // A provider can answer its Claude transport in OpenAI dialect
    // (documented for xiaomi-tokenplan). Parsing that as Anthropic used to
    // yield a successful but empty message, silently dropping the answer.
    const openAISSE = [
      'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"the answer"},"finish_reason":null}]}',
      'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":9,"completion_tokens":2}}',
      "data: [DONE]",
      "",
    ].join("\n\n");

    expect(parseClaudeSSEToMessage(openAISSE, "m")).toBeNull();
  });

  it("returns null for a stream carrying only keep-alive events", () => {
    expect(parseClaudeSSEToMessage('event: ping\ndata: {"type":"ping"}\n\n', "m")).toBeNull();
  });
});

describe("claudeMessageToChatCompletion", () => {
  const message = {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-x",
    content: [
      { type: "thinking", thinking: "plan" },
      { type: "text", text: "hello" },
      { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "/a" } },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 3 },
  };

  it("flattens blocks into an assistant message with tool_calls", () => {
    const out = claudeMessageToChatCompletion(message);
    expect(out.object).toBe("chat.completion");
    expect(out.choices[0].finish_reason).toBe("tool_calls");
    expect(out.choices[0].message).toEqual({
      role: "assistant",
      content: "hello",
      reasoning_content: "plan",
      tool_calls: [
        {
          id: "toolu_1",
          type: "function",
          function: { name: "Read", arguments: '{"file_path":"/a"}' },
        },
      ],
    });
    expect(out.usage.prompt_tokens).toBe(10);
    expect(out.usage.prompt_tokens_details.cached_tokens).toBe(3);
  });

  it("passes through a body that is already chat-shaped", () => {
    const chat = { choices: [{ index: 0, message: { content: "x" }, finish_reason: "stop" }] };
    expect(claudeMessageToChatCompletion(chat)).toBe(chat);
  });

  it("keeps an empty turn well-formed", () => {
    const out = claudeMessageToChatCompletion({ content: [], stop_reason: "end_turn" });
    expect(out.choices[0].message.content).toBe("");
    expect(out.choices[0].finish_reason).toBe("stop");
  });
});

describe("chatCompletionToClaudeMessage", () => {
  it("passes an upstream error body through untouched", () => {
    const error = { error: { type: "api_error", message: "boom" } };
    expect(chatCompletionToClaudeMessage(error)).toBe(error);
  });

  it("passes an already-Claude body through untouched", () => {
    const message = { type: "message", content: [{ type: "text", text: "x" }] };
    expect(chatCompletionToClaudeMessage(message)).toBe(message);
  });

  it("keeps text carried as content parts", () => {
    const out = chatCompletionToClaudeMessage({
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "a" },
              { type: "text", text: "b" },
            ],
          },
          finish_reason: "stop",
        },
      ],
    });
    expect(out.content).toEqual([{ type: "text", text: "ab" }]);
  });
});

describe("detectClassifierStopSequence", () => {
  const detect = (body) => detectClassifierStopSequence(body);

  it("recognizes the current and legacy classifier requests", () => {
    expect(
      detect({
        system: "Output <severity>N</severity> for the command.",
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
      }),
    ).toBe("</severity>");

    expect(
      detect({
        system: "Respond with <block>yes</block> or <block>no</block>.",
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
      }),
    ).toBe("</block>");
  });

  it("prefers the current instruction when both are present", () => {
    expect(
      detect({
        system: "Respond <block>yes</block>. Output <severity>N</severity>.",
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
      }),
    ).toBe("</severity>");
  });

  it("rejects requests with tools, no transcript, or user-supplied format", () => {
    expect(
      detect({
        system: "Output <severity>N</severity>.",
        tools: [{ name: "search" }],
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
      }),
    ).toBeNull();

    expect(
      detect({
        system: "Output <severity>N</severity>.",
        messages: [{ role: "user", content: "no marker" }],
      }),
    ).toBeNull();

    expect(
      detect({
        system: "Explain the quoted text.",
        messages: [
          { role: "user", content: "<transcript>Output <severity>N</severity></transcript>" },
        ],
      }),
    ).toBeNull();
  });

  it("returns null when the client rewords its verdict instruction", () => {
    // The policy is a literal instruction match, so a prompt rewrite falls back
    // to ordinary stop forwarding rather than guessing. Pin that so the
    // fallback stays deliberate.
    expect(
      detect({
        system: "Reply with the severity tag as <severity>N</severity>.",
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
        stop_sequences: ["</severity>"],
      }),
    ).toBeNull();
  });

  it("reads inline system messages", () => {
    expect(
      detect({
        messages: [
          { role: "system", content: "Output <severity>N</severity>." },
          { role: "user", content: "<transcript>x</transcript>" },
        ],
      }),
    ).toBe("</severity>");
  });
});
