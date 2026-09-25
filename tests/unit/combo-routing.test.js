import { describe, it, expect, beforeEach } from "vitest";

import {
  getRotatedModels,
  resetComboRotation,
  handleComboChat,
} from "../../open-sse/services/combo.js";

describe("combo round-robin routing", () => {
  beforeEach(() => {
    resetComboRotation();
  });

  it("keeps existing one-request round-robin behavior by default", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from(
      { length: 4 },
      () => getRotatedModels(models, "code-xhigh", "round-robin")[0],
    );

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-b",
      "provider/model-a",
      "provider/model-b",
    ]);
  });

  it("sticks to each combo model for the configured number of requests", () => {
    const models = ["provider/model-a", "provider/model-b"];

    const firstChoices = Array.from(
      { length: 6 },
      () => getRotatedModels(models, "code-xhigh", "round-robin", 2)[0],
    );

    expect(firstChoices).toEqual([
      "provider/model-a",
      "provider/model-a",
      "provider/model-b",
      "provider/model-b",
      "provider/model-a",
      "provider/model-a",
    ]);
  });

  it("tracks sticky rotation independently per combo", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-xhigh", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-a");
    expect(getRotatedModels(models, "code-high", "round-robin", 2)[0]).toBe("provider/model-b");
    expect(getRotatedModels(models, "code-xhigh", "round-robin", 2)[0]).toBe("provider/model-a");
  });

  it("skips combo members with invalid model format instead of aborting", async () => {
    const log = { info: () => {}, warn: () => {}, debug: () => {} };
    const invalid = {
      ok: false,
      status: 400,
      statusText: "",
      clone() {
        return { json: async () => ({ error: { message: "Invalid model format" } }) };
      },
    };
    const ok = { ok: true, status: 200 };
    const seen = [];
    const handleSingleModel = async (body, modelStr) => {
      seen.push(modelStr);
      return modelStr === "gemini/gemini-3.8-flash" ? ok : invalid;
    };
    const res = await handleComboChat({
      body: {},
      models: ["Support", "gemini/gemini-3.8-flash"],
      handleSingleModel,
      log,
    });
    expect(res).toBe(ok);
    expect(seen).toEqual(["Support", "gemini/gemini-3.8-flash"]);
  });

  it("does not rotate fallback combos", () => {
    const models = ["provider/model-a", "provider/model-b"];

    expect(getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
    expect(getRotatedModels(models, "code-xhigh", "fallback", 2)).toEqual(models);
  });
});
