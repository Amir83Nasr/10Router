// Regressions for Claude Code traffic routed through OpenAI-dialect providers:
// 1. zai/deepseek thinking shapes leaked onto the OpenAI wire → 400 "unknown field thinking"
// 2. stream ended without finish_reason → tool_use block never closed (client sees failed)
// 3. empty tool_result content → 400 "Message content must contain text"
import { describe, expect, it } from "vitest";
import "../translator/registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { translateResponse } from "../../open-sse/translator/index.js";
import { openaiToClaudeResponse } from "../../open-sse/translator/response/openai-to-claude.js";
import { filterToOpenAIFormat } from "../../open-sse/translator/formats/openai.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { EMPTY_TOOL_RESULT } from "../../open-sse/translator/schema/index.js";

const claudeBody = () => ({
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
  thinking: { type: "enabled", budget_tokens: 4096 },
});

describe("thinking wire format on OpenAI-dialect endpoints", () => {
  for (const [provider, model] of [
    ["opencode", "glm-5.3-flash-free"],
    ["opencode", "deepseek-v4.1-flash-free"],
    ["opencode-zen", "glm-5.3-flash"],
    ["opencode-go", "deepseek-v4.1-flash"],
  ]) {
    it(`${provider}/${model} emits reasoning_effort, never thinking`, () => {
      const out = translateRequest(
        FORMATS.CLAUDE,
        FORMATS.OPENAI,
        model,
        claudeBody(),
        true,
        null,
        provider,
      );
      expect(out.thinking).toBeUndefined();
      expect(out.enable_thinking).toBeUndefined();
      expect(typeof out.reasoning_effort).toBe("string");
    });
  }

  it("does not apply the OpenAI-dialect override on a claude-format transport", () => {
    const out = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.CLAUDE,
      "deepseek-v4-pro",
      claudeBody(),
      true,
      null,
      "opencode-go",
    );
    // Capability-driven (deepseek) shape survives — no regression to bare effort.
    expect(out.thinking).toEqual({ type: "enabled" });
  });
});

describe("claude stream finalize without finish_reason", () => {
  const start = () =>
    openaiToClaudeResponse(
      {
        id: "chatcmpl-finalize",
        model: "glm-5.3-flash-free",
        choices: [{ delta: { content: "working" }, finish_reason: null }],
      },
      state,
    );

  let state;
  const newState = () => ({
    messageStartSent: false,
    toolCalls: new Map(),
    toolArgBuffers: new Map(),
    nextBlockIndex: 0,
  });

  it("closes an open tool block and terminates the message", () => {
    state = newState();
    start();
    openaiToClaudeResponse(
      {
        id: "chatcmpl-finalize",
        model: "glm-5.3-flash-free",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "toolu_1",
                  function: { name: "Bash", arguments: '{"command":"ls"}' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      state,
    );

    const flushed = openaiToClaudeResponse(null, state);
    // Text block closed when the tool block opened, so flush starts with the args delta.
    expect(flushed.map((e) => e.type)).toEqual([
      "content_block_delta",
      "content_block_stop",
      "message_delta",
      "message_stop",
    ]);
    expect(flushed[0].delta).toEqual({
      type: "input_json_delta",
      partial_json: '{"command":"ls"}',
    });
    expect(flushed[2].delta.stop_reason).toBe("tool_use");

    // Second flush is a no-op (no duplicate message_stop).
    expect(openaiToClaudeResponse(null, state)).toBeNull();
  });

  it("drops a truncated tool turn back to stop instead of tool_use", () => {
    state = newState();
    openaiToClaudeResponse(
      {
        id: "chatcmpl-finalize",
        model: "glm-5.3-flash-free",
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "toolu_2", function: { name: "Bash", arguments: '{"comm' } },
              ],
            },
          },
        ],
      },
      state,
    );

    const flushed = openaiToClaudeResponse(null, state);
    expect(flushed.find((e) => e.type === "message_delta").delta.stop_reason).toBe("end_turn");
  });
});

describe("empty tool_result content", () => {
  it("placeholder replaces empty content on the OpenAI wire", () => {
    const out = translateRequest(
      FORMATS.CLAUDE,
      FORMATS.OPENAI,
      "deepseek-v4.1-flash-free",
      {
        messages: [
          { role: "user", content: [{ type: "text", text: "run" }] },
          {
            role: "assistant",
            content: [{ type: "tool_use", id: "toolu_a", name: "Bash", input: {} }],
          },
          { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_a", content: [] }] },
        ],
      },
      true,
      null,
      "opencode",
    );
    const tool = out.messages.find((m) => m.role === "tool" && m.tool_call_id === "toolu_a");
    expect(tool.content).toBe(EMPTY_TOOL_RESULT);
  });

  it("filterToOpenAIFormat backfills empty tool messages", () => {
    const body = filterToOpenAIFormat({
      messages: [{ role: "tool", tool_call_id: "call_1", content: "" }],
    });
    expect(body.messages[0].content).toBe(EMPTY_TOOL_RESULT);
  });
});

describe("stream.js flush contract", () => {
  it("translateResponse(openai→claude, null) terminates an unterminated message", () => {
    const state = {
      messageStartSent: false,
      toolCalls: new Map(),
      toolArgBuffers: new Map(),
      nextBlockIndex: 0,
    };
    translateResponse(
      FORMATS.OPENAI,
      FORMATS.CLAUDE,
      { id: "chatcmpl-x", model: "m", choices: [{ delta: { content: "hi" } }] },
      state,
    );
    const flushed = translateResponse(FORMATS.OPENAI, FORMATS.CLAUDE, null, state);
    expect(flushed.at(-1)).toEqual({ type: "message_stop" });
  });
});
