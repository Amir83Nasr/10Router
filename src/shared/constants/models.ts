// Import directly from file to avoid pulling in server-side dependencies via index.js
export {
  PROVIDER_MODELS,
  getProviderModels,
  getDefaultModel,
  isValidModel as isValidModelCore,
  findModelName,
  getModelTargetFormat,
  getModelStrip,
  PROVIDER_ID_TO_ALIAS,
  getModelsByProviderId,
  getModelUpstreamId,
  getModelQuotaFamily,
} from "open-sse/config/providerModels.js";

import { AI_PROVIDERS, isOpenAICompatibleProvider } from "./providers.js";
import { PROVIDER_MODELS as MODELS } from "open-sse/config/providerModels.js";

type ModelEntry = { id: string; name?: string; kind?: string; type?: string };

// Providers that accept any model (passthrough)
const PASSTHROUGH_PROVIDERS = new Set(
  Object.entries(AI_PROVIDERS)
    .filter(([, p]) => (p as { passthroughModels?: boolean }).passthroughModels)
    .map(([key]) => key),
);

// Wrap isValidModel with passthrough providers
export function isValidModel(aliasOrId: string, modelId: string): boolean {
  if (isOpenAICompatibleProvider(aliasOrId)) return true;
  if (PASSTHROUGH_PROVIDERS.has(aliasOrId)) return true;
  const models = (MODELS as Record<string, ModelEntry[]>)[aliasOrId];
  if (!models) return false;
  return models.some((m) => m.id === modelId);
}

// Legacy AI_MODELS for backward compatibility
export const AI_MODELS: Array<{ provider: string; model: string; name?: string }> = Object.entries(
  MODELS as Record<string, ModelEntry[]>,
).flatMap(([alias, models]) => models.map((m) => ({ provider: alias, model: m.id, name: m.name })));

export const getModelKind = (
  m: ModelEntry | null | undefined,
  fallback: string | null = null,
): string | null => m?.kind || m?.type || fallback;

// Capacity metadata for UI badges — icon + label + color per capability.
export const CAPACITY_META: Record<
  string,
  { icon: string; label: string; desc: string; color: string }
> = {
  vision: {
    icon: "visibility",
    label: "Vision",
    desc: "Supports image input",
    color: "text-blue-500",
  },
  // search: temporarily hidden (feature not wired yet)
  reasoning: {
    icon: "neurology",
    label: "Reasoning",
    desc: "Supports reasoning / thinking",
    color: "text-amber-500",
  },
};
