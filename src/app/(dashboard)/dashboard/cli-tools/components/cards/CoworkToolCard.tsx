"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import {
  ManualConfigModal,
  ComboFormModal,
  McpMarketplaceModal,
  ModelSelectModal,
} from "@/shared/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import Image from "next/image";
import BaseUrlSelect from "../shared/BaseUrlSelect";
import { rememberEndpoint } from "../shared/cliEndpointPresets";
import ApiKeySelect from "../shared/ApiKeySelect";

const ENDPOINT = "/api/cli-tools/cowork-settings";

const stripV1 = (url) => (url || "").replace(/\/v1\/?$/, "");
const ensureV1 = (url) => {
  const trimmed = (url || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export default function CoworkToolCard({
  tool,
  isExpanded,
  onToggle,
  baseUrl,
  apiKeys,
  activeProviders,
  hasActiveProviders,
  cloudEnabled,
  cloudUrl,
  tunnelEnabled,
  tunnelPublicUrl,
  tailscaleEnabled,
  tailscaleUrl,
  initialStatus,
}: any) {
  const [status, setStatus] = useState(initialStatus || null);
  const [checking, setChecking] = useState<boolean>(false);
  const [applying, setApplying] = useState<boolean>(false);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [message, setMessage] = useState<any>(null);
  const [selectedApiKey, setSelectedApiKey] = useState<string>("");
  const [selectedModels, setSelectedModels] = useState<any[]>([]);
  const [showManualConfigModal, setShowManualConfigModal] = useState<boolean>(false);
  const [customBaseUrl, setCustomBaseUrl] = useState<string>("");
  const [plugins, setPlugins] = useState<any[]>([]);
  const [localPlugins, setLocalPlugins] = useState<any[]>([]);
  const [customPlugins, setCustomPlugins] = useState<any[]>([]);
  const [modelAliases, setModelAliases] = useState<any>({});
  const [comboModalOpen, setComboModalOpen] = useState<boolean>(false);
  const [modelSelectOpen, setModelSelectOpen] = useState<boolean>(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState<boolean>(false);
  const [addMcpOpen, setAddMcpOpen] = useState<boolean>(false);
  const [addMcpForm, setAddMcpForm] = useState({ name: "", url: "" });

  useEffect(() => {
    if (apiKeys?.length > 0 && !selectedApiKey) {
      setSelectedApiKey(apiKeys[0].key);
    }
  }, [apiKeys, selectedApiKey]);

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
  }, [initialStatus]);

  useEffect(() => {
    if (isExpanded && !status) checkStatus();
  }, [isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    fetch("/api/models/alias")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setModelAliases(data.aliases || {});
      })
      .catch(() => {});
  }, [isExpanded]);

  useEffect(() => {
    if (status?.cowork?.models?.length) {
      setSelectedModels(status.cowork.models);
    }
    if (status?.cowork?.baseUrl && !customBaseUrl) {
      setCustomBaseUrl(stripV1(status.cowork.baseUrl));
    }
    // Initialize plugins: from current config, fallback to defaultPlugins
    if (Array.isArray(status?.cowork?.plugins) && status.cowork.plugins.length > 0) {
      setPlugins(status.cowork.plugins);
    } else if (plugins.length === 0 && Array.isArray(status?.defaultPlugins)) {
      setPlugins(status.defaultPlugins);
    }
    if (Array.isArray(status?.cowork?.localPlugins)) {
      setLocalPlugins(status.cowork.localPlugins);
    }
    if (Array.isArray(status?.cowork?.customPlugins) && status.cowork.customPlugins.length > 0) {
      setCustomPlugins(status.cowork.customPlugins);
    }
  }, [status]);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch(ENDPOINT);
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      setStatus({ installed: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const getEffectiveBaseUrl = () => ensureV1(customBaseUrl);

  const currentBaseUrl = status?.cowork?.baseUrl || "";

  const getConfigStatus = () => {
    if (!status?.installed) return null;
    const url = status?.cowork?.baseUrl;
    if (!url) return "not_configured";
    return status.has10Router ? "configured" : "other";
  };

  const configStatus = getConfigStatus();

  const handleApply = async () => {
    setMessage(null);
    const effectiveUrl = getEffectiveBaseUrl();

    if (selectedModels.length === 0) {
      setMessage({ type: "error", text: "Please select at least one model" });
      return;
    }

    setApplying(true);
    try {
      const keyToUse =
        selectedApiKey?.trim() ||
        (apiKeys?.length > 0 ? apiKeys[0].key : null) ||
        (!cloudEnabled ? "sk_10router" : null);

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: effectiveUrl,
          apiKey: keyToUse,
          models: selectedModels,
          plugins,
          localPlugins,
          customPlugins,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        // Remember the endpoint so it stays selectable next time
        rememberEndpoint(getEffectiveBaseUrl(), { tunnelPublicUrl, tailscaleUrl });
        setMessage({
          type: "success",
          text: "Settings applied. Quit & reopen Claude Desktop to load.",
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

  const handleCreateCombo = async ({ name, models }) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, models }),
      });
      if (!res.ok) {
        const err = await res.json();
        setMessage({ type: "error", text: err.error || "Failed to create combo" });
        return;
      }
      if (!selectedModels.includes(name)) {
        setSelectedModels([...selectedModels, name]);
      }
      setComboModalOpen(false);
      setMessage({ type: "success", text: `Combo "${name}" created and added.` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const handleAddModel = (model) => {
    const value = model?.value || model?.name || model;
    if (!value || selectedModels.includes(value)) return;
    setSelectedModels((prev) => [...prev, value]);
  };

  const handleRemoveModel = (model) => {
    const value = model?.value || model?.name || model;
    setSelectedModels((prev) => prev.filter((item) => item !== value));
  };

  const handleReset = async () => {
    setRestoring(true);
    setMessage(null);
    try {
      const res = await fetch(ENDPOINT, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Settings reset successfully" });
        setSelectedModels([]);
        setPlugins(status?.defaultPlugins || []);
        setLocalPlugins([]);
        setCustomPlugins([]);
        checkStatus();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to reset" });
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setRestoring(false);
    }
  };

  const addPlugin = (p) => {
    if (plugins.some((x) => x.name === p.name)) return;
    setPlugins([...plugins, p]);
  };

  const removePlugin = (name) => {
    setPlugins(plugins.filter((p) => p.name !== name));
  };

  const getManualConfigs = () => {
    const keyToUse =
      selectedApiKey && selectedApiKey.trim()
        ? selectedApiKey
        : !cloudEnabled
          ? "sk_10router"
          : "<API_KEY_FROM_DASHBOARD>";

    const modelsToShow = selectedModels.length > 0 ? selectedModels : ["provider/model-id"];
    const cfg = {
      inferenceProvider: "gateway",
      inferenceGatewayBaseUrl: getEffectiveBaseUrl() || "https://your-public-host/v1",
      inferenceGatewayApiKey: keyToUse,
      inferenceModels: modelsToShow.map((name) => ({ name })),
    };

    return [
      {
        filename: "~/Library/Application Support/Claude-3p/configLibrary/<appliedId>.json",
        content: JSON.stringify(cfg, null, 2),
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
                <span>Checking Claude Cowork...</span>
              </div>
            )}

            {!checking && status && !status.installed && (
              <div className="flex flex-col gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Icon name="warning" className="text-yellow-500" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-600 dark:text-yellow-400">
                      {status.container
                        ? "10Router runs in a container"
                        : "Claude Desktop (Cowork mode) not detected"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {status.container
                        ? "The app lives on your host, not inside the container. Copy the manual config below into the host app config."
                        : "Open Claude Desktop → Help → Troubleshooting → Enable Developer mode → Configure third-party inference, then return here."}
                    </p>
                  </div>
                </div>
                <div className="pl-9">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowManualConfigModal(true)}
                    className="!bg-yellow-500/20 !border-yellow-500/40 !text-yellow-700 dark:!text-yellow-300 hover:!bg-yellow-500/30"
                  >
                    <Icon name="content_copy" className="text-[18px] mr-1" />
                    Manual Config
                  </Button>
                </div>
              </div>
            )}

            {!checking && status?.installed && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-center sm:gap-2">
                    <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Select Endpoint
                    </span>
                    <BaseUrlSelect
                      value={getEffectiveBaseUrl()}
                      onChange={(url) => setCustomBaseUrl(stripV1(url))}
                      tunnelEnabled={tunnelEnabled}
                      tunnelPublicUrl={tunnelPublicUrl}
                      tailscaleEnabled={tailscaleEnabled}
                      tailscaleUrl={tailscaleUrl}
                      cloudEnabled={cloudEnabled}
                      cloudUrl={cloudUrl}
                      currentUrl={currentBaseUrl}
                    />
                  </div>

                  {status?.cowork?.baseUrl && (
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-2">
                      <span className="text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                        Current
                      </span>
                      <span className="min-w-0 truncate rounded bg-card/40 px-2 py-2 text-xs text-muted-foreground sm:py-1.5">
                        {status.cowork.baseUrl}
                      </span>
                    </div>
                  )}

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
                          <span className="text-xs text-muted-foreground">No models selected</span>
                        ) : (
                          selectedModels.map((m) => (
                            <span
                              key={m}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/5 text-muted-foreground border border-transparent hover:border-border"
                            >
                              {m}
                              <button
                                onClick={() => handleRemoveModel(m)}
                                className="ml-0.5 hover:text-red-500"
                              >
                                <Icon name="close" className="text-[12px]" />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => setModelSelectOpen(true)}
                          className="cursor-pointer rounded border border-border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:border-primary"
                        >
                          Add Model
                        </button>
                        <button
                          onClick={() => setComboModalOpen(true)}
                          className="shrink-0 cursor-pointer whitespace-nowrap rounded border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/20"
                        >
                          + Combo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-2">
                    <span className="pt-1 text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      MCP
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      {/* Preset plugins */}
                      {plugins
                        .filter((p) => p.name !== "exa")
                        .map((p) => (
                          <div
                            key={p.name}
                            className="flex items-center gap-2 px-2 py-1 bg-card rounded border border-border"
                          >
                            <span className="text-xs font-medium min-w-0 truncate flex-shrink-0">
                              {p.title || p.name}
                            </span>
                            {p.oauth && (
                              <span className="text-[8px] text-amber-600 shrink-0">OAuth</span>
                            )}
                            <div
                              className="flex-1 flex flex-wrap gap-1 overflow-hidden"
                              style={{ maxHeight: "1.5rem" }}
                            >
                              {Array.isArray(p.toolNames) &&
                                p.toolNames.slice(0, 6).map((t) => (
                                  <span
                                    key={t}
                                    className="text-[9px] px-1 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted-foreground whitespace-nowrap"
                                  >
                                    {t}
                                  </span>
                                ))}
                              {Array.isArray(p.toolNames) && p.toolNames.length > 6 && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted-foreground whitespace-nowrap">
                                  +{p.toolNames.length - 6}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => removePlugin(p.name)}
                              className="shrink-0 hover:text-red-500 ml-auto"
                            >
                              <Icon name="close" className="text-[12px]" />
                            </button>
                          </div>
                        ))}
                      {/* Custom plugins */}
                      {customPlugins.map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center gap-2 px-2 py-1 bg-card rounded border border-border"
                        >
                          <span className="text-xs font-medium min-w-0 truncate flex-shrink-0">
                            {p.name}
                          </span>
                          <span className="text-[8px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-500 shrink-0">
                            custom
                          </span>
                          <span className="flex-1 text-[9px] text-muted-foreground truncate">
                            {p.url}
                          </span>
                          <button
                            onClick={() =>
                              setCustomPlugins(customPlugins.filter((x) => x.name !== p.name))
                            }
                            className="shrink-0 hover:text-red-500 ml-auto"
                          >
                            <Icon name="close" className="text-[12px]" />
                          </button>
                        </div>
                      ))}
                      {plugins.filter((p) => p.name !== "exa").length === 0 &&
                        customPlugins.length === 0 && (
                          <div className="px-2 py-1.5 bg-card rounded border border-border text-xs text-muted-foreground">
                            No MCPs added
                          </div>
                        )}
                      {/* Actions row */}
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => setMarketplaceOpen(true)}
                          className="px-2 py-1 rounded border text-xs bg-primary/10 border-primary/40 text-primary hover:bg-primary/20 cursor-pointer whitespace-nowrap"
                        >
                          + Browse
                        </button>
                        <button
                          onClick={() => {
                            setAddMcpForm({ name: "", url: "" });
                            setAddMcpOpen(true);
                          }}
                          className="px-2 py-1 rounded border text-xs bg-card border-border text-muted-foreground hover:border-primary hover:text-primary cursor-pointer whitespace-nowrap"
                        >
                          + Custom
                        </button>
                        <a
                          href="https://mcp.so"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-primary underline ml-auto"
                        >
                          Find MCPs →
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-2">
                    <span className="pt-1 text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                      Tools
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {(() => {
                        const exaEnabled = plugins.some((p) => p.name === "exa");
                        const exaDef = (status?.defaultPlugins || []).find((d) => d.name === "exa");
                        return (
                          <label className="flex items-start gap-2 cursor-pointer px-2 py-1.5 bg-card rounded border border-border">
                            <Checkbox
                              checked={exaEnabled}
                              onCheckedChange={(v: any) => {
                                if (v === true && exaDef)
                                  setPlugins([...plugins.filter((p) => p.name !== "exa"), exaDef]);
                                else setPlugins(plugins.filter((p) => p.name !== "exa"));
                              }}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">Web Search & Fetch (Exa)</div>
                              <p className="text-[10px] text-muted-foreground leading-snug">
                                Replaces built-in WebSearch/WebFetch. Auto-strips duplicates from
                                tool list.
                              </p>
                            </div>
                          </label>
                        );
                      })()}
                      {(() => {
                        const browserDef = (status?.localStdioPlugins || []).find(
                          (p) => p.name === "browsermcp",
                        );
                        if (!browserDef) return null;
                        const browserEnabled = localPlugins.includes("browsermcp");
                        return (
                          <label className="flex items-start gap-2 cursor-pointer px-2 py-1.5 bg-card rounded border border-border">
                            <Checkbox
                              checked={browserEnabled}
                              onCheckedChange={(v: any) =>
                                setLocalPlugins(
                                  v === true
                                    ? [...localPlugins, "browsermcp"]
                                    : localPlugins.filter((n) => n !== "browsermcp"),
                                )
                              }
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium">
                                Browser Control (Browser MCP)
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-snug">
                                Controls your running Chrome. Auto-strips Cowork&apos;s built-in
                                browser tools.{" "}
                                <a
                                  href={browserDef.extensionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline"
                                >
                                  Install Chrome extension
                                </a>
                              </p>
                            </div>
                          </label>
                        );
                      })()}
                    </div>
                  </div>

                  {Array.isArray(status?.localStdioPlugins) &&
                    status.localStdioPlugins.filter((p) => p.name !== "browsermcp").length > 0 && (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[8rem_1fr] sm:items-start sm:gap-2">
                        <span className="pt-1 text-xs font-semibold text-foreground sm:text-right sm:text-sm">
                          Local Plugins
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex flex-col gap-1.5 px-2 py-1.5 bg-card rounded border border-border">
                            {status.localStdioPlugins
                              .filter((p) => p.name !== "browsermcp")
                              .map((p) => {
                                const enabled = localPlugins.includes(p.name);
                                return (
                                  <label
                                    key={p.name}
                                    className="flex items-start gap-2 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={enabled}
                                      onCheckedChange={(v: any) =>
                                        setLocalPlugins(
                                          v === true
                                            ? [...localPlugins, p.name]
                                            : localPlugins.filter((n) => n !== p.name),
                                        )
                                      }
                                      className="mt-0.5"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="text-xs font-medium">{p.title}</span>
                                        <span className="text-[8px] text-amber-600">stdio</span>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground leading-snug">
                                        {p.description}
                                      </p>
                                      {p.extensionUrl && (
                                        <a
                                          href={p.extensionUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-[10px] text-primary underline"
                                        >
                                          Install Chrome extension
                                        </a>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            ⚠️ Local plugins run as subprocess via{" "}
                            <code className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/5">
                              npx
                            </code>
                            . Requires Node.js installed.
                          </p>
                        </div>
                      </div>
                    )}
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

                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleApply}
                    disabled={selectedModels.length === 0 || applying}
                    className="w-full sm:w-auto"
                  >
                    {applying && <Loader2 className="size-4 animate-spin" />}
                    <Icon name="save" className="text-[14px] mr-1" />
                    Apply
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={!status.has10Router || restoring}
                    className="w-full sm:w-auto"
                  >
                    {restoring && <Loader2 className="size-4 animate-spin" />}
                    <Icon name="restore" className="text-[14px] mr-1" />
                    Reset
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowManualConfigModal(true)}
                    className="w-full sm:w-auto"
                  >
                    <Icon name="content_copy" className="text-[14px] mr-1" />
                    Manual Config
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        <ManualConfigModal
          isOpen={showManualConfigModal}
          onClose={() => setShowManualConfigModal(false)}
          title="Claude Cowork - Manual Configuration"
          configs={getManualConfigs()}
        />

        {comboModalOpen && (
          <ComboFormModal
            isOpen={comboModalOpen}
            combo={null}
            onClose={() => setComboModalOpen(false)}
            onSave={handleCreateCombo}
            activeProviders={activeProviders}
            forcePrefix="claude-"
            title="Create Cowork Combo"
          />
        )}

        {modelSelectOpen && (
          <ModelSelectModal
            isOpen={modelSelectOpen}
            onClose={() => setModelSelectOpen(false)}
            onSelect={handleAddModel}
            onDeselect={handleRemoveModel}
            activeProviders={activeProviders}
            modelAliases={modelAliases}
            title="Select Cowork Model"
            addedModelValues={selectedModels}
            closeOnSelect={false}
          />
        )}

        <McpMarketplaceModal
          isOpen={marketplaceOpen}
          onClose={() => setMarketplaceOpen(false)}
          onAdd={addPlugin}
          addedNames={plugins.map((p) => p.name)}
        />

        {/* Add Custom MCP modal */}
        <Dialog open={addMcpOpen} onOpenChange={setAddMcpOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Custom MCP</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-2 p-4">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">Name</label>
                <Input
                  type="text"
                  placeholder="my-mcp"
                  value={addMcpForm.name}
                  onChange={(e: any) =>
                    setAddMcpForm((f) => ({
                      ...f,
                      name: e.target.value.replace(/\s+/g, "-").toLowerCase(),
                    }))
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted-foreground font-medium">SSE URL</label>
                <Input
                  type="text"
                  placeholder="https://your-mcp-server.com/sse"
                  value={addMcpForm.url}
                  onChange={(e: any) => setAddMcpForm((f) => ({ ...f, url: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  const name = addMcpForm.name.trim();
                  if (!name || !addMcpForm.url.trim()) return;
                  setCustomPlugins((prev) => [
                    ...prev.filter((x) => x.name !== name),
                    { name, url: addMcpForm.url.trim(), transport: "sse", custom: true },
                  ]);
                  setAddMcpOpen(false);
                }}
              >
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
