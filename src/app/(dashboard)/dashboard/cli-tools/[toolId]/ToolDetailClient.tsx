"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Page, PanelSkeleton } from "@/shared/components";
import { Button } from "@/components/ui/button";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { CLI_TOOLS } from "@/shared/constants/cliTools";
import { getModelsByProviderId, PROVIDER_ID_TO_ALIAS } from "@/shared/constants/models";
import {
  ClaudeToolCard,
  CodexToolCard,
  DefaultToolCard,
  OpenCodeToolCard,
  CoworkToolCard,
  DshToolCard,
} from "../components";

const CLOUD_URL = process.env.NEXT_PUBLIC_CLOUD_URL;

export default function ToolDetailClient({ toolId, machineId }: any) {
  const tool = CLI_TOOLS[toolId];
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modelMappings, setModelMappings] = useState<any>({});
  const [cloudEnabled, setCloudEnabled] = useState<boolean>(false);
  const [tunnelEnabled, setTunnelEnabled] = useState<boolean>(false);
  const [tunnelPublicUrl, setTunnelPublicUrl] = useState<string>("");
  const [tailscaleEnabled, setTailscaleEnabled] = useState<boolean>(false);
  const [tailscaleUrl, setTailscaleUrl] = useState<string>("");
  const [apiKeys, setApiKeys] = useState<any[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [provRes, settingsRes, tunnelRes, keysRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/settings"),
          fetch("/api/tunnel/status"),
          fetch("/api/keys"),
        ]);
        if (!mounted) return;
        if (provRes.ok) {
          const data = await provRes.json();
          setConnections(data.connections || []);
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setCloudEnabled(data.cloudEnabled || false);
        }
        if (tunnelRes.ok) {
          const data = await tunnelRes.json();
          setTunnelEnabled(!!(data.tunnel?.enabled || data.tunnel?.settingsEnabled));
          setTunnelPublicUrl(data.tunnel?.publicUrl || "");
          setTailscaleEnabled(!!(data.tailscale?.enabled || data.tailscale?.settingsEnabled));
          setTailscaleUrl(data.tailscale?.tunnelUrl || "");
        }
        if (keysRes.ok) {
          const data = await keysRes.json();
          setApiKeys(data.keys || []);
        }
      } catch (error) {
        console.log("Error loading tool data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const getActiveProviders = () => connections.filter((c) => c.isActive !== false);

  const getAllAvailableModels = () => {
    const activeProviders = getActiveProviders();
    const models = [];
    const seenModels = new Set();
    activeProviders.forEach((conn) => {
      const alias = PROVIDER_ID_TO_ALIAS[conn.provider] || conn.provider;
      const providerModels = getModelsByProviderId(conn.provider);
      providerModels.forEach((m) => {
        const modelValue = `${alias}/${m.id}`;
        if (!seenModels.has(modelValue)) {
          seenModels.add(modelValue);
          models.push({
            value: modelValue,
            label: `${alias}/${m.id}`,
            provider: conn.provider,
            alias,
            connectionName: conn.name,
            modelId: m.id,
          });
        }
      });

      // openai/anthropic-compatible providers are registered with a random UUID (e.g.
      // "openai-compatible-chat-<uuid>") that has no entry in the static PROVIDER_MODELS
      // catalog, so `getModelsByProviderId` returns []. Routing still works because the
      // request path uses the connection's own model config, but `hasActiveProviders`
      // below would flip to false and disable the Apply button. Fall back to the
      // connection's own models so these providers are usable from CLI tool pages.
      if (providerModels.length === 0) {
        const prefix = conn.providerSpecificData?.prefix || alias;
        const fallbackModels = [];
        if (conn.defaultModel)
          fallbackModels.push({ id: conn.defaultModel, name: conn.defaultModel });
        (conn.providerSpecificData?.customModels || []).forEach((m) => {
          if (m?.id && !fallbackModels.some((f) => f.id === m.id))
            fallbackModels.push({ id: m.id, name: m.name || m.id });
        });
        if (fallbackModels.length === 0 && conn.testStatus === "active") {
          // Provider is confirmed reachable but exposes no model info anywhere;
          // still let the user apply so they aren't stuck on a permanently disabled button.
          fallbackModels.push({ id: "model-id", name: `${prefix}/model-id` });
        }
        fallbackModels.forEach((m) => {
          const modelValue = `${prefix}/${m.id}`;
          if (!seenModels.has(modelValue)) {
            seenModels.add(modelValue);
            models.push({
              value: modelValue,
              label: `${prefix}/${m.id}`,
              provider: conn.provider,
              alias: prefix,
              connectionName: conn.name,
              modelId: m.id,
            });
          }
        });
      }
    });
    return models;
  };

  const handleModelMappingChange = useCallback((tId, alias, target) => {
    setModelMappings((prev) => {
      if (prev[tId]?.[alias] === target) return prev;
      return { ...prev, [tId]: { ...prev[tId], [alias]: target } };
    });
  }, []);

  const getBaseUrl = () => {
    if (tunnelEnabled && tunnelPublicUrl) return tunnelPublicUrl;
    if (cloudEnabled && CLOUD_URL) return CLOUD_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:20128";
  };

  const renderToolCard = () => {
    const availableModels = getAllAvailableModels();
    const hasActiveProviders = availableModels.length > 0;
    const commonProps = {
      tool,
      isExpanded: true,
      onToggle: () => {},
      baseUrl: getBaseUrl(),
      apiKeys,
      tunnelEnabled,
      tunnelPublicUrl,
      tailscaleEnabled,
      tailscaleUrl,
    };

    switch (toolId) {
      case "claude":
        return (
          <ClaudeToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            modelMappings={modelMappings[toolId] || {}}
            onModelMappingChange={(a, t) => handleModelMappingChange(toolId, a, t)}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
          />
        );
      case "codex":
        return (
          <CodexToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "opencode":
        return (
          <OpenCodeToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      case "cowork":
        return (
          <CoworkToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            hasActiveProviders={hasActiveProviders}
            cloudEnabled={cloudEnabled}
            cloudUrl={CLOUD_URL}
            tunnelEnabled={tunnelEnabled}
            tunnelPublicUrl={tunnelPublicUrl}
            tailscaleEnabled={tailscaleEnabled}
            tailscaleUrl={tailscaleUrl}
          />
        );
      case "dsh":
        return (
          <DshToolCard
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
          />
        );
      default:
        return (
          <DefaultToolCard
            toolId={toolId}
            {...commonProps}
            activeProviders={getActiveProviders()}
            cloudEnabled={cloudEnabled}
            tunnelEnabled={tunnelEnabled}
          />
        );
    }
  };

  // Guard removed/unknown tools (e.g. disabled Cowork) to avoid crash on direct URL.
  if (!tool) {
    return (
      <Page>
        <Button variant="outline" size="sm" asChild className="self-start">
          <Link href="/dashboard/cli-tools">
            <Icon name="arrow_back" className="text-lg" />
            CLI Tools
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Tool not found or disabled.</p>
      </Page>
    );
  }

  return (
    <Page>
      <div>
        <Button variant="outline" size="sm" asChild className="mb-4 self-start">
          <Link href="/dashboard/cli-tools">
            <Icon name="arrow_back" className="text-lg" />
            CLI Tools
          </Link>
        </Button>

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div
            className="size-12 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${tool.color}15` }}
          >
            <ProviderIcon
              src={tool.image}
              alt={tool.name}
              size={48}
              className="object-contain rounded-lg max-w-[48px] max-h-[48px]"
              fallbackText={tool.name.slice(0, 2).toUpperCase()}
              fallbackColor={tool.color}
            />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tool.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
          </div>
        </div>
      </div>
      {loading ? <PanelSkeleton /> : renderToolCard()}
    </Page>
  );
}
