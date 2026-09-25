"use client";

import { useState, useMemo, useEffect } from "react";
import PropTypes from "prop-types";
import { Check, Info, Layers, PenLine, Search, SearchX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ProviderIcon from "./ProviderIcon";
import CapacityBadges from "./CapacityBadges";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import {
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  AI_PROVIDERS,
  isOpenAICompatibleProvider,
  isAnthropicCompatibleProvider,
  getProviderAlias,
} from "@/shared/constants/providers";

interface ModelSelectModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSelect?: any;
  onDeselect?: any;
  selectedModel?: any;
  activeProviders?: any[];
  title?: any;
  modelAliases?: any;
  kindFilter?: any;
  capFilter?: any;
  addedModelValues?: any[];
  closeOnSelect?: boolean;
  [key: string]: any;
}

// Provider order: OAuth first, then Free Tier, then API Key (matches dashboard/providers)
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];

// Providers that need no auth — always show in model selector
const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter((id) => FREE_PROVIDERS[id].noAuth);

// Providers with per-account live catalogs via /api/providers/[id]/models.
// Static registry stays as fallback when live fetch fails or is empty.
const LIVE_CATALOG_PROVIDERS = ["cursor", "zed"];

// Fetch a provider's account-scoped catalog for every active connection and merge
// the results. Entries collapse by model id on purpose: two connections of the
// same provider produce the same picker value (`alias/id`), so keeping the first
// avoids duplicate rows. There is no per-connection metadata to preserve beyond
// {id,name}. Empty array means "nothing live" so callers keep the static fallback.
function useLiveProviderModels(isOpen: any, connectionIds: any, label: any) {
  const [models, setModels] = useState<any>([]);
  const idsKey = (connectionIds ?? []).join("|");

  useEffect(() => {
    const ids = idsKey ? idsKey.split("|") : [];
    if (!isOpen || ids.length === 0) {
      setModels([]);
      return undefined;
    }

    let cancelled = false;
    Promise.all(
      ids.map(async (connectionId: any) => {
        const response = await fetch(`/api/providers/${connectionId}/models`, {
          cache: "no-store",
        });
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data.models) ? data.models : [];
      }),
    )
      .then((modelLists) => {
        if (cancelled) return;
        const seen = new Set();
        setModels(
          modelLists.flat().filter((model: any) => {
            if (!model?.id || seen.has(model.id)) return false;
            seen.add(model.id);
            return true;
          }),
        );
      })
      .catch((error) => {
        // Do not hide the static fallback when the account catalog is unavailable.
        console.warn(`Unable to load ${label} models for selector:`, error);
        if (!cancelled) setModels([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, idsKey, label]);

  return models;
}

export default function ModelSelectModal({
  isOpen,
  onClose,
  onSelect,
  onDeselect,
  selectedModel,
  activeProviders = [],
  title = "Select Model",
  modelAliases = {},
  kindFilter = null,
  capFilter = null,
  addedModelValues = [],
  closeOnSelect = true,
}: ModelSelectModalProps) {
  // Filter activeProviders by serviceKinds when kindFilter set (e.g. "webSearch", "webFetch")
  const filteredActiveProviders = useMemo(() => {
    if (!kindFilter) return activeProviders;
    return activeProviders.filter((p: any) => {
      const info = AI_PROVIDERS[p.provider];
      const kinds = info?.serviceKinds || ["llm"];
      return kinds.includes(kindFilter);
    });
  }, [activeProviders, kindFilter]);
  const { getCaps } = useModelCaps();
  const [searchQuery, setSearchQuery] = useState("");
  const [combos, setCombos] = useState<any>([]);
  const [providerNodes, setProviderNodes] = useState<any>([]);
  const [customModels, setCustomModels] = useState<any>([]);
  const [disabledModels, setDisabledModels] = useState<any>({});
  // Cursor exposes the usable catalog per account, so the static catalog is
  // kept only as a fallback: it goes stale quickly and entitlements differ per account.
  // Single map driven by LIVE_CATALOG_PROVIDERS so the constant cannot drift
  // from the memos below; per-provider arrays stay referentially stable unless
  // activeProviders itself changes.
  const liveConnectionIdsByProvider = useMemo(() => {
    const map = Object.fromEntries(LIVE_CATALOG_PROVIDERS.map((id) => [id, []]));
    for (const p of activeProviders) {
      if (p?.id && Object.prototype.hasOwnProperty.call(map, p.provider))
        map[p.provider].push(p.id);
    }
    return map;
  }, [activeProviders]);
  const cursorConnectionIds = liveConnectionIdsByProvider.cursor;

  const cursorModels = useLiveProviderModels(isOpen, cursorConnectionIds, "Cursor");
  const zedConnectionIds = liveConnectionIdsByProvider.zed;

  const zedModels = useLiveProviderModels(isOpen, zedConnectionIds, "Zed");

  const fetchCombos = async () => {
    try {
      const res = await fetch("/api/combos");
      if (!res.ok) throw new Error(`Failed to fetch combos: ${res.status}`);
      const data = await res.json();
      setCombos(data.combos || []);
    } catch (error) {
      console.error("Error fetching combos:", error);
      setCombos([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCombos();
  }, [isOpen]);

  const fetchProviderNodes = async () => {
    try {
      const res = await fetch("/api/provider-nodes");
      if (!res.ok) throw new Error(`Failed to fetch provider nodes: ${res.status}`);
      const data = await res.json();
      setProviderNodes(data.nodes || []);
    } catch (error) {
      console.error("Error fetching provider nodes:", error);
      setProviderNodes([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchProviderNodes();
  }, [isOpen]);

  const fetchCustomModels = async () => {
    try {
      const res = await fetch("/api/models/custom");
      if (!res.ok) throw new Error(`Failed to fetch custom models: ${res.status}`);
      const data = await res.json();
      setCustomModels(data.models || []);
    } catch (error) {
      console.error("Error fetching custom models:", error);
      setCustomModels([]);
    }
  };

  useEffect(() => {
    if (isOpen) fetchCustomModels();
  }, [isOpen]);

  const fetchDisabledModels = async () => {
    try {
      const res = await fetch("/api/models/disabled");
      if (!res.ok) throw new Error(`Failed to fetch disabled models: ${res.status}`);
      const data = await res.json();
      setDisabledModels(data.disabled || {});
    } catch (error) {
      console.error("Error fetching disabled models:", error);
      setDisabledModels({});
    }
  };

  useEffect(() => {
    if (isOpen) fetchDisabledModels();
  }, [isOpen]);

  const allProviders = useMemo(
    () => ({ ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS }),
    [],
  );

  // Group models by provider with priority order
  const groupedModels = useMemo(() => {
    const groups: any = {};

    // Kinds where the provider IS the model (no per-model selection needed)
    const PROVIDER_AS_MODEL_KINDS = new Set(["webSearch", "webFetch"]);
    // Kinds that map directly to model.type field
    const TYPED_KINDS = new Set(["image", "tts", "stt", "embedding", "imageToText"]);
    // For these kinds, providers without hardcoded models can still be picked (provider-as-model fallback)
    const ALLOW_PROVIDER_FALLBACK_KINDS = new Set(["tts", "image", "webFetch"]);

    // Filter a models[] array by kindFilter (keep only matching kind)
    const filterByKind = (models: any) => {
      // No kindFilter means the LLM selector. Keep custom models visible because
      // user-added models may have typed capabilities (for example imageToText)
      // while still being valid chat/combo targets.
      if (!kindFilter)
        return models.filter(
          (m) => m.isPlaceholder || m.isCustom || !getModelKind(m) || getModelKind(m) === "llm",
        );
      if (!TYPED_KINDS.has(kindFilter)) return models;
      return models.filter((m) => m.isPlaceholder || getModelKind(m) === kindFilter);
    };

    // Get all active provider IDs from connections (filtered by kindFilter if set)
    const activeConnectionIds = filteredActiveProviders.map((p: any) => p.provider);

    // No-auth providers: filter by kindFilter as well
    const noAuthIds = kindFilter
      ? NO_AUTH_PROVIDER_IDS.filter((id) =>
          (AI_PROVIDERS[id]?.serviceKinds || ["llm"]).includes(kindFilter),
        )
      : NO_AUTH_PROVIDER_IDS;

    // Only show connected providers (including both standard and custom)
    const providerIdsToShow = new Set([
      ...activeConnectionIds, // Only connected providers
      ...noAuthIds, // No-auth providers (kind-filtered)
    ]);

    // Sort by PROVIDER_ORDER
    const sortedProviderIds = [...providerIdsToShow].sort((a, b) => {
      const indexA = PROVIDER_ORDER.indexOf(a);
      const indexB = PROVIDER_ORDER.indexOf(b);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    sortedProviderIds.forEach((providerId) => {
      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId] || { name: providerId, color: "#666" };
      const isCustomProvider =
        isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

      // For provider-as-model kinds (webSearch/webFetch): emit a single entry where value === providerId
      if (kindFilter && PROVIDER_AS_MODEL_KINDS.has(kindFilter)) {
        groups[providerId] = {
          name: providerInfo.name,
          alias,
          color: providerInfo.color,
          models: [{ id: providerId, name: providerInfo.name, value: providerId }],
        };
        return;
      }

      if (providerInfo.passthroughModels) {
        const aliasModels = Object.entries(modelAliases)
          .filter(([, fullModel]: any) => (fullModel as any).startsWith(`${alias}/`))
          .map(([aliasName, fullModel]: any) => ({
            id: (fullModel as any).replace(`${alias}/`, ""),
            name: aliasName,
            value: fullModel,
          }));
        const customRegisteredModels = customModels
          .filter((m) => m.providerAlias === alias)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${alias}/${m.id}`,
            kind: getModelKind(m),
            isCustom: true,
          }));

        // For typed kinds, only include hardcoded typed models (aliases are typically LLM-only and lack type info)
        let combined = aliasModels;
        if (kindFilter && TYPED_KINDS.has(kindFilter)) {
          const registeredTyped = customRegisteredModels.filter(
            (m) => getModelKind(m) === kindFilter,
          );
          combined = [
            ...registeredTyped,
            ...getModelsByProviderId(providerId)
              .filter((m) => getModelKind(m) === kindFilter)
              .map((m) => ({
                id: m.id,
                name: m.name,
                value: `${alias}/${m.id}`,
                kind: getModelKind(m),
              }))
              .filter((m) => !registeredTyped.some((registered) => registered.value === m.value)),
          ];
          // Fallback: provider-as-model when no hardcoded models match (tts/image/webFetch only)
          if (combined.length === 0 && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
            const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
            if (supports) combined = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        } else {
          // LLM/null kind: merge hardcoded models (e.g. mimo-free → mimo-auto) with user-added models
          const registeredLlms = customRegisteredModels.filter(
            (m) => !getModelKind(m) || getModelKind(m) === "llm",
          );
          const seen = new Set([...aliasModels, ...registeredLlms].map((m) => m.value));
          // Zed has no static catalog (passthrough) — live /models is the only source.
          const liveModels =
            providerId === "zed"
              ? zedModels.map((m: any) => ({
                  id: m.id,
                  name: m.name || m.id,
                  value: `${alias}/${m.id}`,
                  kind: getModelKind(m),
                }))
              : [];
          const hardcoded = getModelsByProviderId(providerId)
            .filter((m) => !getModelKind(m) || getModelKind(m) === "llm")
            .map((m) => ({
              id: m.id,
              name: m.name,
              value: `${alias}/${m.id}`,
              kind: getModelKind(m),
            }))
            .filter((m) => !seen.has(m.value));
          combined = [
            ...registeredLlms,
            ...aliasModels.filter(
              (m) => !registeredLlms.some((registered) => registered.value === m.value),
            ),
            ...liveModels.filter((m) => !seen.has(m.value)),
            ...hardcoded,
          ];
        }

        if (combined.length > 0) {
          // Check for custom name from providerNodes (for compatible providers)
          const matchedNode = providerNodes.find((node) => node.id === providerId);
          const displayName = matchedNode?.name || providerInfo.name;

          groups[providerId] = {
            name: displayName,
            alias: alias,
            color: providerInfo.color,
            models: combined,
          };
        }
      } else if (isCustomProvider) {
        // Custom (openai/anthropic-compatible) providers are LLM-only — skip for typed media kinds
        if (kindFilter && TYPED_KINDS.has(kindFilter)) return;
        // Find connection object to get prefix synchronously without waiting for providerNodes fetch
        const connection = activeProviders.find((p: any) => p.provider === providerId);
        const matchedNode = providerNodes.find((node) => node.id === providerId);
        const displayName = matchedNode?.name || connection?.name || providerInfo.name;
        const nodePrefix =
          connection?.providerSpecificData?.prefix || matchedNode?.prefix || providerId;

        // Aliases are stored using the raw providerId as key (e.g. "openai-compatible-chat-<uuid>/glm-4.7"),
        // so we must filter by providerId, not by the display prefix.
        const nodeModels = Object.entries(modelAliases)
          .filter(([, fullModel]: any) => (fullModel as any).startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]: any) => ({
            id: (fullModel as any).replace(`${providerId}/`, ""),
            name: aliasName,
            value: `${nodePrefix}/${(fullModel as any).replace(`${providerId}/`, "")}`,
          }));

        // Merge custom models registered via /api/models/custom for this provider
        // providerAlias in DB uses the raw providerId, not the display prefix
        const registeredCustom = customModels
          .filter((m) => m.providerAlias === providerId)
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${nodePrefix}/${m.id}`,
            isCustom: true,
          }));
        const seen = new Set(nodeModels.map((m) => m.value));
        const mergedModels = [...nodeModels, ...registeredCustom.filter((m) => !seen.has(m.value))];

        // Always show compatible providers that are connected, even with no aliases.
        // When no aliases exist, show a placeholder so users know it's available.
        const modelsToShow =
          mergedModels.length > 0
            ? mergedModels
            : [
                {
                  id: `__placeholder__${providerId}`,
                  name: `${nodePrefix}/model-id`,
                  value: `${nodePrefix}/model-id`,
                  isPlaceholder: true,
                },
              ];

        groups[providerId] = {
          name: displayName,
          alias: nodePrefix,
          color: providerInfo.color,
          models: modelsToShow,
          isCustom: true,
          hasModels: mergedModels.length > 0,
        };
      } else {
        const liveModels =
          providerId === "cursor" ? cursorModels : providerId === "zed" ? zedModels : [];
        const hardcodedModels =
          liveModels.length > 0 ? liveModels : getModelsByProviderId(providerId);
        const hardcodedIds = new Set(hardcodedModels.map((m) => m.id));

        // Custom models: if no hardcoded models (e.g. openrouter), show all aliases for this provider
        // Otherwise only show aliases where aliasName === modelId ("Add Model" button pattern)
        const hasHardcoded = hardcodedModels.length > 0;
        const customAliasModels = Object.entries(modelAliases)
          .filter(
            ([aliasName, fullModel]: any) =>
              (fullModel as any).startsWith(`${alias}/`) &&
              (hasHardcoded ? aliasName === (fullModel as any).replace(`${alias}/`, "") : true) &&
              !hardcodedIds.has((fullModel as any).replace(`${alias}/`, "")),
          )
          .map(([aliasName, fullModel]: any) => {
            const modelId = (fullModel as any).replace(`${alias}/`, "");
            return { id: modelId, name: aliasName, value: fullModel, isCustom: true };
          });

        // Custom models registered via /api/models/custom (provider "Add Model" button)
        const customAliasIds = new Set(customAliasModels.map((m) => m.id));
        const customRegisteredModels = customModels
          .filter(
            (m) =>
              m.providerAlias === alias && !hardcodedIds.has(m.id) && !customAliasIds.has(m.id),
          )
          .map((m) => ({
            id: m.id,
            name: m.name || m.id,
            value: `${alias}/${m.id}`,
            isCustom: true,
          }));

        const merged = [
          ...hardcodedModels.map((m) => ({
            id: m.id,
            name: m.name,
            value: `${alias}/${m.id}`,
            kind: getModelKind(m),
          })),
          ...customAliasModels,
          ...customRegisteredModels,
        ];
        // Dedupe by value (alias may equal hardcoded id, causing React key collision)
        const seen = new Set();
        let allModels = filterByKind(
          merged.filter((m) => {
            if (seen.has(m.value)) return false;
            seen.add(m.value);
            return true;
          }),
        );

        // Provider-as-model fallback: providers that support the kind but have no hardcoded models
        // can still be picked (value = providerAlias). Skips embedding (always needs model).
        if (allModels.length === 0 && kindFilter && ALLOW_PROVIDER_FALLBACK_KINDS.has(kindFilter)) {
          const supports = (providerInfo.serviceKinds || ["llm"]).includes(kindFilter);
          if (supports) {
            allModels = [{ id: providerId, name: providerInfo.name, value: alias }];
          }
        }

        if (allModels.length > 0) {
          groups[providerId] = {
            name: providerInfo.name,
            alias: alias,
            color: providerInfo.color,
            models: allModels,
          };
        }
      }
    });

    // Filter out disabled models per provider (disabled keyed by storage alias OR providerId)
    Object.entries(groups).forEach(([providerId, group]: any) => {
      const aliasKey = getProviderAlias(providerId);
      const disabledIds = new Set([
        ...(disabledModels[aliasKey] || []),
        ...(disabledModels[providerId] || []),
      ]);
      if (disabledIds.size === 0) return;
      group.models = (group.models as any).filter((m: any) => !disabledIds.has(m.id));
      if ((group.models as any).length === 0) delete groups[providerId];
    });

    return groups;
  }, [
    filteredActiveProviders,
    modelAliases,
    allProviders,
    providerNodes,
    customModels,
    disabledModels,
    kindFilter,
    activeProviders,
    cursorModels,
    zedModels,
  ]);

  // Filter combos by search query (and hide combos when kindFilter is set — combos are LLM-only by design)
  const filteredCombos = useMemo(() => {
    if (kindFilter || capFilter) return [];
    if (!searchQuery.trim()) return combos;
    const query = searchQuery.toLowerCase();
    return combos.filter((c) => c.name.toLowerCase().includes(query));
  }, [combos, searchQuery, kindFilter]);

  // Sort models alphabetically, with added models floated to top
  const sortModels = (models: any) => {
    const added = models
      .filter((m) => addedModelValues.includes(m.value))
      .sort((a, b) => a.name.localeCompare(b.name));
    const rest = models
      .filter((m) => !addedModelValues.includes(m.value))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...added, ...rest];
  };

  // Filter models by search query
  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const filtered: any = {};
    Object.entries(groupedModels).forEach(([providerId, group]: any) => {
      let models = (group as any).models;
      // Filter by input-modality capability (vision/pdf/audioInput/videoInput).
      if (capFilter) {
        models = (models as any).filter((m: any) => getCaps(m.value)?.[capFilter] === true);
        if (models.length === 0) return;
      }
      if (query) {
        const providerNameMatches = (group as any).name.toLowerCase().includes(query);
        models = models.filter(
          (m: any) => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query),
        );
        if (models.length === 0 && !providerNameMatches) return;
      }
      filtered[providerId] = {
        ...group,
        models: sortModels(models),
      };
    });

    return filtered;
  }, [groupedModels, searchQuery, addedModelValues]);

  const handleSelect = (model: any) => {
    const value = model?.value || model?.name || model;
    const isAdded = addedModelValues.includes(value);

    if (isAdded && onDeselect) {
      onDeselect(model);
    } else {
      onSelect(model);
    }

    if (closeOnSelect) {
      onClose();
      setSearchQuery("");
    }
  };

  const handleClose = () => {
    onClose();
    setSearchQuery("");
  };

  return (
    <Dialog
      open={!!isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">Pick a model</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-4">
          <Alert>
            <Info className="size-4" />
            <AlertDescription>
              Click to add, click again to remove. Changes are saved automatically.
            </AlertDescription>
          </Alert>

          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Models grouped by provider - compact */}
          <div className="max-h-100 space-y-3 overflow-y-auto">
            {/* Combos section - always first */}
            {filteredCombos.length > 0 && (
              <div>
                <div className="sticky top-0 mb-1.5 flex items-center gap-1.5 bg-popover py-0.5">
                  <Layers className="size-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">Combos</span>
                  <Badge variant="secondary">{filteredCombos.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {filteredCombos.map((combo) => {
                    const isSelected = selectedModel === combo.name;
                    const isAdded = addedModelValues.includes(combo.name);
                    return (
                      <Button
                        key={combo.id}
                        size="sm"
                        variant={isSelected || isAdded ? "default" : "outline"}
                        onClick={() =>
                          handleSelect({ id: combo.name, name: combo.name, value: combo.name })
                        }
                        className="h-auto rounded-xl px-2 py-1 text-xs font-medium"
                      >
                        {isAdded && <Check className="size-2.5" />}
                        {combo.name}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Provider models */}
            {Object.entries(filteredGroups).map(([providerId, group]: any) => (
              <div key={providerId}>
                {/* Provider header */}
                <div className="sticky top-0 mb-1.5 flex items-center gap-1.5 bg-popover py-0.5">
                  <ProviderIcon
                    src={`/providers/${providerId}.png`}
                    alt={(group as any).name}
                    size={14}
                    fallbackText={((group as any).name || providerId).slice(0, 2).toUpperCase()}
                    fallbackColor={(group as any).color}
                  />
                  <span className="text-xs font-medium text-primary">{(group as any).name}</span>
                  <Badge variant="secondary">{(group as any).models.length}</Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(group as any).models.map((model: any) => {
                    const isSelected = selectedModel === model.value;
                    const isAdded = addedModelValues.includes(model.value);
                    const isPlaceholder = model.isPlaceholder;
                    return (
                      <Button
                        key={model.value}
                        size="sm"
                        variant={isSelected || isAdded ? "default" : "outline"}
                        onClick={() => handleSelect(model)}
                        title={
                          isPlaceholder
                            ? "Select to pre-fill, then edit model ID in the input"
                            : undefined
                        }
                        className="h-auto rounded-xl px-2 py-1 text-xs font-medium data-[placeholder=true]:border-dashed data-[placeholder=true]:font-normal data-[placeholder=true]:italic"
                        data-placeholder={isPlaceholder || undefined}
                      >
                        {isAdded && !isPlaceholder && <Check className="size-2.5" />}
                        {isPlaceholder && <PenLine className="size-3" />}
                        {model.name}
                        {model.isCustom && !isPlaceholder && (
                          <Badge variant="secondary" className="text-[9px] font-normal">
                            custom
                          </Badge>
                        )}
                        {!isPlaceholder && <CapacityBadges caps={getCaps(model.value)} />}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}

            {Object.keys(filteredGroups).length === 0 && filteredCombos.length === 0 && (
              <div className="py-4 text-center text-muted-foreground">
                <SearchX className="mx-auto mb-1 size-6" />
                <p className="text-xs">No models found</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

ModelSelectModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  onDeselect: PropTypes.func,
  selectedModel: PropTypes.string,
  activeProviders: PropTypes.arrayOf(
    PropTypes.shape({
      provider: PropTypes.string.isRequired,
    }),
  ),
  title: PropTypes.string,
  modelAliases: PropTypes.object,
  kindFilter: PropTypes.string,
  addedModelValues: PropTypes.arrayOf(PropTypes.string),
  closeOnSelect: PropTypes.bool,
};
