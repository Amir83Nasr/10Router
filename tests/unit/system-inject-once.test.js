import { describe, expect, it } from "vitest";
import { injectCaveman } from "../../open-sse/rtk/caveman.js";
import { injectPonytail } from "../../open-sse/rtk/ponytail.js";
import { CAVEMAN_PROMPTS } from "../../open-sse/rtk/cavemanPrompts.js";
import { PONYTAIL_PROMPTS } from "../../open-sse/rtk/ponytailPrompt.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────
// Caveman and Ponytail append a style instruction to the system message of every
// dispatched request. They must do exactly that: once per level, never twice,
// and they must not disturb the system text the client sent.

const caveman = CAVEMAN_PROMPTS.full;
const ponytail = PONYTAIL_PROMPTS.full;

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

describe("system-prompt injection", () => {
  it("appends the caveman prompt to a Claude system string", () => {
    const body = { system: "You are Claude Code." };
    injectCaveman(body, FORMATS.CLAUDE, "full");

    expect(body.system.startsWith("You are Claude Code.")).toBe(true);
    expect(countOccurrences(body.system, caveman)).toBe(1);
  });

  it("is idempotent: a second injection does not duplicate the prompt", () => {
    const body = { system: "You are Claude Code." };
    injectCaveman(body, FORMATS.CLAUDE, "full");
    const once = body.system;
    injectCaveman(body, FORMATS.CLAUDE, "full");

    expect(body.system).toBe(once);
    expect(countOccurrences(body.system, caveman)).toBe(1);
  });

  it("keeps caveman and ponytail independent", () => {
    const body = { system: "You are Claude Code." };
    injectCaveman(body, FORMATS.CLAUDE, "full");
    injectPonytail(body, FORMATS.CLAUDE, "full");

    expect(countOccurrences(body.system, caveman)).toBe(1);
    expect(countOccurrences(body.system, ponytail)).toBe(1);
    expect(body.system.indexOf(caveman)).toBeLessThan(body.system.indexOf(ponytail));
  });

  it("does not re-inject a different level when one is already present", () => {
    // The exact-segment dedupe is per prompt text, so a level change adds its own
    // prompt rather than replacing the old one — pin that so a later change to
    // "replace on level change" is deliberate, not accidental.
    const body = { system: "" };
    injectCaveman(body, FORMATS.CLAUDE, "full");
    injectCaveman(body, FORMATS.CLAUDE, "lite");

    expect(countOccurrences(body.system, CAVEMAN_PROMPTS.full)).toBe(1);
    expect(countOccurrences(body.system, CAVEMAN_PROMPTS.lite)).toBe(1);
  });

  it("appends to the existing system message for OpenAI chat bodies", () => {
    const body = {
      messages: [
        { role: "system", content: "You are Claude Code." },
        { role: "user", content: "hi" },
      ],
    };
    injectPonytail(body, FORMATS.OPENAI, "full");
    injectPonytail(body, FORMATS.OPENAI, "full");

    expect(body.messages).toHaveLength(2);
    expect(countOccurrences(body.messages[0].content, ponytail)).toBe(1);
  });

  it("creates a system message when the OpenAI body has none", () => {
    const body = { messages: [{ role: "user", content: "hi" }] };
    injectCaveman(body, FORMATS.OPENAI, "full");

    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(caveman);
  });

  it("injects into the Responses API instructions field", () => {
    const body = { instructions: "Be brief." };
    injectCaveman(body, FORMATS.OPENAI_RESPONSES, "full");

    expect(countOccurrences(body.instructions, caveman)).toBe(1);
    expect(body.instructions.startsWith("Be brief.")).toBe(true);
  });

  it("injects into a Gemini systemInstruction", () => {
    const body = { generationConfig: {} };
    injectPonytail(body, FORMATS.GEMINI, "full");

    expect(body.systemInstruction.parts).toEqual([{ text: ponytail }]);
  });

  it("leaves an empty body alone instead of throwing", () => {
    expect(() => injectCaveman({}, FORMATS.CLAUDE, "full")).not.toThrow();
    expect(() => injectPonytail(null, FORMATS.CLAUDE, "full")).not.toThrow();
  });
});
