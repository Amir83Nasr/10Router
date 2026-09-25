"use client";
import Icon from "@/shared/components/Icon";

import { useState, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { getProviderAlias } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

// ── ModelRow ───────────────────────────────────────────────────
export function ModelRow({
  model,
  fullModel,
  copied,
  onCopy,
  testStatus,
  isCustom,
  isFree,
  onDeleteAlias,
  onTest,
  isTesting,
}: any) {
  const borderColor =
    testStatus === "ok"
      ? "border-green-500/40"
      : testStatus === "error"
        ? "border-red-500/40"
        : "border-border";
  const iconColor =
    testStatus === "ok" ? "#22c55e" : testStatus === "error" ? "#ef4444" : undefined;

  return (
    <div className={`group px-3 py-2 rounded-lg border ${borderColor} hover:bg-sidebar/50`}>
      <div className="flex items-center gap-2">
        <Icon
          name={
            testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"
          }
          className="text-base"
          style={iconColor ? { color: iconColor } : undefined}
        />
        <div className="flex flex-col gap-1">
          <code className="text-xs text-muted-foreground font-mono bg-sidebar px-1.5 py-0.5 rounded">
            {fullModel}
          </code>
          {model.name && (
            <span className="text-[9px] text-muted-foreground/70 italic pl-1">{model.name}</span>
          )}
        </div>
        {onTest && (
          <div className="relative group/btn">
            <button
              onClick={onTest}
              disabled={isTesting}
              className={`p-0.5 hover:bg-sidebar rounded text-muted-foreground hover:text-primary transition-opacity ${isTesting ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <Icon
                name={isTesting ? "progress_activity" : "science"}
                className="text-sm"
                style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
              />
            </button>
            <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {isTesting ? "Testing..." : "Test"}
            </span>
          </div>
        )}
        <div className="relative group/btn">
          <button
            onClick={() => onCopy(fullModel, `model-${model.id}`)}
            className="p-0.5 hover:bg-sidebar rounded text-muted-foreground hover:text-primary"
          >
            <Icon
              name={copied === `model-${model.id}` ? "check" : "content_copy"}
              className="text-sm"
            />
          </button>
          <span className="pointer-events-none absolute mt-1 top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
            {copied === `model-${model.id}` ? "Copied!" : "Copy"}
          </span>
        </div>
        {isFree && (
          <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded">
            FREE
          </span>
        )}
        {isCustom && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDeleteAlias}
                className="p-0.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
              >
                <Icon name="close" className="text-sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Remove custom model</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ── AddCustomModelModal ────────────────────────────────────────
function AddCustomModelModal({ isOpen, onSave, onClose }: any) {
  const [modelId, setModelId] = useState<string>("");

  const handleSave = () => {
    if (!modelId.trim()) return;
    onSave(modelId.trim());
    setModelId("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Model</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-[calc(85vh-120px)] flex-col gap-4 overflow-y-auto p-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model ID</label>
            <input
              className="w-full min-w-0 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
              value={modelId}
              onChange={(e: any) => setModelId(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && handleSave()}
              placeholder="e.g. tts-1-hd"
              autoFocus
            />
          </div>
          <Button onClick={handleSave} className="w-full" disabled={!modelId.trim()}>
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ModelsCard ─────────────────────────────────────────────────
// Self-contained card: shows models for a provider, filtered by optional `kindFilter`.
// kindFilter: if provided, only shows models with matching type/kinds field.
export default function ModelsCard({ providerId, kindFilter, providerAliasOverride }: any) {
  const { copied, copy } = useCopyToClipboard();
  const [modelAliases, setModelAliases] = useState<any>({});
  const [customModels, setCustomModels] = useState<any[]>([]);
  const [modelTestResults, setModelTestResults] = useState<any>({});
  const [testingModelId, setTestingModelId] = useState<any>(null);
  const [testError, setTestError] = useState<string>("");
  const [showAddCustomModel, setShowAddCustomModel] = useState<boolean>(false);

  const providerAlias = providerAliasOverride || getProviderAlias(providerId);
  const effectiveType = kindFilter || "llm";

  const fetchData = useCallback(async () => {
    try {
      const [aliasRes, customRes] = await Promise.all([
        fetch("/api/models/alias"),
        fetch("/api/models/custom", { cache: "no-store" }),
      ]);
      const aliasData = await aliasRes.json();
      const customData = await customRes.json();
      if (aliasRes.ok) setModelAliases(aliasData.aliases || {});
      if (customRes.ok) setCustomModels(customData.models || []);
    } catch (e) {
      console.log("ModelsCard fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSetAlias = async (modelId, alias) => {
    const fullModel = `${providerAlias}/${modelId}`;
    try {
      const res = await fetch("/api/models/alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: fullModel, alias }),
      });
      if (res.ok) await fetchData();
    } catch (e) {
      console.log("set alias error:", e);
    }
  };

  const handleDeleteAlias = async (alias) => {
    try {
      const res = await fetch(`/api/models/alias?alias=${encodeURIComponent(alias)}`, {
        method: "DELETE",
      });
      if (res.ok) await fetchData();
    } catch (e) {
      console.log("delete alias error:", e);
    }
  };

  const handleAddCustomModel = async (modelId) => {
    try {
      const res = await fetch("/api/models/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, id: modelId, type: effectiveType }),
      });
      if (res.ok) {
        await fetchData();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (e) {
      console.log("add custom model error:", e);
    }
  };

  const handleDeleteCustomModel = async (modelId) => {
    try {
      const params = new URLSearchParams({ providerAlias, id: modelId, type: effectiveType });
      const res = await fetch(`/api/models/custom?${params}`, { method: "DELETE" });
      if (res.ok) {
        await fetchData();
        window.dispatchEvent(new CustomEvent("customModelChanged"));
      }
    } catch (e) {
      console.log("delete custom model error:", e);
    }
  };

  const handleTestModel = async (modelId) => {
    if (testingModelId) return;
    setTestingModelId(modelId);
    try {
      const res = await fetch("/api/models/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `${providerAlias}/${modelId}`, kind: kindFilter }),
      });
      const data = await res.json();
      setModelTestResults((prev) => ({ ...prev, [modelId]: data.ok ? "ok" : "error" }));
      setTestError(data.ok ? "" : data.error || "Model not reachable");
    } catch {
      setModelTestResults((prev) => ({ ...prev, [modelId]: "error" }));
      setTestError("Network error");
    } finally {
      setTestingModelId(null);
    }
  };

  // Built-in models — filter by kindFilter if provided
  const allBuiltIn = getModelsByProviderId(providerId);
  const builtInModels = kindFilter
    ? allBuiltIn.filter((m) => {
        if (m.kinds) return m.kinds.includes(kindFilter);
        return getModelKind(m, "llm") === kindFilter;
      })
    : allBuiltIn;

  // Custom models for this provider + kind, dedupe vs built-in
  const myCustomModels = customModels.filter(
    (m) =>
      m.providerAlias === providerAlias &&
      getModelKind(m, "llm") === effectiveType &&
      !builtInModels.some((b) => b.id === m.id),
  );

  const displayModels = builtInModels;

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              Models{kindFilter ? ` — ${kindFilter.toUpperCase()}` : ""}
            </h2>
          </div>
          {testError && <p className="text-xs text-red-500 mb-3 break-words">{testError}</p>}

          <div className="flex flex-wrap gap-3">
            {displayModels.map((model) => {
              const fullModel = `${providerAlias}/${model.id}`;
              const existingAlias = Object.entries(modelAliases).find(
                ([, m]) => m === fullModel,
              )?.[0];
              return (
                <ModelRow
                  key={model.id}
                  model={model}
                  fullModel={`${providerAlias}/${model.id}`}
                  alias={existingAlias}
                  copied={copied}
                  onCopy={copy}
                  onSetAlias={(alias) => handleSetAlias(model.id, alias)}
                  onDeleteAlias={() => handleDeleteAlias(existingAlias)}
                  testStatus={modelTestResults[model.id]}
                  onTest={() => handleTestModel(model.id)}
                  isTesting={testingModelId === model.id}
                  isFree={model.isFree}
                />
              );
            })}

            {myCustomModels.map((model) => (
              <ModelRow
                key={`${model.id}-${model.type}`}
                model={{ id: model.id, name: model.name }}
                fullModel={`${providerAlias}/${model.id}`}
                copied={copied}
                onCopy={copy}
                onSetAlias={() => {}}
                onDeleteAlias={() => handleDeleteCustomModel(model.id)}
                testStatus={modelTestResults[model.id]}
                onTest={() => handleTestModel(model.id)}
                isTesting={testingModelId === model.id}
                isCustom
              />
            ))}

            <button
              onClick={() => setShowAddCustomModel(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-black/15 dark:border-white/15 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              <Icon name="add" className="text-sm" />
              Add Model
            </button>
          </div>
        </CardContent>
      </Card>

      <AddCustomModelModal
        isOpen={showAddCustomModel}
        onSave={async (modelId) => {
          await handleAddCustomModel(modelId);
          setShowAddCustomModel(false);
        }}
        onClose={() => setShowAddCustomModel(false)}
      />
    </>
  );
}
