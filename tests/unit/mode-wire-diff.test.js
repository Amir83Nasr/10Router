import { describe, expect, it } from "vitest";
import "../translator/registerAll.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// Claude Code expresses "mode" for the model in exactly two request fields:
// `thinking` and `output_config.effort` (everything else — permission mode,
// plan mode — stays local and never reaches the wire). These tests pin the
// translation of each distinct combination so a future normalization change
// cannot quietly collapse two different modes onto one upstream body.

const PROVIDER = "opencode";
const MODEL = "deepseek-v4.1-flash-free";

const claudeBody = (overrides = {}) => ({
  model: MODEL,
  max_tokens: 32000,
  stream: true,
  system: "You are Claude Code.",
  messages: [{ role: "user", content: "hi" }],
  ...overrides,
});

const translate = (overrides) =>
  translateRequest(
    FORMATS.CLAUDE,
    FORMATS.OPENAI,
    MODEL,
    claudeBody(overrides),
    true,
    {},
    PROVIDER,
  );

/** Only the fields that carry a reasoning decision. */
const reasoningShape = (body) => ({
  reasoning_effort: body.reasoning_effort,
  thinking: body.thinking,
  enable_thinking: body.enable_thinking,
  output_config: body.output_config,
});

describe("Claude mode → outbound reasoning fields", () => {
  it.each([
    ["explicit high", { output_config: { effort: "high" } }, "high"],
    ["explicit medium", { output_config: { effort: "medium" } }, "medium"],
    ["explicit low", { output_config: { effort: "low" } }, "low"],
  ])("%s reaches the upstream as that level", (_label, thinking, expected) => {
    const out = translate({ thinking: { type: "adaptive" }, ...thinking });
    expect(out.reasoning_effort).toBe(expected);
  });

  it("adaptive with no explicit effort omits the field (provider default)", () => {
    const out = translate({ thinking: { type: "adaptive", display: "updates" } });
    expect(out.reasoning_effort).toBeUndefined();
    expect(out.thinking).toBeUndefined();
    expect(out.enable_thinking).toBeUndefined();
  });

  it("thinking disabled turns the model off explicitly", () => {
    const out = translate({ thinking: { type: "disabled" } });
    expect(out.reasoning_effort).toBe("none");
  });

  it("distinct inputs stay distinct on the wire", () => {
    const high = reasoningShape(translate({ output_config: { effort: "high" } }));
    const low = reasoningShape(translate({ output_config: { effort: "low" } }));
    const off = reasoningShape(translate({ thinking: { type: "disabled" } }));
    const auto = reasoningShape(translate({ thinking: { type: "adaptive" } }));

    const shapes = [high, low, off, auto].map((s) => JSON.stringify(s));
    expect(new Set(shapes).size).toBe(4);
  });

  it("Claude-only fields do not leak into an OpenAI body", () => {
    const out = translate({
      thinking: { type: "adaptive", display: "updates" },
      output_config: { effort: "high" },
      context_management: { edits: [{ type: "clear_thinking_20251015", keep: "all" }] },
    });
    expect(out.context_management).toBeUndefined();
    expect(out.output_config).toBeUndefined();
    expect(out.thinking).toBeUndefined();
    expect(out.reasoning_effort).toBe("high");
  });
});
