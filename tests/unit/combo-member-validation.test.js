// Combo member validation: bare words ("Support", "Last", "Body") from a bad
// paste die at request time with "Invalid model format" and burn the whole
// combo run — the API must reject them at save time naming the bad entries.
import { describe, it, expect } from "vitest";

import { findComboMemberProblems } from "../../src/lib/validateComboModels.ts";

describe("findComboMemberProblems", () => {
  it("accepts provider/model, aliases, and nested combos", () => {
    expect(
      findComboMemberProblems(["oc/mimo-v2.5-free", "my-alias", "other-combo"], {
        aliases: { "my-alias": "openai/gpt-5" },
        comboNames: ["other-combo"],
      }),
    ).toEqual([]);
  });

  it("rejects bare words like the pasted Body/Support/Last members", () => {
    const problems = findComboMemberProblems(["oc/space-bunny-free", "Body", "Support", "Last"], {
      aliases: {},
      comboNames: [],
    });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toMatch(/Body/);
    expect(problems.join(" ")).toMatch(/Support/);
    expect(problems.join(" ")).toMatch(/Last/);
  });

  it("dedupes, trims, and flags self-reference and bad shapes", () => {
    expect(
      findComboMemberProblems([" oc/x ", "oc/x", "", "/x", "x/", "self"], {
        aliases: {},
        comboNames: [],
        selfName: "self",
      }),
    ).toEqual([
      'duplicate model "oc/x"',
      "empty model entry",
      'bad model shape "/x" (want provider/model)',
      'bad model shape "x/" (want provider/model)',
      'combo "self" cannot include itself',
    ]);
  });

  it("rejects non-array models", () => {
    expect(findComboMemberProblems("oc/x", {})).toEqual(["models must be an array"]);
  });
});
