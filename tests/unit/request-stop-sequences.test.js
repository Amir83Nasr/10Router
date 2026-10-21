import { describe, it, expect } from "vitest";

import { claudeToOpenAIRequest } from "../../open-sse/translator/request/claude-to-openai.js";
import { openaiToClaudeRequest } from "../../open-sse/translator/request/openai-to-claude.js";

// ── STOP SEQUENCES AND TOP_P ─────────────────────────────────────────
// Claude's `stop_sequences` used to be dropped on the way to an OpenAI-dialect
// upstream. The two wires name the same things differently
// (stop_sequences ↔ stop), and `top_k` has no OpenAI equivalent — sending it
// would be an unknown-field 400.
//
// The one exception is the auto-mode classifier's own stop hint, which is
// removed rather than forwarded because OpenAI-dialect `stop` trims the
// matched text; concerns/classifier.js documents that policy and
// claude-message-body.test.js covers its detection.

const claudeBody = (extra = {}) => ({
  max_tokens: 64,
  messages: [{ role: "user", content: "hi" }],
  ...extra,
});

describe("Claude → OpenAI request parameters", () => {
  it("maps ordinary stop_sequences onto stop", () => {
    const out = claudeToOpenAIRequest("m", claudeBody({ stop_sequences: ["END"] }), true);
    expect(out.stop).toEqual(["END"]);
  });

  it("keeps a classifier's legacy stop hint off an OpenAI-dialect upstream", () => {
    // `stop` trims the match, which would leave the verdict unterminated.
    const out = claudeToOpenAIRequest(
      "m",
      claudeBody({
        system: "Respond with <block>yes</block> or <block>no</block>.",
        messages: [{ role: "user", content: "<transcript>x</transcript>" }],
        stop_sequences: ["</block>"],
      }),
      true,
    );
    expect(out).not.toHaveProperty("stop");
  });

  it("omits stop when the client sent none", () => {
    const out = claudeToOpenAIRequest("m", claudeBody(), true);
    expect(out).not.toHaveProperty("stop");
  });

  it("forwards top_p but never top_k", () => {
    const out = claudeToOpenAIRequest("m", claudeBody({ top_p: 0.9, top_k: 40 }), true);
    expect(out.top_p).toBe(0.9);
    expect(out).not.toHaveProperty("top_k");
  });
});

describe("OpenAI → Claude request parameters", () => {
  it("maps an array stop onto stop_sequences", () => {
    const out = openaiToClaudeRequest(
      "claude-sonnet-5",
      { messages: [{ role: "user", content: "hi" }], stop: ["END"] },
      true,
    );
    expect(out.stop_sequences).toEqual(["END"]);
  });

  it("wraps a single-string stop into an array", () => {
    const out = openaiToClaudeRequest(
      "claude-sonnet-5",
      { messages: [{ role: "user", content: "hi" }], stop: "END" },
      true,
    );
    expect(out.stop_sequences).toEqual(["END"]);
  });

  it("forwards top_p", () => {
    const out = openaiToClaudeRequest(
      "claude-sonnet-5",
      { messages: [{ role: "user", content: "hi" }], top_p: 0.5 },
      true,
    );
    expect(out.top_p).toBe(0.5);
  });
});
