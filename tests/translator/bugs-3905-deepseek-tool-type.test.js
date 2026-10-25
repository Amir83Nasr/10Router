// Regression for #3905: defaultClaudeToolType() (type:"custom") must only run for
// gateways that declare the requireClaudeToolType quirk. Claude-format endpoints
// that only accept the legacy typeless tool shape — e.g. DeepSeek's
// Anthropic-compatible endpoint, which answers HTTP 400 "unknown variant `custom`" —
// must never receive tools[].type = "custom".
import { describe, it, expect } from "vitest";
import { PROVIDERS } from "../../open-sse/providers/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import { shouldDefaultClaudeToolType } from "../../open-sse/translator/concerns/toolCall.js";

const tools = [{ name: "get_weather", description: "weather", input_schema: { type: "object" } }];

// The quirk is opt-in per provider; this synthetic map stands in for a gateway
// that declares it without depending on a shipped provider doing so.
const declaring = { gateway: { quirks: { requireClaudeToolType: true } } };

describe("Claude tool `type` defaulting is provider-scoped (#3905)", () => {
  it("runs only for providers declaring requireClaudeToolType", () => {
    expect(shouldDefaultClaudeToolType("gateway", FORMATS.CLAUDE, tools, declaring)).toBe(true);
    expect(shouldDefaultClaudeToolType("other", FORMATS.CLAUDE, tools, declaring)).toBe(false);
    // Endpoints accepting only the legacy typeless shape must NOT get type:"custom".
    expect(shouldDefaultClaudeToolType("deepseek", FORMATS.CLAUDE, tools, PROVIDERS)).toBe(false);
    expect(shouldDefaultClaudeToolType("claude", FORMATS.CLAUDE, tools, PROVIDERS)).toBe(false);
  });

  it("never applies outside Claude-format requests or without tools", () => {
    expect(shouldDefaultClaudeToolType("gateway", FORMATS.OPENAI, tools, declaring)).toBe(false);
    expect(shouldDefaultClaudeToolType("gateway", FORMATS.CLAUDE, undefined, declaring)).toBe(
      false,
    );
    expect(shouldDefaultClaudeToolType("gateway", FORMATS.CLAUDE, null, declaring)).toBe(false);
  });

  it("no shipped provider declares the quirk", () => {
    expect(PROVIDERS.deepseek?.quirks?.requireClaudeToolType).toBeUndefined();
    expect(Object.values(PROVIDERS).filter((p) => p?.quirks?.requireClaudeToolType)).toHaveLength(
      0,
    );
  });
});
