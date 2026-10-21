import { describe, expect, it } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// The 10Router combo routes Claude Code across five OpenCode models with very
// different reasoning contracts. Every outbound body must either name a level
// the OpenAI reasoning_effort enum defines, or omit the field entirely — a value
// outside the enum is a 400 (or a silent clamp) at an upstream we do not control.
//
// The contract here is the OPENCODE TRANSPORT one, not the per-model native one:
// `opencode.js` sets `thinkingFormat: "openai"` for the whole provider, so every
// member is spoken to in OpenAI dialect regardless of its native format.

const COMBO = [
  "deepseek-v4.1-flash-free",
  "glm-5.3-flash-free",
  "minimax-m3.1-flash-free",
  "mimo-v2.6-flash-free",
  "big-pickle",
];
const PROVIDER = "opencode";
const OPENAI_WIRE_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh"];

const apply = (model, body) => applyThinking(FORMATS.OPENAI, model, body, PROVIDER);

describe("10Router combo: outbound reasoning is declared or omitted", () => {
  it.each(COMBO)("%s emits only a level its wire enum defines", (model) => {
    // `max` is outside OpenAI's generic enum, so it is allowed only when the
    // model's own declared set names it (deepseek does; see PATTERN_THINKING).
    const declared = getThinkingLevels(PROVIDER, model) || [];
    const allowed = new Set([...OPENAI_WIRE_LEVELS, ...declared.filter((l) => l === "max")]);
    for (const requested of ["low", "medium", "high", "max"]) {
      const body = apply(model, { output_config: { effort: requested } });
      if (body.reasoning_effort === undefined) continue; // intentionally omitted
      expect(allowed, `${model} received "${body.reasoning_effort}"`).toContain(
        body.reasoning_effort,
      );
    }
  });

  it.each([
    ["deepseek-v4.1-flash-free", "high"],
    ["glm-5.3-flash-free", "high"],
    ["minimax-m3.1-flash-free", "high"],
    ["mimo-v2.6-flash-free", undefined],
    ["big-pickle", undefined],
  ])("%s: explicit high effort", (model, expected) => {
    const body = apply(model, { output_config: { effort: "high" } });
    expect(body.reasoning_effort).toBe(expected);
  });

  it("non-reasoning members drop the request and leave no stray field", () => {
    for (const model of ["mimo-v2.6-flash-free", "big-pickle"]) {
      const body = apply(model, {
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
      });
      expect(body.reasoning_effort).toBeUndefined();
      expect(body.thinking).toBeUndefined();
      expect(body.enable_thinking).toBeUndefined();
      expect(body.output_config).toBeUndefined();
    }
  });

  it("no member ever receives reasoning_effort:'auto'", () => {
    for (const model of COMBO) {
      const body = apply(model, { thinking: { type: "adaptive", display: "updates" } });
      expect(body.reasoning_effort, `${model} emitted auto`).not.toBe("auto");
    }
  });

  // Documents a pre-existing divergence, not introduced here: getThinkingLevels
  // reports the per-model NATIVE level set (zai/minimax are on/off), while the
  // opencode transport override makes the actual wire OpenAI-dialect. The two
  // disagree for glm/minimax; the picker is therefore narrower than the wire.
  it("declared picker levels lag the overridden wire format for zai-style models", () => {
    for (const model of ["glm-5.3-flash-free", "minimax-m3.1-flash-free"]) {
      expect(getThinkingLevels(PROVIDER, model)).toEqual(["none", "thinking"]);
      expect(apply(model, { output_config: { effort: "low" } }).reasoning_effort).toBe("low");
    }
  });
});

describe("OpenCode provider-level 'openai' normalization is pinned", () => {
  // opencode.js declares thinkingFormat:"openai" for the whole provider because
  // its gateway rejects `thinking`/`enable_thinking` with a 400. That override
  // is deliberate: these assertions fail if it is removed or loosened, which
  // would reintroduce the unknown-field errors it was added to fix.
  it.each(COMBO)("%s never receives a native thinking dialect field", (model) => {
    const body = apply(model, {
      thinking: { type: "adaptive", display: "updates" },
      output_config: { effort: "high" },
    });
    // The provider override pre-empts every native format, so no member gets a
    // dialect-specific field here.
    expect(body.thinking).toBeUndefined();
    expect(body.enable_thinking).toBeUndefined();
    expect(body.thinking_budget).toBeUndefined();
    expect(body.output_config).toBeUndefined();
  });

  it("glm's zai mapping is not applied on the opencode wire", () => {
    // The zai format sends {thinking:{type:"enabled"}} + low|high|max.
    // opencode's transport override must pre-empt it.
    const body = apply("glm-5.3-flash-free", { output_config: { effort: "medium" } });
    expect(body.thinking).toBeUndefined();
    expect(body.reasoning_effort).toBe("medium");
  });
});

describe("'auto' effort is omitted, never emitted", () => {
  it.each([
    ["openai wire", FORMATS.OPENAI, "gpt-5", "openai"],
    ["step wire", FORMATS.OPENAI, "step-2", "stepfun"],
    ["commandcode", "commandcode", "cmd-x", "commandcode"],
    ["gemini budget", FORMATS.GEMINI, "gemini-2.5-flash", "gemini"],
  ])("%s omits the field for adaptive-only intent", (_label, target, model, provider) => {
    const body = applyThinking(target, model, { thinking: { type: "adaptive" } }, provider);
    const emitted =
      body.reasoning_effort ?? body.params?.reasoning_effort ?? body.generationConfig?.thinking;
    expect(emitted).toBeUndefined();
  });

  it("an explicit level still wins over auto", () => {
    const body = applyThinking(
      FORMATS.OPENAI,
      "gpt-5",
      { thinking: { type: "adaptive" }, output_config: { effort: "high" } },
      "openai",
    );
    expect(body.reasoning_effort).toBe("high");
  });
});
