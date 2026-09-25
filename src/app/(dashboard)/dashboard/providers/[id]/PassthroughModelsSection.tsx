"use client";
import Icon from "@/shared/components/Icon";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProviderCustomModelRows } from "@/shared/utils/providerCustomModels";

function PassthroughModelRow({
  modelId,
  fullModel,
  copied,
  onCopy,
  onDeleteAlias,
  onTest,
  testStatus,
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
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${borderColor} hover:bg-sidebar/50`}
    >
      <Icon
        name={
          testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"
        }
        className="text-base text-muted-foreground"
        style={iconColor ? { color: iconColor } : undefined}
      />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{modelId}</p>

        <div className="flex items-center gap-1 mt-1">
          <code className="text-xs text-muted-foreground font-mono bg-sidebar px-1.5 py-0.5 rounded">
            {fullModel}
          </code>
          <div className="relative group/btn">
            <button
              onClick={() => onCopy(fullModel, `model-${modelId}`)}
              className="p-0.5 hover:bg-sidebar rounded text-muted-foreground hover:text-primary"
            >
              <Icon
                name={copied === `model-${modelId}` ? "check" : "content_copy"}
                className="text-sm"
              />
            </button>
            <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
              {copied === `model-${modelId}` ? "Copied!" : "Copy"}
            </span>
          </div>
          {onTest && (
            <div className="relative group/btn">
              <button
                onClick={onTest}
                disabled={isTesting}
                className="p-0.5 hover:bg-sidebar rounded text-muted-foreground hover:text-primary transition-colors"
              >
                <Icon
                  name={isTesting ? "progress_activity" : "science"}
                  className="text-sm"
                  style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}
                />
              </button>
              <span className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity">
                {isTesting ? "Testing..." : "Test"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Delete button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onDeleteAlias} className="p-1 hover:bg-red-50 rounded text-red-500">
            <Icon name="delete" className="text-sm" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Remove model</TooltipContent>
      </Tooltip>
    </div>
  );
}

export default function PassthroughModelsSection({
  providerAlias,
  modelAliases,
  customModels,
  copied,
  onCopy,
  onDeleteAlias,
  onAddCustomModel,
  onDeleteCustomModel,
}: any) {
  const [newModel, setNewModel] = useState<string>("");
  const [adding, setAdding] = useState<boolean>(false);

  const allModels = getProviderCustomModelRows({
    customModels,
    modelAliases,
    providerAlias,
    type: "llm",
  });

  const handleAdd = async () => {
    if (!newModel.trim() || adding) return;
    const modelId = newModel.trim();

    if (allModels.some((model) => model.id === modelId)) {
      alert("Model already exists for this provider.");
      return;
    }

    setAdding(true);
    try {
      await onAddCustomModel(modelId);
      setNewModel("");
    } catch (error) {
      console.log("Error adding model:", error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        OpenRouter supports any model. Add models and create aliases for quick access.
      </p>

      {/* Add new model */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="new-model-input" className="text-xs text-muted-foreground mb-1 block">
            Model ID (from OpenRouter)
          </label>
          <input
            id="new-model-input"
            type="text"
            value={newModel}
            onChange={(e: any) => setNewModel(e.target.value)}
            onKeyDown={(e: any) => e.key === "Enter" && handleAdd()}
            placeholder="anthropic/claude-3-opus"
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={!newModel.trim() || adding}>
          <Icon name="add" />
          {adding ? "Adding..." : "Add"}
        </Button>
      </div>

      {/* Models list */}
      {allModels.length > 0 && (
        <div className="flex flex-col gap-3">
          {allModels.map(({ id, fullModel, alias, source }) => (
            <PassthroughModelRow
              key={`${source}-${fullModel}`}
              modelId={id}
              fullModel={fullModel}
              copied={copied}
              onCopy={onCopy}
              onDeleteAlias={() =>
                source === "custom" ? onDeleteCustomModel(id) : onDeleteAlias(alias)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
