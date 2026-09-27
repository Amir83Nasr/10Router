// ANSI-colored terminal lines still classify correctly: the buffer strips
// ANSI before classifying, so level/category must survive color codes.
import { describe, expect, it } from "vitest";
import { classifyLogLine } from "../../src/lib/logLine.js";

const ANSI_RE = /\x1b\[[0-9;]*m/g;
const strip = (s) => s.replace(ANSI_RE, "");

describe("colored log lines", () => {
  it("strips logger ANSI codes to a greppable line", () => {
    const colored = "\x1b[2m[09:00:13]\x1b[0m \x1b[31mERROR\x1b[0m \x1b[2m[TEST]\x1b[0m boom";
    expect(strip(colored)).toBe("[09:00:13] ERROR [TEST] boom");
  });

  it("classifies the stripped line as error", () => {
    const { level } = classifyLogLine(
      "error",
      strip("\x1b[2m[09:00:13]\x1b[0m \x1b[31mERROR\x1b[0m \x1b[2m[TEST]\x1b[0m boom"),
    );
    expect(level).toBe("error");
  });

  it("classifies a colored DONE line as done", () => {
    const { category } = classifyLogLine("log", strip("[09:00:13] [abcd] DONE ok 1200ms"));
    expect(category).toBe("done");
  });
});
