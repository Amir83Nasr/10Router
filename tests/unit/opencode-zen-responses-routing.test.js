import { describe, expect, it } from "vitest";
// PROVIDER_MODELS is keyed by alias ("ocz"), not provider id.
import { getModelSupportedFormats } from "../../open-sse/config/providerModels.js";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen.js";

// Regression: the Zen executor used to route only Muse Spark models to
// /zen/v1/responses (via isMuseSparkModel), while the registry marks every
// responses-family model (GPT, Grok, Muse Spark) as responses-only. GPT/Grok
// requests then hit /chat/completions and failed upstream. isResponsesModel
// now reads the registry, so executor and chatCore guard agree.
describe("OpenCodeZenExecutor responses routing", () => {
  it("routes every responses-only registry model to /responses", () => {
    const ex = new OpenCodeZenExecutor();
    const responsesOnly = [
      "gpt-6-astra",
      "gpt-5.6-luna",
      "grok-4.6",
      "grok-4.5",
      "muse-spark-1.3",
      "muse-spark-1.2",
    ];
    for (const m of responsesOnly) {
      expect(getModelSupportedFormats("ocz", m)).toEqual(["openai-responses"]);
      expect(ex.buildUrl(m)).toBe("https://opencode.ai/zen/v1/responses");
      expect(ex.buildUrl(`${m}(high)`)).toBe("https://opencode.ai/zen/v1/responses");
      // Even a stale runtimeTransport must not drag responses models elsewhere.
      expect(
        ex.buildUrl(m, true, 0, {
          runtimeTransport: { baseUrl: "https://opencode.ai/zen/v1/chat/completions" },
        }),
      ).toBe("https://opencode.ai/zen/v1/responses");
    }
  });

  it("leaves chat/messages models on the default/runtime transport", () => {
    const ex = new OpenCodeZenExecutor();
    expect(ex.buildUrl("kimi-k2.6")).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(
      ex.buildUrl("claude-sonnet-4-6", true, 0, {
        runtimeTransport: { baseUrl: "https://opencode.ai/zen/v1/messages" },
      }),
    ).toBe("https://opencode.ai/zen/v1/messages");
  });
});
