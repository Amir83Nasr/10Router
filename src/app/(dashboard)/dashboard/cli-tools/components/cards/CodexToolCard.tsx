"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import { ModelSelectModal, ManualConfigModal } from "@/shared/components";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import BaseUrlSelect from "../shared/BaseUrlSelect";
import ApiKeySelect from "../shared/ApiKeySelect";
import { matchKnownEndpoint } from "../shared/cliEndpointMatch";
import { rememberEndpoint } from "../shared/cliEndpointPresets";
import { profileNameForModel, profileFileName } from "@/app/api/cli-tools/codex-settings/profiles";

export default function CodexToolCard({
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
  const [codexStatus, setCodexStatus] = useState(initialStatus || null);
  const [checkingCodex, setCheckingCodex] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [message, setMessage] = useState<any>(null);
  const [showInstallGuide, setShowInstallGuide] = useState<boolean>(false);
  const [selectedApiKey, setSelectedApiKey] = useState<string>("");
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [subagentModel, setSubagentModel] = useState<string>("");
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [subagentModalOpen, setSubagentModalOpen] = useState<boolean>(false);
  const [modelAliases, setModelAliases] = useState<any>({});
  const [showManualConfigModal, setShowManualConfigModal] = useState<boolean>(false);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].key);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (initialStatus) setCodexStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (isExpanded) {
      if (!codexStatus) checkCodexStatus();
      fetchModelAliases();
    }
  }, [isExpanded]);

  const fetchModelAliases = async () => {
    try {
      const res = await fetch("/api/models/alias");
      const data = await res.json();
      if (res.ok) setModelAliases(data.aliases || {});
    } catch (error) {
      console.log("Error fetching model aliases:", error);
    }
  };

  // Added models come from profile files; subagent from root config content
  useEffect(() => {
    if (codexStatus?.profiles) {
      setSelectedModels(codexStatus.profiles.map((p: any) => p.model).filter(Boolean));
    }
    if (codexStatus?.config) {
      const subagentModelMatch = codexStatus.config.match(
        /^default_subagent_model\s*=\s*"([^"]+)"/m,
      );
      if (subagentModelMatch) setSubagentModel(subagentModelMatch[1]);
    }
  }, [codexStatus]);

  const getCurrentBaseUrl = () => {
    const parsed = codexStatus?.config?.match(/base_url\s*=\s*"([^"]+)"/);
    return parsed ? parsed[1] : "";
  };

  const currentBaseUrl = getCurrentBaseUrl();

  const getConfigStatus = () => {
    if (!codexStatus?.installed) return null;
    if (!codexStatus.config) return "not_configured";
    return matchKnownEndpoint(currentBaseUrl, { tunnelPublicUrl, tailscaleUrl })
      ? "configured"
      : "other";
  };

  const configStatus = getConfigStatus();

  const getEffectiveBaseUrl = () => {
    const url = customBaseUrl || `${baseUrl}/v1`;
    // Ensure URL ends with /v1
    return url.endsWith("/v1") ? url : `${url}/v1`;
  };

  const getDisplayUrl = () => customBaseUrl || `${baseUrl}/v1`;

  const checkCodexStatus = async () => {
    setCheckingCodex(true);
    try {
      const res = await fetch("/api/cli-tools/codex-settings");
      const data = await res.json();
      setCodexStatus(data);
    } catch (error) {
      setCodexStatus({ installed: false, error: error.message });
    } finally {
      setCheckingCodex(false);
    }
  };

  const handleApplySettings = async () => {
    setApplying(true);
    setMessage(null);
    try {
      // Use sk_10router for localhost if no key, otherwise use selected key
      const keyToUse =
        selectedApiKey && selectedApiKey.trim()
          ? selectedApiKey
          : !cloudEnabled
            ? "sk_10router"
            : selectedApiKey;

      const res = await fetch("/api/cli-tools/codex-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: getEffectiveBaseUrl(),
          apiKey: keyToUse,
          models: selectedModels,
          subagentModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Remember the endpoint so it stays selectable next time
        rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
        setMessage({
          type: "success",
          text: "Applied — models appear in codex /model. Account default kept; use codex --profile 10router-<model> for 10Router routing.",
        });
        checkCodexStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to apply settings" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setApplying(false);
    }
  };

  const handleResetSettings = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch("/api/cli-tools/codex-settings", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings reset successfully!" });
        setSelectedModels([]);
        setSubagentModel("");
        checkCodexStatus();
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

    const configs = [
      {
        filename: "~/.codex/config.toml",
        content: `# 10Router Configuration for Codex CLI
# Default model/provider stay on your ChatGPT account — only the provider
# definition below is added. Selected models are merged into
# model_catalog_json (~/.codex/10router-model-catalog.json) so they show in
# /model, and into profile files launched via: codex --profile <name>
model_catalog_json = "10router-model-catalog.json"

[model_providers.10router]
name = "10Router"
base_url = "${getEffectiveBaseUrl()}"
wire_api = "responses"

[model_providers.10router.http_headers]
Authorization = "Bearer ${keyToUse}"
`,
      },
    ];

    const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
    modelsToShow.forEach((m) => {
      const profileName = profileNameForModel(m);
      configs.push({
        filename: `~/.codex/${profileFileName(profileName)}`,
        content: `# Launch with: codex --profile ${profileName}
model = "${m}"
model_provider = "10router"
model_catalog_json = "10router-model-catalog.json"
${subagentModel ? `\n[agents]\ndefault_subagent_model = "${subagentModel}"\n` : ""}`,
      });
    });

    return configs;
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
                src="/providers/codex.png"
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
            {checkingCodex && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon name="progress_activity" className="animate-spin" />
                <span>Checking Codex CLI...</span>
              </div>
            )}

            {!checkingCodex && codexStatus && !codexStatus.installed && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Icon name="warning" className="text-yellow-500" />
                    <div className="flex-1">
                      <p className="font-medium text-yellow-600 dark:text-yellow-400">
                        {codexStatus.container
                          ? "10Router runs in a container"
                          : "Codex CLI not detected locally"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {codexStatus.container
                          ? "The CLI lives on your host, not inside the container. Copy the manual config below into your host's ~/.codex/config.toml."
                          : "Manual configuration is still available if 10router is deployed on a remote server."}
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
                        <p className="text-muted-foreground mb-1">macOS / Linux / Windows:</p>
                        <code className="block px-3 py-2 bg-black/5 dark:bg-white/5 rounded font-mono text-xs">
                          npm install -g @openai/codex
                        </code>
                      </div>
                      <p className="text-muted-foreground">
                        After installation, run{" "}
                        <code className="px-1 bg-black/5 dark:bg-white/5 rounded">codex</code> to
                        verify.
                      </p>
                      <div className="pt-2 border-t border-border">
                        <p className="text-muted-foreground text-xs">
                          Codex reads custom providers from{" "}
                          <code className="px-1 bg-black/5 dark:bg-white/5 rounded">
                            ~/.codex/config.toml
                          </code>
                          . Click &quot;Apply&quot; to auto-configure.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {!checkingCodex && codexStatus?.installed && (
              <>
                <div className="flex flex-col gap-2">
                  {/* Legacy hijack warning: root model/provider still overridden */}
                  {codexStatus?.rootHijacked && (
                    <div className="flex items-start gap-2 px-2 py-1.5 rounded text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                      <Icon name="warning" className="text-[14px] shrink-0 mt-0.5" />
                      <span>
                        Old settings overrode your default Codex model. Apply to restore your
                        ChatGPT account default — added models become profiles.
                      </span>
                    </div>
                  )}

                  {/* Endpoint (selector) */}
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

                  {/* Current configured */}
                  {codexStatus?.config &&
                    (() => {
                      return currentBaseUrl ? (
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-2">
                          <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                            Current
                          </span>
                          <span className="min-w-0 truncate rounded bg-card/40 px-2 py-2 text-xs text-muted-foreground sm:py-1.5">
                            {currentBaseUrl}
                          </span>
                        </div>
                      ) : null;
                    })()}

                  {/* API Key */}
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

                  {/* Models (one profile per model; default account untouched) */}
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
                                    onClick={() =>
                                      setSelectedModels(selectedModels.filter((x) => x !== m))
                                    }
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
                          Launch:{" "}
                          <code className="rounded bg-black/5 px-1 dark:bg-white/5">
                            codex --profile 10router-&lt;model&gt;
                          </code>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Subagent Model */}
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Subagent Model
                    </span>
                    <div className="relative w-full min-w-0">
                      <input
                        type="text"
                        value={subagentModel}
                        onChange={(e: any) => setSubagentModel(e.target.value)}
                        placeholder={
                          selectedModels[0] || "provider/model-id (defaults to main model)"
                        }
                        className="w-full min-w-0 pl-2 pr-7 py-2 bg-card rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
                      />
                      {subagentModel && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setSubagentModel("")}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-red-500 rounded transition-colors"
                            >
                              <Icon name="close" className="text-[14px]" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Clear (will use main model)</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <button
                      onClick={() => setSubagentModalOpen(true)}
                      className="w-full sm:w-auto rounded border px-2 py-2 text-xs transition-colors sm:py-1.5 whitespace-nowrap sm:shrink-0 bg-card border-border text-foreground hover:border-primary cursor-pointer"
                    >
                      Select Model
                    </button>
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
                    onClick={handleApplySettings}
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetSettings}
                    disabled={restoring}
                  >
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
                setSelectedModels([...selectedModels, model.value]);
              }
            }}
            onDeselect={(model) => {
              setSelectedModels(selectedModels.filter((m) => m !== model.value));
            }}
            selectedModel={null}
            addedModelValues={selectedModels}
            closeOnSelect={false}
            title="Add Models for Codex"
            activeProviders={activeProviders}
            modelAliases={modelAliases}
          />
        )}

        {subagentModalOpen && (
          <ModelSelectModal
            isOpen={subagentModalOpen}
            onClose={() => setSubagentModalOpen(false)}
            onSelect={(model) => {
              setSubagentModel(model.value);
              setSubagentModalOpen(false);
            }}
            selectedModel={subagentModel}
            activeProviders={activeProviders}
            modelAliases={modelAliases}
            title="Select Subagent Model for Codex"
          />
        )}

        <ManualConfigModal
          isOpen={showManualConfigModal}
          onClose={() => setShowManualConfigModal(false)}
          title="Codex CLI - Manual Configuration"
          configs={getManualConfigs()}
        />
      </CardContent>
    </Card>
  );
}
