import { describe, expect, it } from "vitest";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("getCapabilitiesForModel", () => {
  it("reports DeepSeek V4.1-Flash ids as vision-capable without dropping their thinking/context", () => {
    const v41 = {
      vision: true,
      reasoning: true,
      thinkingFormat: "deepseek",
      contextWindow: 1000000,
      maxOutput: 384000,
    };
    expect(getCapabilitiesForModel(undefined, "deepseek-v4.1-flash")).toMatchObject(v41);
    expect(getCapabilitiesForModel("opencode-go", "deepseek-v4.1-flash")).toMatchObject(v41);
    expect(getCapabilitiesForModel("openrouter", "deepseek/deepseek-v4.1-flash")).toMatchObject(
      v41,
    );
    // "deepseek-flash" is the GA id for V4.1-Flash on the DeepSeek API; the pattern it
    // used to fall through to gives it 128K/64K, which the exact entry keeps.
    expect(getCapabilitiesForModel("opencode-go", "deepseek-flash")).toMatchObject({
      vision: true,
      reasoning: true,
      thinkingFormat: "deepseek",
      contextWindow: 128000,
      maxOutput: 64000,
    });
    // the superseded text-only Flash id stays text-only
    expect(getCapabilitiesForModel("opencode-go", "deepseek-v4-flash").vision).toBe(false);
  });
  const claudeSonnet5Expected = {
    contextWindow: 1000000,
    maxOutput: 128000,
    thinkingFormat: "claude-adaptive",
    reasoning: true,
    vision: true,
    search: true,
  };

  it("reports Claude Fable 5.1 as a permanent adaptive-thinking model", () => {
    expect(getCapabilitiesForModel("claude", "claude-fable-5-1")).toMatchObject({
      ...claudeSonnet5Expected,
      thinkingCanDisable: false,
    });
  });

  it("reports Codex GPT 6.0 Astra as a vision and thinking capable model", () => {
    expect(getCapabilitiesForModel("codex", "gpt-6-astra")).toMatchObject({
      vision: true,
      reasoning: true,
      search: true,
      thinkingFormat: "openai",
      contextWindow: 272000,
      maxOutput: 128000,
    });
  });

  it("CommandCode v4.1-flash is vision + effort capable", () => {
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4.1-flash")).toMatchObject({
      vision: true,
      reasoning: true,
      thinkingFormat: "commandcode",
      thinkingEffortSupported: true,
    });
  });

  it("CommandCode MiniMax-M3 is vision capable", () => {
    expect(getCapabilitiesForModel("commandcode", "MiniMaxAI/MiniMax-M3").vision).toBe(true);
  });

  it("CommandCode text-only DeepSeek V4 Flash stays non-vision", () => {
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4-flash").vision).toBe(false);
    expect(getCapabilitiesForModel("commandcode", "deepseek/deepseek-v4-flash")).toMatchObject({
      reasoning: true,
      thinkingFormat: "commandcode",
      thinkingEffortSupported: true,
    });
  });
});
