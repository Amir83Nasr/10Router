"use server";

import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { parseYAML, stringifyYAML } from "confbox";
import { isContainer, hostHome, hasHostHome } from "@/lib/isContainer";

// 10Router route id written by Apply. GET also honors the legacy "ten-router"
// id so hand-written configs (same shape, hyphenated id) read as connected.
const ROUTE_ID = "10router";
const LEGACY_ROUTE_ID = "ten-router";
const API_KEY_ENV = "TEN_ROUTER_API_KEY";
const LLM_ENTRY = "llm-pi-ai";
const DEFAULT_MODEL_ENTRY = "agent-default-model";
const WEB_PROFILE = "web";

type YamlEntry = { id?: string; name?: string; config?: Record<string, any> };
type YamlDoc = YamlEntry[];

const getDshHome = () => process.env.DSH_HOME || path.join(hostHome(), ".dsh");
const getPatchPath = () => path.join(getDshHome(), "profiles", WEB_PROFILE, "cordis.patch.yml");
const getCredentialsPath = () => path.join(getDshHome(), ".credentials.yaml");

const ensureV1 = (url: string) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

// confbox drops YAML comments on stringify; keep the file's leading comment
// block (cordis.patch.yml ships a 4-line header) so Apply is not destructive.
const readYaml = async (file: string) => {
  try {
    return parseYAML(await fs.readFile(file, "utf-8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

const writeYaml = async (file: string, doc: unknown, mode?: number) => {
  let header = "";
  try {
    const prev = await fs.readFile(file, "utf-8");
    const m = prev.match(/^(?:#[^\n]*\n|\n)*/);
    if (m) header = m[0];
  } catch {
    /* new file — no header to keep */
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${header}${stringifyYAML(doc)}`);
  if (mode) await fs.chmod(file, mode);
};

const asEntries = (doc: unknown): YamlDoc => (Array.isArray(doc) ? doc : []);
const findEntry = (doc: unknown, id: string) => asEntries(doc).find((e) => e?.id === id);

const routeOf = (doc: unknown) =>
  findEntry(doc, LLM_ENTRY)?.config?.providers?.[ROUTE_ID] ||
  findEntry(doc, LLM_ENTRY)?.config?.providers?.[LEGACY_ROUTE_ID] ||
  null;

const has10RouterConfig = (doc: unknown) => !!routeOf(doc);

// ── GET / STATUS ─────────────────────────────────────────
export async function GET() {
  try {
    let installed = true;
    try {
      await fs.access(getDshHome());
    } catch {
      installed = false;
    }
    if (!installed) {
      if (isContainer() && !hasHostHome()) {
        return NextResponse.json({
          installed: null,
          container: true,
          config: null,
          message: "Running in a container — configure DSH on the host manually",
        });
      }
      return NextResponse.json({
        installed: false,
        config: null,
        message: "No DSH home (~/.dsh) found — launch `dsh web` once first",
      });
    }

    const patchPath = getPatchPath();
    let doc = null;
    try {
      doc = await readYaml(patchPath);
    } catch {
      doc = null;
    }
    const route = doc ? routeOf(doc) : null;
    const def = doc ? findEntry(doc, DEFAULT_MODEL_ENTRY)?.config : null;
    return NextResponse.json({
      installed: true,
      config: doc,
      has10Router: !!doc && has10RouterConfig(doc),
      configPath: patchPath,
      dsh: route
        ? {
            baseURL: route.baseURL || null,
            models: (route.models || []).map((m: any) => m?.id).filter(Boolean),
            defaultModel:
              def?.provider === ROUTE_ID || def?.provider === LEGACY_ROUTE_ID
                ? def.model || null
                : null,
          }
        : null,
    });
  } catch (error) {
    console.log("Error checking dsh settings:", error);
    return NextResponse.json({ error: "Failed to check dsh settings" }, { status: 500 });
  }
}

// ── POST / APPLY ─────────────────────────────────────────
export async function POST(request: Request) {
  try {
    if (isContainer() && !hasHostHome()) {
      return NextResponse.json(
        { error: "Running in a container — apply the manual config on the host instead" },
        { status: 409 },
      );
    }
    const { baseUrl, apiKey, models, defaultModel } = await request.json();
    const modelList = (Array.isArray(models) ? models : [])
      .map((m) => String(m || "").trim())
      .filter(Boolean);
    if (!baseUrl || !apiKey || modelList.length === 0) {
      return NextResponse.json(
        { error: "baseUrl, apiKey and at least one model are required" },
        { status: 400 },
      );
    }

    const patchPath = getPatchPath();
    let doc: unknown = null;
    try {
      doc = await readYaml(patchPath);
    } catch {
      doc = null;
    }
    if (!Array.isArray(doc)) doc = [];

    let llm = findEntry(doc, LLM_ENTRY);
    if (!llm) {
      llm = { id: LLM_ENTRY, name: "@deepseek-ai/dsh-llm-pi-ai", config: {} };
      (doc as YamlDoc).push(llm);
    }
    llm.config = llm.config && typeof llm.config === "object" ? llm.config : {};
    const providers =
      llm.config.providers && typeof llm.config.providers === "object" ? llm.config.providers : {};
    providers[ROUTE_ID] = {
      ...(providers[ROUTE_ID] && typeof providers[ROUTE_ID] === "object"
        ? providers[ROUTE_ID]
        : {}),
      displayName: "10Router",
      apiKeyEnv: API_KEY_ENV,
      api: "openai-completions",
      baseURL: ensureV1(baseUrl),
      models: modelList.map((id: string) => ({ id, name: id })),
    };
    llm.config.providers = providers;

    const effectiveDefault = defaultModel || modelList[0];
    let def = findEntry(doc, DEFAULT_MODEL_ENTRY);
    if (!def) {
      def = { id: DEFAULT_MODEL_ENTRY, name: "@deepseek-ai/dsh-agent-default-model" };
      (doc as YamlDoc).push(def);
    }
    def.config = { provider: ROUTE_ID, model: effectiveDefault };

    await writeYaml(patchPath, doc);

    // Credentials plane: refs map env names straight to keys (0600, like dsh).
    const credsPath = getCredentialsPath();
    let creds: any = null;
    try {
      creds = await readYaml(credsPath);
    } catch {
      creds = null;
    }
    if (!creds || typeof creds !== "object") creds = { version: 1 };
    const refs = creds.refs && typeof creds.refs === "object" ? creds.refs : {};
    refs[API_KEY_ENV] = apiKey;
    creds.refs = refs;
    await writeYaml(credsPath, creds, 0o600);

    return NextResponse.json({ success: true, configPath: patchPath });
  } catch (error) {
    console.log("Error applying dsh settings:", error);
    return NextResponse.json({ error: "Failed to apply settings" }, { status: 500 });
  }
}

// ── DELETE / RESET ───────────────────────────────────────
export async function DELETE() {
  try {
    if (isContainer() && !hasHostHome()) {
      return NextResponse.json(
        { error: "Running in a container — apply the manual config on the host instead" },
        { status: 409 },
      );
    }
    const patchPath = getPatchPath();
    let doc: unknown = null;
    try {
      doc = await readYaml(patchPath);
    } catch {
      doc = null;
    }
    if (Array.isArray(doc)) {
      const llm = findEntry(doc, LLM_ENTRY);
      if (llm?.config?.providers) {
        delete llm.config.providers[ROUTE_ID];
        if (Object.keys(llm.config.providers).length === 0) delete llm.config.providers;
      }
      const def = findEntry(doc, DEFAULT_MODEL_ENTRY);
      if (def?.config?.provider === ROUTE_ID) {
        (doc as YamlDoc).splice((doc as YamlDoc).indexOf(def), 1);
      }
      await writeYaml(patchPath, doc);
    }

    // Drop our key ref only when no remaining provider still points at it.
    const stillUsed = asEntries(doc).some((e) =>
      Object.values(e?.config?.providers || {}).some((p: any) => p?.apiKeyEnv === API_KEY_ENV),
    );
    if (!stillUsed) {
      const credsPath = getCredentialsPath();
      let creds: any = null;
      try {
        creds = await readYaml(credsPath);
      } catch {
        creds = null;
      }
      if (creds?.refs?.[API_KEY_ENV]) {
        delete creds.refs[API_KEY_ENV];
        await writeYaml(credsPath, creds, 0o600);
      }
    }

    return NextResponse.json({ success: true, message: "DSH 10Router settings removed" });
  } catch (error) {
    console.log("Error resetting dsh settings:", error);
    return NextResponse.json({ error: "Failed to reset settings" }, { status: 500 });
  }
}
