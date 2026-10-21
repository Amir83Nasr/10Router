import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { POST, DELETE } from "../../src/app/api/cli-tools/claude-settings/route.js";

// ── CLAUDE SETTINGS ROUTE (sandboxed HOST_HOME) ──────────
// Claude Code only advertises TodoWrite/TodoRead when the model id is one of
// Anthropic's own; every routed model is a custom id, so the route must write
// CLAUDE_CODE_ENABLE_TODO_TOOLS=1 alongside the gateway config.
describe("claude-settings route todo tools flag", () => {
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

  it("POST writes CLAUDE_CODE_ENABLE_TODO_TOOLS=1 and keeps existing settings", async () => {
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
  });

  it("DELETE removes the flag along with the gateway env", async () => {
    const res = await DELETE();
    expect(res.status).toBe(200);

    const settings = await readSettings();
    expect(settings.env?.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBeUndefined();
    expect(settings.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(settings.env?.KEEP).toBe("me");
  });
});
