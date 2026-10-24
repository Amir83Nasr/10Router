import { describe, it, expect } from "vitest";
import { canonicalizeUsage, extractUsage } from "../../open-sse/utils/usageTracking.js";

describe("reasoning tokens folded into completion_tokens", () => {
  it("raises completion_tokens to reasoning_tokens when upstream reports 0", () => {
    const extracted = extractUsage({
      usage: {
        prompt_tokens: 4024,
        completion_tokens: 0,
        completion_tokens_details: { reasoning_tokens: 2500 },
      },
    });
    expect(extracted.completion_tokens).toBe(2500);
    const canonical = canonicalizeUsage(extracted);
    expect(canonical.completion_tokens).toBe(2500);
    expect(canonical.total_tokens).toBe(6524);
  });

  it("keeps completion_tokens when already larger than reasoning_tokens", () => {
    const canonical = canonicalizeUsage({
      prompt_tokens: 100,
      completion_tokens: 300,
      reasoning_tokens: 120,
    });
    expect(canonical.completion_tokens).toBe(300);
    expect(canonical.total_tokens).toBe(400);
  });
});
