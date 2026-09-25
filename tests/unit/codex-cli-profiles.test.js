import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseTOML } from "confbox";

import {
  profileNameForModel,
  profileFileName,
  profileNamesForModels,
  mergeCatalogModels,
  modelsFromCatalogJson,
  CATALOG_FILE,
} from "../../src/app/api/cli-tools/codex-settings/profiles.js";
import { GET, POST, DELETE } from "../../src/app/api/cli-tools/codex-settings/route.js";

// ── PROFILE NAMING ───────────────────────────────────────
describe("codex profile naming", () => {
  it("slugifies models into plain --profile names", () => {
    expect(profileNameForModel("anthropic/claude-sonnet-4.5")).toBe(
      "10router-anthropic-claude-sonnet-4-5",
    );
    expect(profileNameForModel("openai/gpt-4o")).toBe("10router-openai-gpt-4o");
    expect(profileNameForModel("")).toBe("10router-model");
  });

  it("keeps model values byte-exact and disambiguates slug collisions", () => {
    const list = profileNamesForModels(["a/b", "a-b", "a b"]);
    expect(list.map((e) => e.model)).toEqual(["a/b", "a-b", "a b"]);
    expect(new Set(list.map((e) => e.name)).size).toBe(3);
    expect(list[0].file).toBe("10router-a-b.config.toml");
    expect(list[1].file).toBe("10router-a-b-2.config.toml");
    // Deterministic across re-applies of the same list
    expect(profileNamesForModels(["a/b", "a-b", "a b"]).map((e) => e.name)).toEqual(
      list.map((e) => e.name),
    );
  });

  it("round-trips name <-> file", () => {
    expect(profileFileName("10router-x")).toBe("10router-x.config.toml");
  });
});

// ── MODEL CATALOG MERGE ──────────────────────────────────
describe("codex model catalog merge", () => {
  const baseline = [
    {
      slug: "gpt-5.6-terra",
      display_name: "GPT-5.6-Terra",
      supported_reasoning_levels: [{ effort: "medium", description: "m" }],
      model_messages: { persistent_instructions: "plan-gated" },
      upgrade: { id: "pro" },
    },
    { slug: "gpt-5.5", display_name: "GPT-5.5", supported_reasoning_levels: [] },
  ];

  it("keeps account models and injects exact-name 10Router models", () => {
    const { models } = mergeCatalogModels(baseline, ["oc/mimo-v2.6-flash-free", "oc/big-pickle"]);
    const slugs = models.map((m) => m.slug);
    expect(slugs).toEqual(["oc/mimo-v2.6-flash-free", "oc/big-pickle", "gpt-5.6-terra", "gpt-5.5"]);
    const injected = models[0];
    expect(injected.display_name).toBe("oc/mimo-v2.6-flash-free");
    expect(injected.visibility).toBe("list");
    expect(injected.supported_reasoning_levels.length).toBeGreaterThan(0);
    // No plan nux / ChatGPT persistent payload from the account template
    expect(injected.upgrade).toBeUndefined();
    expect(injected.availability_nux).toBeUndefined();
    expect(injected.model_messages).toBeUndefined();
  });

  it("replaces a same-slug baseline entry instead of duplicating", () => {
    const { models } = mergeCatalogModels(baseline, ["gpt-5.5"]);
    expect(models.filter((m) => m.slug === "gpt-5.5")).toHaveLength(1);
    expect(models[0].display_name).toBe("gpt-5.5");
  });

  it("normalizes catalog JSON shapes", () => {
    expect(modelsFromCatalogJson({ models: [{ slug: "a" }] })).toEqual([{ slug: "a" }]);
    expect(modelsFromCatalogJson([{ slug: "a" }])).toEqual([{ slug: "a" }]);
    expect(modelsFromCatalogJson({ extra: [] })).toBeNull();
    expect(modelsFromCatalogJson(null)).toBeNull();
  });
});

// ── ROUTE / SANDBOX ──────────────────────────────────────
describe("codex-settings route (sandboxed HOST_HOME)", () => {
  let tmp;
  const realHostHome = process.env.HOST_HOME;
  const codexDir = () => path.join(tmp, ".codex");
  const configPath = () => path.join(codexDir(), "config.toml");
  const catalogPath = () => path.join(codexDir(), CATALOG_FILE);
  const readConfig = async () => parseTOML(await fs.readFile(configPath(), "utf-8"));
  const req = (body) => ({ json: async () => body });

  const LEGACY_HIJACK = `
notify = ["/custom/notify"]
model = "anthropic/claude-old"
model_provider = "10router"

[model_providers.10router]
name = "10Router"
base_url = "http://old.example/v1"
wire_api = "responses"

[agents]
default_subagent_model = "anthropic/claude-old"
subagent = "anthropic/claude-old"
`;

  const CACHE_MODELS = [
    {
      slug: "gpt-5.6-terra",
      display_name: "GPT-5.6-Terra",
      supported_reasoning_levels: [{ effort: "medium", description: "m" }],
      visibility: "list",
    },
    {
      slug: "gpt-5.5",
      display_name: "GPT-5.5",
      supported_reasoning_levels: [{ effort: "medium", description: "m" }],
      visibility: "list",
    },
  ];

  beforeAll(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "codex-settings-test-"));
    process.env.HOST_HOME = tmp;
    await fs.mkdir(codexDir(), { recursive: true });
    await fs.writeFile(configPath(), LEGACY_HIJACK);
    await fs.writeFile(
      path.join(codexDir(), "auth.json"),
      JSON.stringify({ tokens: { access_token: "user-secret" }, last_refresh: "x" }, null, 2),
    );
    // Baseline for model_catalog_json merge (avoids shelling out to codex)
    await fs.writeFile(
      path.join(codexDir(), "models_cache.json"),
      JSON.stringify({
        fetched_at: "2026-09-23T00:00:00Z",
        etag: "test",
        client_version: "0.0.0",
        models: CACHE_MODELS,
      }),
    );
  });

  afterAll(async () => {
    if (realHostHome === undefined) delete process.env.HOST_HOME;
    else process.env.HOST_HOME = realHostHome;
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("GET flags a legacy root hijack before apply", async () => {
    const data = await (await GET()).json();
    expect(data.installed).toBeTruthy();
    expect(data.rootHijacked).toBe(true);
    expect(data.has10Router).toBe(true);
    expect(data.profiles).toEqual([]);
    expect(data.catalogActive).toBe(false);
  });

  it("POST restores the account default, keeps unrelated config, writes exact-name profiles + catalog", async () => {
    const res = await POST(
      req({
        baseUrl: "http://localhost:20128",
        apiKey: "sk_test",
        models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4o"],
        subagentModel: "anthropic/claude-haiku",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles.map((p) => p.model)).toEqual([
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o",
    ]);
    expect(body.catalogWritten).toBe(true);

    const parsed = await readConfig();
    // Legacy hijack undone — root model/provider back to account default
    expect(parsed.model).toBeUndefined();
    expect(parsed.model_provider).toBeUndefined();
    expect(parsed.agents?.default_subagent_model).toBeUndefined();
    expect(parsed.agents?.subagent).toBeUndefined();
    // Unrelated user settings untouched
    expect(parsed.notify).toEqual(["/custom/notify"]);
    // Picker catalog without hijacking the session provider
    expect(parsed.model_catalog_json).toBe(CATALOG_FILE);
    // Inert provider section with normalized base_url + static auth header
    expect(parsed.model_providers?.["10router"]?.base_url).toBe("http://localhost:20128/v1");
    expect(parsed.model_providers?.["10router"]?.http_headers?.Authorization).toBe(
      "Bearer sk_test",
    );

    // Catalog: exact names + baseline account models preserved
    const catalog = JSON.parse(await fs.readFile(catalogPath(), "utf-8"));
    const slugs = catalog.models.map((m) => m.slug);
    expect(slugs).toContain("anthropic/claude-sonnet-4.5");
    expect(slugs).toContain("openai/gpt-4o");
    expect(slugs).toContain("gpt-5.6-terra");
    expect(slugs).toContain("gpt-5.5");
    expect(catalog.models.find((m) => m.slug === "openai/gpt-4o").display_name).toBe(
      "openai/gpt-4o",
    );

    // Profile files carry the exact model name
    const claude = parseTOML(
      await fs.readFile(
        path.join(codexDir(), "10router-anthropic-claude-sonnet-4-5.config.toml"),
        "utf-8",
      ),
    );
    expect(claude.model).toBe("anthropic/claude-sonnet-4.5");
    expect(claude.model_provider).toBe("10router");
    expect(claude.model_catalog_json).toBe(CATALOG_FILE);
    expect(claude.agents?.default_subagent_model).toBe("anthropic/claude-haiku");

    const gpt = parseTOML(
      await fs.readFile(path.join(codexDir(), "10router-openai-gpt-4o.config.toml"), "utf-8"),
    );
    expect(gpt.model).toBe("openai/gpt-4o");

    // auth.json must be byte-identical — account stays untouched
    const auth = await fs.readFile(path.join(codexDir(), "auth.json"), "utf-8");
    expect(JSON.parse(auth).tokens.access_token).toBe("user-secret");
    expect(auth).not.toContain("OPENAI_API_KEY");
  });

  it("GET reports profiles, catalog, and no hijack after apply", async () => {
    const data = await (await GET()).json();
    expect(data.rootHijacked).toBe(false);
    expect(data.catalogActive).toBe(true);
    expect(data.profiles.map((p) => p.model).sort()).toEqual([
      "anthropic/claude-sonnet-4.5",
      "openai/gpt-4o",
    ]);
  });

  it("re-apply with a single legacy `model` body sweeps stale profiles", async () => {
    const res = await POST(
      req({ baseUrl: "http://localhost:20128/v1", apiKey: "sk_test", model: "openai/gpt-4o" }),
    );
    expect(res.status).toBe(200);
    const files = (await fs.readdir(codexDir())).filter(
      (f) => f.startsWith("10router-") && f.endsWith(".config.toml"),
    );
    expect(files).toEqual(["10router-openai-gpt-4o.config.toml"]);

    const catalog = JSON.parse(await fs.readFile(catalogPath(), "utf-8"));
    const slugs = catalog.models.map((m) => m.slug);
    expect(slugs).toContain("openai/gpt-4o");
    expect(slugs).not.toContain("anthropic/claude-sonnet-4.5");
    expect(slugs).toContain("gpt-5.6-terra");
  });

  it("POST rejects an empty model list", async () => {
    const res = await POST(req({ baseUrl: "http://x", apiKey: "k", models: [] }));
    expect(res.status).toBe(400);
  });

  it("DELETE removes only 10Router traces and never touches auth.json", async () => {
    const authBefore = await fs.readFile(path.join(codexDir(), "auth.json"), "utf-8");
    const res = await DELETE();
    expect((await res.json()).success).toBe(true);

    const parsed = await readConfig();
    expect(parsed.notify).toEqual(["/custom/notify"]);
    expect(parsed.model_provider).toBeUndefined();
    expect(parsed.model).toBeUndefined();
    expect(parsed.model_providers?.["10router"]).toBeUndefined();
    expect(parsed.agents?.default_subagent_model).toBeUndefined();
    expect(parsed.model_catalog_json).toBeUndefined();

    const files = (await fs.readdir(codexDir())).filter((f) => f.startsWith("10router-"));
    expect(files).toEqual([]);

    const authAfter = await fs.readFile(path.join(codexDir(), "auth.json"), "utf-8");
    expect(authAfter).toBe(authBefore);
  });
});
