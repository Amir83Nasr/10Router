// Re-export from open-sse with localDb integration
import { getModelAliases, getComboByName, getProviderNodes } from "@/lib/localDb";
import {
  parseModel as parseModelCore,
  resolveModelAliasFromMap,
  getModelInfoCore,
} from "open-sse/services/model.js";
import REGISTRY from "open-sse/providers/registry/index.js";

const RESERVED_PROVIDER_PREFIXES = new Set<string>();
for (const entry of REGISTRY) {
  RESERVED_PROVIDER_PREFIXES.add(entry.id);
  if (entry.alias) RESERVED_PROVIDER_PREFIXES.add(entry.alias);
  for (const alias of entry.aliases || []) RESERVED_PROVIDER_PREFIXES.add(alias);
}

export function parseModel(modelStr: string): any {
  return parseModelCore(modelStr);
}

/**
 * Resolve model alias from localDb
 */
export async function resolveModelAlias(alias: string): Promise<any> {
  const aliases = await getModelAliases();
  return resolveModelAliasFromMap(alias, aliases);
}

/**
 * Get full model info (parse or resolve)
 */
export async function getModelInfo(modelStr: string): Promise<any> {
  const parsed = parseModel(modelStr);

  if (!parsed.isAlias) {
    // Provider-node prefixes are user-defined. They must not override built-in
    // provider ids/aliases such as `cf`, `openai`, or `hf`.
    if (!RESERVED_PROVIDER_PREFIXES.has(parsed.providerAlias)) {
      // One scan instead of three identical type-filtered queries; prefix→id
      // matching is unambiguous across node types (checked in that order).
      const nodes = await getProviderNodes();
      const NODE_TYPE_ORDER = ["openai-compatible", "anthropic-compatible", "custom-embedding"];
      for (const type of NODE_TYPE_ORDER) {
        const match = nodes.find(
          (node: any) => node.type === type && node.prefix === parsed.providerAlias,
        );
        if (match) return { provider: match.id, model: parsed.model };
      }
    }
    return {
      provider: parsed.provider,
      model: parsed.model,
    };
  }

  // Check if this is a combo name before resolving as alias
  // This prevents combo names from being incorrectly routed to providers
  const combo = await getComboByName(parsed.model);
  if (combo) {
    // Return null provider to signal this should be handled as combo
    // The caller (handleChat) will detect this and handle it as combo
    return { provider: null, model: parsed.model };
  }

  return getModelInfoCore(modelStr, getModelAliases);
}

/**
 * Check if model is a combo and get models list
 * @returns {Promise<string[]|null>} Array of models or null if not a combo
 */
export async function getComboModels(modelStr: string): Promise<string[] | null> {
  // Only check if it's not in provider/model format
  if (modelStr.includes("/")) return null;

  const combo = await getComboByName(modelStr);
  if (combo && combo.models && combo.models.length > 0) {
    return combo.models;
  }
  return null;
}
