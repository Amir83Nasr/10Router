// Shared body-shaping rules for the three OpenCode executors (free, Go, Zen).
// These mirror what the /responses and /messages endpoints accept upstream:
// freeform custom tools must survive untouched, duplicate declarations are
// rejected, and custom tool calls must stay paired with their outputs.
import { describe, it, expect } from "vitest";
import {
  MAX_TOOL_NAME_LEN,
  baseModelId,
  normalizeResponsesTools,
  normalizeSession,
  sanitizeResponsesItems,
} from "../../open-sse/executors/opencodeShared.js";
import { detectToolShape, TOOL_SHAPE } from "../../open-sse/utils/opencodeFingerprint.js";

describe("normalizeResponsesTools", () => {
  it("preserves freeform custom tools and their grammar", () => {
    const body = {
      tools: [
        {
          type: "custom",
          name: "apply_patch",
          description: "Apply a patch",
          format: { type: "grammar", syntax: "lark", definition: "start: /.+/" },
        },
      ],
    };

    normalizeResponsesTools(body);

    expect(body.tools).toEqual([
      {
        type: "custom",
        name: "apply_patch",
        description: "Apply a patch",
        format: { type: "grammar", syntax: "lark", definition: "start: /.+/" },
      },
    ]);
  });

  it("flattens nested function tools and fills empty object schemas", () => {
    const body = {
      tools: [
        {
          type: "function",
          function: {
            name: "  lookup  ",
            description: "Find a record",
            parameters: { type: "object" },
          },
        },
      ],
    };

    normalizeResponsesTools(body);

    expect(body.tools[0]).toEqual({
      type: "function",
      name: "lookup",
      description: "Find a record",
      parameters: { type: "object", properties: {} },
    });
  });

  it("drops nameless, hosted and duplicate declarations", () => {
    const body = {
      tools: [
        { type: "web_search" },
        { name: "   " },
        { type: "function", name: "a" },
        { type: "function", name: "a" },
        { type: "custom", name: "shell" },
        { type: "custom", name: "shell" },
      ],
    };

    normalizeResponsesTools(body);

    expect(body.tools.map((tool) => tool.name)).toEqual(["a", "shell"]);
  });

  it("dedupes names that collide after truncation", () => {
    const long = "x".repeat(MAX_TOOL_NAME_LEN + 10);
    const body = {
      tools: [
        { type: "function", name: `${long}a` },
        { type: "function", name: `${long}b` },
      ],
    };

    normalizeResponsesTools(body);

    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toHaveLength(MAX_TOOL_NAME_LEN);
  });

  it("keeps a tool_choice for custom or function tools that are declared", () => {
    const kept = {
      tools: [{ type: "custom", name: "apply_patch" }],
      tool_choice: { type: "custom", name: "apply_patch" },
    };
    normalizeResponsesTools(kept);
    expect(kept.tool_choice).toEqual({ type: "custom", name: "apply_patch" });

    const dropped = {
      tools: [{ type: "function", name: "a" }],
      tool_choice: { type: "function", name: "missing" },
    };
    normalizeResponsesTools(dropped);
    expect(dropped.tool_choice).toBeUndefined();
  });
});

describe("sanitizeResponsesItems", () => {
  it("keeps custom tool calls paired and never mints a call id", () => {
    const body = {
      input: [
        { type: "custom_tool_call", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", call_id: "call_1", output: "ok" },
      ],
    };

    sanitizeResponsesItems(body);

    expect(body.input).toHaveLength(2);
    expect(body.input[0].call_id).toBeUndefined();
    expect(body.input[0].name).toBe("apply_patch");
    expect(body.input[1].call_id).toBe("call_1");
  });

  it("drops a nameless custom tool call", () => {
    const body = { input: [{ type: "custom_tool_call", input: "patch" }] };
    sanitizeResponsesItems(body);
    expect(body.input).toHaveLength(0);
  });

  it("strips prior reasoning items and encrypted content", () => {
    const body = {
      input: [
        { type: "reasoning", encrypted_content: "abc" },
        { type: "message", role: "user", content: "hi", encrypted_content: "abc" },
      ],
    };

    sanitizeResponsesItems(body);

    expect(body.input).toHaveLength(1);
    expect(body.input[0].encrypted_content).toBeUndefined();
  });

  it("coerces malformed function call payloads", () => {
    const body = {
      input: [
        { type: "function_call", name: "  a  ", arguments: "{bad" },
        { type: "function_call_output", output: { ok: true } },
        { type: "function_call" },
      ],
    };

    sanitizeResponsesItems(body);

    expect(body.input).toHaveLength(2);
    expect(body.input[0]).toMatchObject({ name: "a", arguments: "{}" });
    expect(body.input[0].call_id).toMatch(/^call_/);
    expect(body.input[1].output).toBe('{"ok":true}');
    expect(body.input[1].call_id).toMatch(/^call_/);
  });
});

describe("session and model helpers", () => {
  it("bounds the session id", () => {
    expect(normalizeSession("  sess-1 ")).toBe("sess-1");
    expect(normalizeSession("   ")).toBeNull();
    expect(normalizeSession("x".repeat(257))).toBeNull();
    expect(normalizeSession(42)).toBeNull();
  });

  it("strips the thinking suffix from a model id", () => {
    expect(baseModelId("gpt-5.2(high)")).toBe("gpt-5.2");
    expect(baseModelId("gpt-5.2")).toBe("gpt-5.2");
    expect(baseModelId(null)).toBe("");
  });
});

describe("detectToolShape", () => {
  it("recognizes Claude bodies by system or input_schema", () => {
    expect(detectToolShape({ system: "be brief", messages: [] })).toBe(TOOL_SHAPE.CLAUDE);
    expect(detectToolShape({ tools: [{ name: "a", input_schema: {} }] })).toBe(TOOL_SHAPE.CLAUDE);
  });

  it("defaults chat-shaped bodies to the chat shape", () => {
    expect(detectToolShape({ messages: [{ role: "user", content: "hi" }] })).toBe(TOOL_SHAPE.CHAT);
    expect(detectToolShape({ tools: [{ type: "function", function: { name: "a" } }] })).toBe(
      TOOL_SHAPE.CHAT,
    );
    expect(detectToolShape(null)).toBe(TOOL_SHAPE.CHAT);
  });
});
