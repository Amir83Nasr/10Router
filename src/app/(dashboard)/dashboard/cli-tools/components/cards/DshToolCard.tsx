"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import BaseUrlSelect from "../shared/BaseUrlSelect";
import ApiKeySelect from "../shared/ApiKeySelect";
import { matchKnownEndpoint } from "../shared/cliEndpointMatch";
import { rememberEndpoint } from "../shared/cliEndpointPresets";

const ENDPOINT = "/api/cli-tools/dsh-settings";

const stripV1 = (url) => (url || "").replace(/\/v1\/?$/, "");
const ensureV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export default function DshToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  cloudEnabled,
  initialStatus,
  tunnelEnabled,
  tunnelPublicUrl,
  tailscaleEnabled,
  tailscaleUrl,
}: any) {
  const [dshStatus, setDshStatus] = useState(initialStatus || null);
  const [checking, setChecking] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [message, setMessage] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [selectedApiKey, setSelectedApiKey] = useState<string>("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modelAliases, setModelAliases] = useState<any>({});
  const [showManualConfigModal, setShowManualConfigModal] = useState<boolean>(false);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].key);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (initialStatus) setDshStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (isExpanded) {
      if (!dshStatus) checkStatus();
      fetchModelAliases();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (dshStatus?.dsh?.models?.length) {
      setSelectedModels(dshStatus.dsh.models);
    }
    if (dshStatus?.dsh?.defaultModel) {
      setDefaultModel(dshStatus.dsh.defaultModel);
    }
    if (dshStatus?.dsh?.baseURL && !customBaseUrl) {
      setCustomBaseUrl(stripV1(dshStatus.dsh.baseURL));
    }
  }, [dshStatus]);

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  const currentBaseUrl = dshStatus?.dsh?.baseURL || "";

  const getConfigStatus = () => {
    if (!dshStatus?.installed) return null;
    if (!dshStatus?.dsh) return "not_configured";
    return matchKnownEndpoint(currentBaseUrl, { tunnelPublicUrl, tailscaleUrl })
      ? "configured"
      : "other";
  };

  const configStatus = getConfigStatus();

  const getEffectiveBaseUrl = () => ensureV1(customBaseUrl || stripV1(baseUrl));
  const getDisplayUrl = () => `${customBaseUrl || stripV1(baseUrl)}/v1`;

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(ENDPOINT);
      const data = await res.json();
      setDshStatus(data);
    } catch (error) {
      setDshStatus({ installed: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    setMessage(null);
    try {
      const keyToUse =
        selectedApiKey && selectedApiKey.trim()
          ? selectedApiKey
          : !cloudEnabled
            ? "sk_10router"
            : selectedApiKey;
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
          models: selectedModels,
          defaultModel: defaultModel || selectedModels[0],
        }),
      });
      const data = await res.json();
      if (res.ok) {
        rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
        setMessage({
          type: "success",
          text: "Applied — restart `dsh web` to pick up the 10Router provider.",
        });
        checkStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to apply settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const handleReset = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings reset successfully!" });
        setSelectedModels([]);
        setDefaultModel("");
        checkStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to reset settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const getManualConfigs = () => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_10router"
          : "<API_KEY_FROM_DASHBOARD>";
    const modelLines = (selectedModels.length > 0 ? selectedModels : ["provider/model-id"])
      .map((m) => `          - id: ${m}\n            name: ${m}`)
      .join("\n");
    return [
      {
        filename: "~/.dsh/profiles/web/cordis.patch.yml (append)",
        content: `# 10Router provider for DeepSeek Harness — restart \`dsh web\` after editing
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      10router:
        displayName: 10Router
        apiKeyEnv: TEN_ROUTER_API_KEY
        api: openai-completions
        baseURL: ${getEffectiveBaseUrl()}
        models:
${modelLines}
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: 10router
    model: ${defaultModel || selectedModels[0] || "provider/model-id"}
`,
      },
      {
        filename: "~/.dsh/.credentials.yaml (add ref)",
        content: `refs: { TEN_ROUTER_API_KEY: ${keyToUse} }`,
      },
    ];
  };

  return (
    <Card size="sm" className="overflow-hidden">
      <CardContent>
        <div
          className="flex items-start justify-between gap-3 hover:cursor-pointer sm:items-center"
          onClick={onToggle}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-8 flex items-center justify-center shrink-0">
              <Image
                src={tool.image || "/providers/deepseek.png"}
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
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="font-medium text-sm">{tool.name}</h3>
                {configStatus === "configured" && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-600 dark:text-green-400 rounded-full">
                    Connected
                  </span>
                )}
                {configStatus === "not_configured" && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 rounded-full">
                    Not configured
                  </span>
                )}
                {configStatus === "other" && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full">
                    Other
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
            {checking && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="progress_activity" className="animate-spin" />
                <span>Checking DSH config...</span>
              </div>
            )}

            {!checking && dshStatus && !dshStatus.installed && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Icon name="warning" className="text-yellow-500" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-600 dark:text-yellow-400">
                        {dshStatus.container
                          ? "10Router runs in a container"
                          : "DSH home not found"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {dshStatus.container
                          ? "DSH lives on your host, not inside the container. Copy the manual config below into your host's ~/.dsh."
                          : "No ~/.dsh directory found. Launch `dsh web` once first, then come back — manual configuration is still available."}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-9">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowManualConfigModal(true)}
                      className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30"
                    >
                      <Icon name="content_copy" className="text-[18px] mr-1" />
                      Manual Config
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInstallGuide(!showInstallGuide)}
                    >
                      <Icon
                        name={showInstallGuide ? "expand_less" : "help"}
                        className="text-[18px] mr-1"
                      />
                      {showInstallGuide ? "Hide" : "How to Install"}
                    </Button>
                  </div>
                </div>
                {showInstallGuide && (
                  <div className="p-4 bg-card border border-border rounded-lg">
                    <h4 className="font-medium mb-3">Installation Guide</h4>
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">
                          Run from npm (Node.js required):
                        </p>
                        <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">
                          npx @deepseek-ai/dsh web
                        </code>
                      </div>
                      <p className="text-muted-foreground">
                        The Web UI starts at{" "}
                        <code className="px-1 bg-black/5 dark:bg-white/5 rounded">
                          http://127.0.0.1:3080
                        </code>{" "}
                        and creates{" "}
                        <code className="px-1 bg-black/5 dark:bg-white/5 rounded">~/.dsh</code> on
                        first launch. Click &quot;Apply&quot; to auto-configure.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!checking && dshStatus?.installed && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Select Endpoint
                    </span>
                    <BaseUrlSelect
                      value={customBaseUrl || getDisplayUrl()}
                      onChange={setCustomBaseUrl}
                      requiresExternalUrl={tool.requiresExternalUrl}
                      tunnelEnabled={tunnelEnabled}
                      tunnelPublicUrl={tunnelPublicUrl}
                      tailscaleEnabled={tailscaleEnabled}
                      tailscaleUrl={tailscaleUrl}
                      currentUrl={currentBaseUrl}
                    />
                  </div>

                  {currentBaseUrl ? (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-2">
                      <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                        Current
                      </span>
                      <span className="min-w-0 truncate rounded bg-card/40 px-2 py-2 text-xs text-muted-foreground sm:py-1.5">
                        {currentBaseUrl}
                      </span>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      API Key
                    </span>
                    <ApiKeySelect
                      value={selectedApiKey}
                      onChange={setSelectedApiKey}
                      apiKeys={apiKeys}
                      cloudEnabled={cloudEnabled}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-2">
                    <span className="pt-1 text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Models
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex min-h-7 flex-wrap gap-1.5 rounded border border-border bg-card px-2 py-1.5">
                        {selectedModels.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No models added</span>
                        ) : (
                          selectedModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 rounded border border-transparent bg-black/5 px-2 py-0.5 text-xs text-muted-foreground hover:border-border dark:bg-white/5"
                            >
                              {m}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => {
                                      const next = selectedModels.filter((x) => x !== m);
                                      setSelectedModels(next);
                                      if (defaultModel === m) setDefaultModel(next[0] || "");
                                    }}
                                    className="ml-0.5 hover:text-red-500"
                                  >
                                    <Icon name="close" className="text-[12px]" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Remove</TooltipContent>
                              </Tooltip>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setModalOpen(true)}
                          className="cursor-pointer rounded border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:border-primary"
                        >
                          Add Model
                        </button>
                        <span className="text-xs text-muted-foreground">
                          Written to{" "}
                          <code className="rounded bg-black/5 px-1 dark:bg-white/5">
                            cordis.patch.yml
                          </code>{" "}
                          — restart dsh to apply.
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Default Model
                    </span>
                    <Select value={defaultModel} onValueChange={setDefaultModel}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select default model" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedModels.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {message && (
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}
                  >
                    <Icon
                      name={message.type === "success" ? "check_circle" : "error"}
                      className="text-[14px]"
                    />
                    <span>{message.text}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={
                      (!selectedApiKey && cloudEnabled && apiKeys.length > 0) ||
                      selectedModels.length === 0 ||
                      applying
                    }
                  >
                    {applying && <Loader2 className="size-4 animate-spin" />}
                    <Icon name="save" className="text-[14px] mr-1" />
                    Apply
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleReset} disabled={restoring}>
                    {restoring && <Loader2 className="size-4 animate-spin" />}
                    <Icon name="restore" className="text-[14px] mr-1" />
                    Reset
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowManualConfigModal(true)}>
                    <Icon name="content_copy" className="text-[14px] mr-1" />
                    Manual Config
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {modalOpen && (
          <ModelSelectModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            onSelect={(model) => {
              if (!selectedModels.includes(model.value)) {
                const next = [...selectedModels, model.value];
                setSelectedModels(next);
                if (!defaultModel) setDefaultModel(model.value);
              }
            }}
            onDeselect={(model) => {
              const next = selectedModels.filter((m) => m !== model.value);
              setSelectedModels(next);
              if (defaultModel === model.value) setDefaultModel(next[0] || "");
            }}
            selectedModel={null}
            addedModelValues={selectedModels}
            closeOnSelect={false}
            title="Add Models for DSH"
            activeProviders={activeProviders}
            modelAliases={modelAliases}
          />
        )}

        <ManualConfigModal
          isOpen={showManualConfigModal}
          onClose={() => setShowManualConfigModal(false)}
          title="DSH - Manual Configuration"
          configs={getManualConfigs()}
        />
      </CardContent>
    </Card>
  );
}
