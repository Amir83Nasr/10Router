// Profile-file helpers for the10Router Codex CLI integration.
//
// Each added model becomes `~/.codex/10router-<slug>.config.toml`, layered on
// top of the user's base config via `codex --profile <name>`. The base config
// only gains an inert [model_providers.10router] section — root `model` /
// `model_provider` are never written, so the user's ChatGPT account stays the
// untouched default (voice, plan, built-in models all keep working).
//
// Selected models are also merged into a side-car `model_catalog_json` so they
// appear in codex's `/model` picker. Catalog entries carry no provider field
// (codex has one active provider per session): the default session keeps the
// account provider; `--profile` switches to 10Router for the exact model.

// ── PROFILE FILES ────────────────────────────────────────
export const PROFILE_PREFIX = "10router-";
export const PROFILE_SUFFIX = ".config.toml";

// Plain `--profile` name for a model: keep [A-Za-z0-9_-], collapse the rest
// into dashes. The *model value* itself stays byte-exact — only the handle
// used for the profile file/command is normalized.
export function profileNameForModel(model) {
  const slug = String(model ?? "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${PROFILE_PREFIX}${slug || "model"}`;
}

export function profileFileName(name) {
  return `${name}${PROFILE_SUFFIX}`;
}

// Map a model list to unique { model, name, file } entries. Deterministic for
// a given order, so re-applying the same selection rewrites the same files.
export function profileNamesForModels(models) {
  const used = new Set();
  const out = [];
  for (const model of models) {
    const base = profileNameForModel(model);
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}-${n++}`;
    used.add(name);
    out.push({ model: String(model), name, file: profileFileName(name) });
  }
  return out;
}

// ── MODEL CATALOG ────────────────────────────────────────
// Side-car catalog the picker reads; replaces codex's built-in list unless we
// merge baselines in. Filename must not collide with profile files.
export const CATALOG_FILE = "10router-model-catalog.json";

// ModelInfo needs full fields (supported_reasoning_levels, …) or codex rejects
// the whole catalog. Clone a baseline entry and pin slug/display_name to the
// byte-exact model value so /model shows the same string the user selected.
export function catalogEntryForModel(model, baselineEntry) {
  const proto =
    baselineEntry && typeof baselineEntry === "object"
      ? JSON.parse(JSON.stringify(baselineEntry))
      : {};
  const entry = {
    ...proto,
    slug: String(model),
    display_name: String(model),
    visibility: "list",
    priority: 0,
    description: proto.description || "10Router model",
  };
  // Do not inherit ChatGPT-plan payloads (upgrade nux / model_messages) from
  // the account template — our models are not plan-gated OpenAI models.
  delete entry.upgrade;
  delete entry.availability_nux;
  delete entry.model_messages;
  if (
    !Array.isArray(entry.supported_reasoning_levels) ||
    entry.supported_reasoning_levels.length === 0
  ) {
    entry.supported_reasoning_levels = [
      { effort: "low", description: "Fast responses with lighter reasoning" },
      { effort: "medium", description: "Balances speed and reasoning depth for everyday tasks" },
      { effort: "high", description: "Greater reasoning depth for complex problems" },
    ];
  }
  if (entry.shell_type == null) entry.shell_type = "unified_exec";
  if (entry.supported_in_api == null) entry.supported_in_api = true;
  return entry;
}

// baselineModels: account/bundled entries to keep visible. selectedModels:
// exact 10Router slugs to inject (replacing any prior entry with the same slug).
export function mergeCatalogModels(baselineModels, selectedModels) {
  const baseline = Array.isArray(baselineModels) ? baselineModels.filter((m) => m && m.slug) : [];
  const template = baseline[0] || null;
  const selected = [...new Set(selectedModels.filter(Boolean).map((m) => String(m)))];
  const selectedSet = new Set(selected);
  const kept = baseline.filter((m) => !selectedSet.has(String(m.slug)));
  const injected = selected.map((m) => catalogEntryForModel(m, template));
  return { models: [...injected, ...kept] };
}

// Normalize any catalog-shaped JSON to a models array (or null).
export function modelsFromCatalogJson(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.models)) return data.models.filter((m) => m && m.slug);
  if (Array.isArray(data)) return data.filter((m) => m && m.slug);
  return null;
}
