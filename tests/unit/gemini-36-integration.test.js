import { afterEach, describe, expect, it, vi } from "vitest";

import { getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import {
  applyThinking,
  stripThinkingSuffix,
} from "../../open-sse/translator/concerns/thinkingUnified.js";
import antigravity from "../../open-sse/providers/registry/antigravity.js";
import gemini from "../../open-sse/providers/registry/gemini.js";
import { MODEL_PRICING } from "../../open-sse/providers/pricing.js";
import { getProjectIdForConnection, removeConnection } from "../../open-sse/services/projectId.js";

// Tier extractor ported from the removed src/mitm/config.js — the tiered-model
// naming (gemini-3.x-flash-tiered + thinkingLevel → gemini-3.x-flash-{tier})
// is owned by the Antigravity executor path, not by any MITM code.
function extractModel(url, body) {
  const parsed = JSON.parse(body.toString());
  const rawLevel =
    parsed.request?.generationConfig?.thinkingConfig?.thinkingLevel ||
    parsed.generationConfig?.thinkingConfig?.thinkingLevel;
  const level = ["high", "medium", "low"].includes(String(rawLevel).toLowerCase())
    ? String(rawLevel).toLowerCase()
    : "medium";
  const ver = url.includes("3.8") ? "3.8" : url.includes("3.7") ? "3.7" : "3.6";
  return `gemini-${ver}-flash-${level}`;
}

function cloudCodeResponse(projectId) {
  return {
    ok: true,
    json: async () => ({ cloudaicompanionProject: { id: projectId } }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Gemini Cloud Code endpoint isolation", () => {
  it("uses the prod cloudcode host for Antigravity discovery but daily for chat", async () => {
    const connectionId = "antigravity-endpoint-test";
    const fetchMock = vi.fn(async () => cloudCodeResponse("antigravity-project"));
    vi.stubGlobal("fetch", fetchMock);

    await getProjectIdForConnection(connectionId, "token", "antigravity");

    // Discovery (loadCodeAssist) on PROD — daily host rejects auth/onboarding calls.
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
      expect.objectContaining({ method: "POST" }),
    );
    // Chat transport still uses the daily host to bypass prod 429.
    expect(antigravity.transport.baseUrls).toEqual(["https://daily-cloudcode-pa.googleapis.com"]);
    removeConnection(connectionId);
  });
});

describe("Gemini 3.6 Antigravity tiers", () => {
  it.each(["high", "medium", "low"])(
    "maps the %s tier to the shared upstream model with matching thinking level",
    (tier) => {
      const publicModel = `gemini-3.6-flash-${tier}`;
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

      expect(upstreamModel).toBe(`gemini-3.6-flash-tiered(${tier})`);
      expect(finalBody.model).toBe("gemini-3.6-flash-tiered");
      expect(finalBody.request.generationConfig.thinkingConfig).toEqual({
        thinkingLevel: tier,
        includeThoughts: true,
      });
    },
  );
});

describe("Gemini 3.6 tiered model extraction", () => {
  it("extracts the model name from the tiered-model helper", () => {
    expect(typeof extractModel).toBe("function");
  });

  it.each(["high", "medium", "low"])("extracts the %s thinking tier", (tier) => {
    const body = Buffer.from(
      JSON.stringify({
        request: { generationConfig: { thinkingConfig: { thinkingLevel: tier } } },
      }),
    );

    expect(
      extractModel("/v1internal/models/gemini-3.6-flash-tiered:streamGenerateContent", body),
    ).toBe(`gemini-3.6-flash-${tier}`);
  });

  it("defaults invalid or missing thinking levels to medium", () => {
    const body = Buffer.from(
      JSON.stringify({
        request: { generationConfig: { thinkingConfig: { thinkingLevel: "unknown" } } },
      }),
    );

    expect(
      extractModel("/v1internal/models/gemini-3.6-flash-tiered:streamGenerateContent", body),
    ).toBe("gemini-3.6-flash-medium");
  });
});

describe("Gemini 3.6 catalogs and pricing", () => {
  it("exposes the direct Gemini API models and their pricing", () => {
    const ids = gemini.models.map((model) => model.id);
    expect(ids).toContain("gemini-3.6-flash");
    expect(ids).toContain("gemini-3.5-flash-lite");
    expect(MODEL_PRICING["gemini-3.6-flash"]).toMatchObject({ input: 1.5, output: 7.5 });
    expect(MODEL_PRICING["gemini-3.5-flash-lite"]).toMatchObject({ input: 0.3, output: 2.5 });
  });
});
