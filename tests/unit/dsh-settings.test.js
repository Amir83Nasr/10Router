import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseYAML } from "confbox";

import { GET, POST, DELETE } from "../../src/app/api/cli-tools/dsh-settings/route.js";

// ── DSH ROUTE (sandboxed DSH_HOME) ───────────────────────
describe("dsh-settings route (sandboxed DSH_HOME)", () => {
  let tmp;
  const realDshHome = process.env.DSH_HOME;
  const patchPath = () => path.join(tmp, "profiles", "web", "cordis.patch.yml");
  const credsPath = () => path.join(tmp, ".credentials.yaml");
  const req = (body) => ({ json: async () => body });

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-settings-test-"));
    process.env.DSH_HOME = tmp;
    await fs.mkdir(path.dirname(patchPath()), { recursive: true });
    await fs.writeFile(
      patchPath(),
      "# header comment\n- id: ui-theme\n  config:\n    preference: light\n",
    );
  });

  afterAll(async () => {
    if (realDshHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = realDshHome;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("GET reports not configured before apply", async () => {
    const data = await (await GET()).json();
    expect(data.installed).toBe(true);
    expect(data.has10Router).toBe(false);
    expect(data.dsh).toBeNull();
  });

  it("POST rejects an empty model list", async () => {
    const res = await POST(req({ baseUrl: "http://x", apiKey: "k", models: [] }));
    expect(res.status).toBe(400);
  });

  it("POST writes the 10router provider, default model, and key ref", async () => {
    const res = await POST(
      req({
        baseUrl: "http://localhost:20128",
        apiKey: "sk_test",
        models: ["oc/big-pickle", "cc/claude-opus-5"],
        defaultModel: "oc/big-pickle",
      }),
    );
    expect(res.status).toBe(200);

    const doc = parseYAML(await fs.readFile(patchPath(), "utf-8"));
    const llm = doc.find((e) => e.id === "llm-pi-ai");
    const route = llm.config.providers["10router"];
    expect(route.baseURL).toBe("http://localhost:20128/v1");
    expect(route.apiKeyEnv).toBe("TEN_ROUTER_API_KEY");
    expect(route.api).toBe("openai-completions");
    expect(route.models.map((m) => m.id)).toEqual(["oc/big-pickle", "cc/claude-opus-5"]);
    const def = doc.find((e) => e.id === "agent-default-model");
    expect(def.config).toEqual({ provider: "10router", model: "oc/big-pickle" });
    // Unrelated entries untouched, header comment kept
    expect(doc.find((e) => e.id === "ui-theme").config.preference).toBe("light");
    expect((await fs.readFile(patchPath(), "utf-8")).startsWith("# header comment")).toBe(true);

    const creds = parseYAML(await fs.readFile(credsPath(), "utf-8"));
    expect(creds.refs.TEN_ROUTER_API_KEY).toBe("sk_test");
  });

  it("GET reports connected after apply", async () => {
    const data = await (await GET()).json();
    expect(data.has10Router).toBe(true);
    expect(data.dsh.baseURL).toBe("http://localhost:20128/v1");
    expect(data.dsh.models).toEqual(["oc/big-pickle", "cc/claude-opus-5"]);
    expect(data.dsh.defaultModel).toBe("oc/big-pickle");
  });

  it("DELETE removes only 10Router traces", async () => {
    const res = await DELETE();
    expect((await res.json()).success).toBe(true);
    const doc = parseYAML(await fs.readFile(patchPath(), "utf-8"));
    expect(doc.find((e) => e.id === "llm-pi-ai").config.providers?.["10router"]).toBeUndefined();
    expect(doc.find((e) => e.id === "agent-default-model")).toBeUndefined();
    expect(doc.find((e) => e.id === "ui-theme")).toBeTruthy();
    const creds = parseYAML(await fs.readFile(credsPath(), "utf-8"));
    expect(creds.refs?.TEN_ROUTER_API_KEY).toBeUndefined();
  });
});
