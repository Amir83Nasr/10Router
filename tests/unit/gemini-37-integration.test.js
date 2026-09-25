import { afterEach, describe, expect, it, vi } from "vitest";

import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import {
  applyThinking,
  stripThinkingSuffix,
} from "../../open-sse/translator/concerns/thinkingUnified.js";
import gemini from "../../open-sse/providers/registry/gemini.js";
import { MODEL_PRICING } from "../../open-sse/providers/pricing.js";

// Tier extractor ported from the removed src/mitm/config.js — the tiered-model
// naming (gemini-3.7-flash-tiered + thinkingLevel → gemini-3.7-flash-{tier})
// is owned by the Antigravity executor path, not by any MITM code.
function extractModel(url, body) {
  const parsed = JSON.parse(body.toString());
  const rawLevel =
    parsed.request?.generationConfig?.thinkingConfig?.thinkingLevel ||
    parsed.generationConfig?.thinkingConfig?.thinkingLevel;
  const level = ["high", "medium", "low"].includes(String(rawLevel).toLowerCase())
    ? String(rawLevel).toLowerCase()
    : "medium";
  return `gemini-3.7-flash-${level}`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Gemini 3.7 Antigravity tiers", () => {
  it.each(["high", "medium", "low"])(
    "maps the %s tier to the shared upstream model with matching thinking level",
    (tier) => {
      const publicModel = `gemini-3.7-flash-${tier}`;
      const upstreamModel = getModelUpstreamId("ag", publicModel);
      const body = {
        model: stripThinkingSuffix(upstreamModel),
        request: {
          contents: [{ role: "user", parts: [{ text: "hello" }] }],
          generationConfig: {},
        },
      };

      applyThinking("antigravity", upstreamModel, body, "antigravity");
      const finalBody = new AntigravityExecutor().transformRequest(publicModel, body, true, {
        projectId: "project",
        connectionId: "connection",
      });

      expect(upstreamModel).toBe(`gemini-3.7-flash-tiered(${tier})`);
      expect(finalBody.model).toBe("gemini-3.7-flash-tiered");
      expect(finalBody.request.generationConfig.thinkingConfig).toEqual({
        thinkingLevel: tier,
        includeThoughts: true,
      });
    },
  );
});

describe("Gemini 3.7 tiered model extraction", () => {
  it.each(["high", "medium", "low"])(
    "extracts the %s thinking tier for gemini-3.7-flash-tiered",
    (tier) => {
      const body = Buffer.from(
        JSON.stringify({
          request: { generationConfig: { thinkingConfig: { thinkingLevel: tier } } },
        }),
      );

      expect(
        extractModel("/v1internal/models/gemini-3.7-flash-tiered:streamGenerateContent", body),
      ).toBe(`gemini-3.7-flash-${tier}`);
    },
  );

  it("defaults invalid or missing thinking levels to medium", () => {
    const body = Buffer.from(
      JSON.stringify({
        request: { generationConfig: { thinkingConfig: { thinkingLevel: "unknown" } } },
      }),
    );

    expect(
      extractModel("/v1internal/models/gemini-3.7-flash-tiered:streamGenerateContent", body),
    ).toBe("gemini-3.7-flash-medium");
  });
});

describe("Gemini 3.7 catalog and pricing", () => {
  it("exposes the direct Gemini 3.7 API models and pricing", () => {
    const ids = gemini.models.map((model) => model.id);
    expect(ids).toContain("gemini-3.7-flash");
    expect(MODEL_PRICING["gemini-3.7-flash"]).toMatchObject({ input: 1.5, output: 7.5 });
  });
});
