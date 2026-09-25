"use client";
import Icon from "@/shared/components/Icon";

import { useState } from "react";
import { ModelSelectModal } from "@/shared/components";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import Image from "next/image";
import ApiKeySelect from "../shared/ApiKeySelect";

export default function DefaultToolCard({
  toolId,
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders = [],
  cloudEnabled = false,
  tunnelEnabled = false,
}: any) {
  const [copiedField, setCopiedField] = useState<any>(null);
  const [showModelModal, setShowModelModal] = useState<boolean>(false);
  const [modelValue, setModelValue] = useState<string>("");

  // Initialize state directly with computed value - no need for useEffect
  const [selectedApiKey, setSelectedApiKey] = useState(() =>
    apiKeys?.length > 0 ? apiKeys[0].key : "",
  );

  const replaceVars = (text) => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_10router"
          : "your-api-key";

    // Add /v1 suffix only if not already present (DRY - avoid duplicate)
    const normalizedBaseUrl = baseUrl || "http://localhost:20128";
    const baseUrlWithV1 = normalizedBaseUrl.endsWith("/v1")
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/v1`;

    return text
      .replace(/\{\{baseUrl\}\}/g, baseUrlWithV1)
      .replace(/\{\{apiKey\}\}/g, keyToUse)
      .replace(/\{\{model\}\}/g, modelValue || "provider/model-id");
  };

  const { copy: copyToClipboard } = useCopyToClipboard();

  const handleCopy = async (text, field) => {
    await copyToClipboard(replaceVars(text), `toolcard-${field}`);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSelectModel = (model) => {
    setModelValue(model.value);
  };

  const renderApiKeySelector = () => (
    <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
      <ApiKeySelect
        value={selectedApiKey}
        onChange={setSelectedApiKey}
        apiKeys={apiKeys}
        cloudEnabled={cloudEnabled}
        className="flex-1"
      />
    </div>
  );

  const renderModelSelector = () => {
    return (
      <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="text"
          value={modelValue}
          onChange={(e: any) => setModelValue(e.target.value)}
          placeholder="provider/model-id"
          className="w-full sm:w-auto flex-1 px-3 py-2 bg-muted rounded-lg text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={() => setShowModelModal(true)}
          className="shrink-0 px-3 py-2 rounded-lg border text-sm transition-colors bg-muted border-border text-foreground hover:border-primary cursor-pointer"
        >
          Select Model
        </button>
        {modelValue && (
          <>
            <button
              onClick={() => handleCopy(modelValue, "model")}
              className="shrink-0 px-3 py-2 bg-muted hover:bg-muted rounded-lg border border-border transition-colors"
            >
              <Icon name={copiedField === "model" ? "check" : "content_copy"} className="text-lg" />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setModelValue("")}
                  className="p-2 text-muted-foreground hover:text-red-500 rounded transition-colors"
                >
                  <Icon name="close" className="text-lg" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Clear</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>
    );
  };

  const renderNotes = () => {
    if (!tool.notes || tool.notes.length === 0) return null;

    return (
      <div className="flex flex-col gap-2 mb-4">
        {tool.notes.map((note, index) => {
          // Skip cloudCheck note if tunnel or cloud is enabled
          if (note.type === "cloudCheck" && (cloudEnabled || tunnelEnabled)) return null;

          const isWarning = note.type === "warning";
          const isError = note.type === "cloudCheck" && !cloudEnabled && !tunnelEnabled;

          let bgClass = "bg-blue-500/10 border-blue-500/30";
          let textClass = "text-blue-600 dark:text-blue-400";
          let iconClass = "text-blue-500";
          let icon = "info";

          if (isWarning) {
            bgClass = "bg-yellow-500/10 border-yellow-500/30";
            textClass = "text-yellow-600 dark:text-yellow-400";
            iconClass = "text-yellow-500";
            icon = "warning";
          } else if (isError) {
            bgClass = "bg-red-500/10 border-red-500/30";
            textClass = "text-red-600 dark:text-red-400";
            iconClass = "text-red-500";
            icon = "error";
          }

          return (
            <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border ${bgClass}`}>
              <Icon name={icon} className={`text-lg ${iconClass}`} />
              <p className={`text-sm ${textClass}`}>{note.text}</p>
            </div>
          );
        })}
      </div>
    );
  };

  const canShowGuide = () => {
    if (tool.requiresExternalUrl && !cloudEnabled && !tunnelEnabled) return false;
    if (tool.requiresCloud && !cloudEnabled) return false;
    return true;
  };

  const renderGuideSteps = () => {
    if (!tool.guideSteps) return <p className="text-muted-foreground text-sm">Coming soon...</p>;

    return (
      <div className="flex flex-col gap-4">
        {renderNotes()}
        {canShowGuide() &&
          tool.guideSteps.map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <div
                className="size-8 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white"
                style={{ backgroundColor: tool.color }}
              >
                {item.step}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground">{item.title}</p>
                {item.desc && <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>}
                {item.type === "apiKeySelector" && renderApiKeySelector()}
                {item.type === "modelSelector" && renderModelSelector()}
                {item.value && (
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                    <code className="w-full sm:w-auto flex-1 px-3 py-2 bg-muted rounded-lg text-sm font-mono border border-border truncate">
                      {replaceVars(item.value)}
                    </code>
                    {item.copyable && (
                      <button
                        onClick={() => handleCopy(item.value, `${item.step}-${item.title}`)}
                        className="shrink-0 px-3 py-2 bg-muted hover:bg-muted rounded-lg border border-border transition-colors"
                      >
                        <Icon
                          name={
                            copiedField === `${item.step}-${item.title}` ? "check" : "content_copy"
                          }
                          className="text-lg"
                        />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

        {canShowGuide() && tool.codeBlock && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                {tool.codeBlock.language}
              </span>
              <button
                onClick={() => handleCopy(tool.codeBlock.code, "codeblock")}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted rounded border border-border transition-colors"
              >
                <Icon
                  name={copiedField === "codeblock" ? "check" : "content_copy"}
                  className="text-sm"
                />
                {copiedField === "codeblock" ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="p-4 bg-muted rounded-lg border border-border overflow-x-auto">
              <code className="text-sm font-mono whitespace-pre">
                {replaceVars(tool.codeBlock.code)}
              </code>
            </pre>
          </div>
        )}
      </div>
    );
  };

  const renderIcon = () => {
    if (tool.image) {
      return (
        <Image
          src={tool.image}
          alt={tool.name}
          width={32}
          height={32}
          className="size-8 object-contain rounded-lg"
          sizes="32px"
          onError={(e: any) => {
            e.target.style.display = "none";
          }}
          loading="lazy"
          decoding="async"
        />
      );
    }
    if (tool.icon) {
      return <Icon name={tool.icon} className="text-xl" style={{ color: tool.color }} />;
    }
    const iconSrc = getProviderIconSrc(toolId);
    if (!iconSrc) {
      return (
        <span className="text-xs font-bold" style={{ color: tool.color }}>
          {(toolId || "?").slice(0, 2).toUpperCase()}
        </span>
      );
    }
    return (
      <Image
        src={iconSrc}
        alt={tool.name}
        width={32}
        height={32}
        className="size-8 object-contain rounded-lg"
        sizes="32px"
        onError={(e: any) => {
          markProviderIconMissing(toolId);
          e.target.style.display = "none";
        }}
        loading="lazy"
        decoding="async"
      />
    );
  };

  return (
    <Card size="sm" className="overflow-hidden overflow-x-hidden">
      <CardContent>
        <div
          className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center"
          onClick={onToggle}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">{renderIcon()}</div>
            <div className="min-w-0">
              <h3 className="font-medium text-sm">{tool.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
            {renderGuideSteps()}
          </div>
        )}

        {showModelModal && (
          <ModelSelectModal
            isOpen={showModelModal}
            onClose={() => setShowModelModal(false)}
            onSelect={handleSelectModel}
            selectedModel={modelValue}
            activeProviders={activeProviders}
            title="Select Model"
          />
        )}
      </CardContent>
    </Card>
  );
}
