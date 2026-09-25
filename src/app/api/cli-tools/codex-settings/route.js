"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { parseTOML, stringifyTOML } from "confbox";
import { isContainer, hostHome, hasHostHome } from "@/lib/isContainer";
import {
  PROFILE_PREFIX,
  PROFILE_SUFFIX,
  CATALOG_FILE,
  profileNamesForModels,
  mergeCatalogModels,
  modelsFromCatalogJson,
} from "./profiles.js";

const execAsync = promisify(exec);

// ── HELPERS ──────────────────────────────────────────────
const getCodexDir = () => path.join(hostHome(), ".codex");
const getCodexConfigPath = () => path.join(getCodexDir(), "config.toml");
const getCatalogPath = () => path.join(getCodexDir(), CATALOG_FILE);

// Best-effort account/bundled baseline so model_catalog_json does not wipe
// the user's ChatGPT models from the picker. Order: user's prior catalog →
// models_cache.json → `codex debug models` → our side-car minus profile models.
// Our own side-car is never a pristine baseline (it already holds the last
// selection); only used as a last resort so re-apply can still drop stale slugs.
const loadBaselineCatalogModels = async (parsed) => {
  const readModels = async (file) => {
    try {
      return modelsFromCatalogJson(JSON.parse(await fs.readFile(file, "utf-8")));
    } catch {
      return null;
    }
  };

  const configured = parsed?.model_catalog_json;
  if (typeof configured === "string" && configured.trim() && configured !== CATALOG_FILE) {
    const p = path.isAbsolute(configured) ? configured : path.join(getCodexDir(), configured);
    const models = await readModels(p);
    if (models?.length) return models;
  }

  const cache = await readModels(path.join(getCodexDir(), "models_cache.json"));
  if (cache?.length) return cache;

  try {
    const { stdout } = await execAsync("codex debug models", {
      env: { ...process.env, CODEX_HOME: getCodexDir() },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15_000,
      windowsHide: true,
    });
    const models = modelsFromCatalogJson(JSON.parse(stdout));
    if (models?.length) return models;
  } catch {
    /* codex missing or debug failed — fall through to our side-car */
  }

  const ours = await readModels(getCatalogPath());
  if (ours?.length) {
    // Drop slugs owned by existing profile files — those are re-injected from
    // the current selection, so deselected models do not stick around.
    const owned = new Set((await listProfileEntries()).map((e) => e.model));
    const accountOnly = ours.filter((m) => !owned.has(String(m.slug)));
    if (accountOnly.length) return accountOnly;
  }
  return null;
};

// Flatten confbox-parsed TOML into a writable object, preserving nested tables
const parsedToWritable = (obj) => obj ?? {};

// Set a nested key from a flat dotted path, creating intermediate objects as needed
const setNestedSection = (obj, dottedKey, value) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== "object") {
      cur[keys[i]] = {};
    }
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
};

// Delete a nested key from a flat dotted path
const deleteNestedSection = (obj, dottedKey) => {
  const keys = dottedKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (cur == null) return;
  }
  delete cur[keys[keys.length - 1]];
};

// Check if codex CLI is installed (via which/where or config file exists)
const checkCodexInstalled = async () => {
  try {
    const isWindows = os.platform() === "win32";
    const command = isWindows ? "where codex" : "which codex";
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    try {
      await fs.access(getCodexConfigPath());
      return true;
    } catch {
      return false;
    }
  }
};

// Read current config.toml
const readConfig = async () => {
  try {
    const configPath = getCodexConfigPath();
    const content = await fs.readFile(configPath, "utf-8");
    return content;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

// Check if config has 10Router settings
const has10RouterConfig = (config) => {
  if (!config) return false;
  return (
    config.includes('model_provider = "10router"') || config.includes("[model_providers.10router]")
  );
};

// Older versions of this tool hijacked the root model/provider (and subagent
// model), taking over the user's whole ChatGPT account default. Detect that so
// apply/reset can restore the account default.
const isLegacyHijack = (parsed) =>
  parsed?.model_provider === "10router" || parsed?.model_provider === "9router";

// Our profile files only: `10router-*.config.toml` next to config.toml
const listProfileEntries = async () => {
  try {
    const codexDir = getCodexDir();
    const files = await fs.readdir(codexDir);
    const entries = [];
    for (const file of files) {
      if (!file.startsWith(PROFILE_PREFIX) || !file.endsWith(PROFILE_SUFFIX)) continue;
      try {
        const raw = await fs.readFile(path.join(codexDir, file), "utf-8");
        const parsed = parseTOML(raw);
        entries.push({
          name: file.slice(0, -PROFILE_SUFFIX.length),
          file,
          model: parsed?.model || "",
        });
      } catch {
        /* skip unreadable/corrupt profile */
      }
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

// ── GET / STATUS ─────────────────────────────────────────
// GET - Check codex CLI and read current settings
export async function GET() {
  try {
    const isInstalled = await checkCodexInstalled();

    if (!isInstalled) {
      if (isContainer() && !hasHostHome()) {
        return NextResponse.json({
          installed: null,
          container: true,
          config: null,
          message: "Running in a container — configure the CLI on the host manually",
        });
      }
      return NextResponse.json({
        installed: false,
        config: null,
        message: "Codex CLI is not installed",
      });
    }

    const config = await readConfig();
    let rootHijacked = false;
    try {
      rootHijacked = isLegacyHijack(parseTOML(config || ""));
    } catch {
      /* unparseable config — treat as not hijacked */
    }

    let catalogActive = false;
    try {
      catalogActive = parseTOML(config || "")?.model_catalog_json === CATALOG_FILE;
    } catch {
      /* unparseable — leave false */
    }

    return NextResponse.json({
      installed: true,
      config,
      has10Router: has10RouterConfig(config),
      rootHijacked,
      profiles: await listProfileEntries(),
      catalogActive,
      configPath: getCodexConfigPath(),
    });
  } catch (error) {
    console.log("Error checking codex settings:", error);
    return NextResponse.json({ error: "Failed to check codex settings" }, { status: 500 });
  }
}

// ── POST / APPLY ─────────────────────────────────────────
// POST - Update 10Router settings (merge with existing config).
// Writes: inert provider section, one profile file per model, and a merged
// model_catalog_json so models appear in /model. Root `model` /
// `model_provider` stay on the user's ChatGPT account.
export async function POST(request) {
  try {
    if (isContainer() && !hasHostHome()) {
      return NextResponse.json(
        { error: "Running in a container — apply the manual config on the host instead" },
        { status: 409 },
      );
    }
    const { baseUrl, apiKey, model, models, subagentModel } = await request.json();

    const modelList = (Array.isArray(models) && models.length ? models : model ? [model] : [])
      .map((m) => String(m || "").trim())
      .filter(Boolean);

    if (!baseUrl || !apiKey || modelList.length === 0) {
      return NextResponse.json(
        { error: "baseUrl, apiKey and at least one model are required" },
        { status: 400 },
      );
    }

    const codexDir = getCodexDir();
    const configPath = getCodexConfigPath();

    // Ensure directory exists
    await fs.mkdir(codexDir, { recursive: true });

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch {
      /* No existing config */
    }

    // Undo a legacy hijack: hand the root model/provider (and the root
    // subagent model we used to write) back to the user's account default.
    if (isLegacyHijack(parsed)) {
      delete parsed.model;
      delete parsed.model_provider;
      deleteNestedSection(parsed, "agents.default_subagent_model");
    }

    // Drop the legacy 9router provider section if a pre-rebrand config exists
    deleteNestedSection(parsed, "model_providers.9router");
    // Subagent model is a scalar under [agents]; the dotted key was our old form
    deleteNestedSection(parsed, "agents.subagent");

    // Inert provider definition only — custom providers ignore auth.json, so
    // the key travels as a static header. Never touch root `model` here.
    // Ensure /v1 suffix is added only once
    const normalizedBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    setNestedSection(parsed, "model_providers.10router", {
      name: "10Router",
      base_url: normalizedBaseUrl,
      wire_api: "responses",
      http_headers: { Authorization: `Bearer ${apiKey}` },
    });

    // Picker visibility: merge selected models into a side-car catalog and
    // point model_catalog_json at it. Without this, profiles alone never
    // surface the models in /model. Never set root model_provider here —
    // that would send ChatGPT account models through 10Router too.
    const baseline = await loadBaselineCatalogModels(parsed);
    let catalogWritten = false;
    if (baseline) {
      const { models } = mergeCatalogModels(baseline, modelList);
      await fs.writeFile(getCatalogPath(), `${JSON.stringify({ models }, null, 2)}\n`);
      parsed.model_catalog_json = CATALOG_FILE;
      catalogWritten = true;
    } else if (parsed.model_catalog_json === CATALOG_FILE) {
      // No baseline left — drop our pointer rather than ship a catalog that
      // would hide every account model.
      delete parsed.model_catalog_json;
    }

    // Write merged config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // One profile per model: `codex --profile 10router-<slug>` layers
    // model_provider + the exact model name over the untouched base config.
    // ponytail: subagent lives in each profile; if codex ignores profile-level
    // [agents], subagents fall back to the profile's main model.
    const wanted = profileNamesForModels(modelList);
    for (const entry of await listProfileEntries()) {
      if (!wanted.some((w) => w.name === entry.name)) {
        await fs.unlink(path.join(codexDir, entry.file)).catch(() => {});
      }
    }
    for (const { model: modelName, file } of wanted) {
      const profile = { model: modelName, model_provider: "10router" };
      if (catalogWritten) profile.model_catalog_json = CATALOG_FILE;
      if (subagentModel) {
        profile.agents = { default_subagent_model: subagentModel };
      }
      await fs.writeFile(path.join(codexDir, file), stringifyTOML(profile));
    }

    return NextResponse.json({
      success: true,
      message: "Codex settings applied successfully!",
      configPath,
      profiles: wanted,
      catalogWritten,
    });
  } catch (error) {
    console.log("Error updating codex settings:", error);
    return NextResponse.json({ error: "Failed to update codex settings" }, { status: 500 });
  }
}

// ── DELETE / RESET ───────────────────────────────────────
// DELETE - Remove 10Router settings only (keep other settings; never auth.json)
export async function DELETE() {
  try {
    if (isContainer() && !hasHostHome()) {
      return NextResponse.json(
        { error: "Running in a container — apply the manual config on the host instead" },
        { status: 409 },
      );
    }
    const configPath = getCodexConfigPath();

    // Read and parse existing config
    let parsed = {};
    try {
      const existingConfig = await fs.readFile(configPath, "utf-8");
      parsed = parsedToWritable(parseTOML(existingConfig));
    } catch (error) {
      if (error.code === "ENOENT") {
        return NextResponse.json({
          success: true,
          message: "No config file to reset",
        });
      }
      throw error;
    }

    // Remove 10Router related root fields only if they point to 10router/9router
    if (isLegacyHijack(parsed)) {
      delete parsed.model;
      delete parsed.model_provider;
    }

    // Remove 10router provider section (plus legacy 9router section from pre-rebrand configs)
    deleteNestedSection(parsed, "model_providers.10router");
    deleteNestedSection(parsed, "model_providers.9router");

    // Remove subagent configuration (both the current key and the legacy role form);
    // this tool has always owned these keys.
    deleteNestedSection(parsed, "agents.default_subagent_model");
    deleteNestedSection(parsed, "agents.subagent");

    // Drop our side-car catalog pointer (leave a user-supplied path alone).
    if (parsed.model_catalog_json === CATALOG_FILE) delete parsed.model_catalog_json;

    // Write updated config
    const configContent = stringifyTOML(parsed);
    await fs.writeFile(configPath, configContent);

    // Remove our profile files and catalog (10router-* only)
    for (const entry of await listProfileEntries()) {
      await fs.unlink(path.join(getCodexDir(), entry.file)).catch(() => {});
    }
    await fs.unlink(getCatalogPath()).catch(() => {});

    // auth.json is never touched — the user's ChatGPT account (tokens, voice,
    // plan) must survive a reset.

    return NextResponse.json({
      success: true,
      message: "10Router settings removed successfully",
    });
  } catch (error) {
    console.log("Error resetting codex settings:", error);
    return NextResponse.json({ error: "Failed to reset codex settings" }, { status: 500 });
  }
}
