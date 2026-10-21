import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { POST, DELETE } from "../../src/app/api/cli-tools/claude-settings/route.js";

// ── CLAUDE SETTINGS ROUTE (sandboxed HOST_HOME) ──────────
// Two Claude Code gates need a flag the client never sets on its own behind a
// gateway:
//   · TodoWrite/TodoRead are only offered for Anthropic's own model ids, so a
//     routed model id never gets the task list (CLAUDE_CODE_ENABLE_TODO_TOOLS).
//   · Auto mode's server-side classifier review asks the Anthropic API, which a
//     gateway cannot provide; without a declaration the CLI spends a dead
//     round-trip and shows its billing notice first
//     (CLAUDE_CODE_AUTO_MODE_SERVER=0).
describe("claude-settings route gateway flags", () => {
  let tmp;
  const realHostHome = process.env.HOST_HOME;
  const settingsPath = () => path.join(tmp, ".claude", "settings.json");
  const req = (body) => ({ json: async () => body });
  const readSettings = async () => JSON.parse(await fs.readFile(settingsPath(), "utf-8"));

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-settings-test-"));
    process.env.HOST_HOME = tmp;
  });

  afterAll(async () => {
    if (realHostHome === undefined) delete process.env.HOST_HOME;
    else process.env.HOST_HOME = realHostHome;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("POST writes the todo-tools and auto-mode flags and keeps existing settings", async () => {
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
    await fs.writeFile(settingsPath(), JSON.stringify({ theme: "dark", env: { KEEP: "me" } }));

    const res = await POST(
      req({ env: { ANTHROPIC_BASE_URL: "http://localhost:20128" }, exaMcpEnabled: false }),
    );
    expect(res.status).toBe(200);

    const settings = await readSettings();
    expect(settings.theme).toBe("dark");
    expect(settings.env.KEEP).toBe("me");
    expect(settings.env.ANTHROPIC_BASE_URL).toBe("http://localhost:20128/v1");
    expect(settings.env.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBe("1");
    expect(settings.env.CLAUDE_CODE_AUTO_MODE_SERVER).toBe("0");
  });

  it("DELETE removes the flags along with the gateway env", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);

    const settings = await readSettings();
    expect(settings.env?.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBeUndefined();
    expect(settings.env?.CLAUDE_CODE_AUTO_MODE_SERVER).toBeUndefined();
    expect(settings.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(settings.env?.KEEP).toBe("me");
  });
});
