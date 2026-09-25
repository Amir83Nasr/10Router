"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect } from "react";
import { CardSkeleton, Page, Section, CardGrid } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import {
  getInitials,
  getProviderIconSrc,
  guessProviderIconIdFromUrl,
} from "@/shared/utils/providerIcon";
import { OAUTH_PROVIDERS, APIKEY_PROVIDERS } from "@/shared/constants/config";
import {
  FREE_PROVIDERS,
  FREE_TIER_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  OPENAI_COMPATIBLE_PREFIX,
  ANTHROPIC_COMPATIBLE_PREFIX,
} from "@/shared/constants/providers";
import EntityCard from "@/shared/components/EntityCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select as StockSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorCode, getRelativeTime } from "@/shared/utils";
import ModelAvailabilityBadge from "./components/ModelAvailabilityBadge";
import AddCompatibleModal from "./components/AddCompatibleModal";
import { STATUS_FILTER_OPTIONS, matchesStatusFilter } from "./utils";

function getStatusDisplay(connected, error, errorCode) {
  const parts = [];
  if (connected > 0) {
    parts.push(
      <Badge key="connected" variant="default">
        <span className="size-1.5 rounded-full bg-green-500" />
        {connected} Connected
      </Badge>,
    );
  }
  if (error > 0) {
    const errText = errorCode ? `${error} Error (${errorCode})` : `${error} Error`;
    parts.push(
      <Badge key="error" variant="destructive">
        <span className="size-1.5 rounded-full bg-red-500" />
        {errText}
      </Badge>,
    );
  }
  if (parts.length === 0) {
    return <span className="text-muted-foreground">No connections</span>;
  }
  return parts;
}

function getConnectionErrorTag(connection) {
  if (!connection) return null;

  const explicitType = connection.lastErrorType;
  if (explicitType === "runtime_error") return "RUNTIME";
  if (
    explicitType === "upstream_auth_error" ||
    explicitType === "auth_missing" ||
    explicitType === "token_refresh_failed" ||
    explicitType === "token_expired"
  )
    return "AUTH";
  if (explicitType === "upstream_rate_limited") return "429";
  if (explicitType === "upstream_unavailable") return "5XX";
  if (explicitType === "network_error") return "NET";

  const numericCode = Number(connection.errorCode);
  if (Number.isFinite(numericCode) && numericCode >= 400) return String(numericCode);

  const fromMessage = getErrorCode(connection.lastError);
  if (fromMessage === "401" || fromMessage === "403") return "AUTH";
  if (fromMessage && fromMessage !== "ERR") return fromMessage;

  const msg = (connection.lastError || "").toLowerCase();
  if (msg.includes("runtime") || msg.includes("not runnable") || msg.includes("not installed"))
    return "RUNTIME";
  if (
    msg.includes("invalid api key") ||
    msg.includes("token invalid") ||
    msg.includes("revoked") ||
    msg.includes("unauthorized")
  )
    return "AUTH";

  return "ERR";
}

export default function ProvidersPage() {
  const [connections, setConnections] = useState<any[]>([]);
  const [providerNodes, setProviderNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddCompatibleModal, setShowAddCompatibleModal] = useState<boolean>(false);
  const [showAddAnthropicCompatibleModal, setShowAddAnthropicCompatibleModal] =
    useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const sortByPriority = (entries, authType) =>
    [...entries].sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(ka, authType);
      const sb = getProviderStats(kb, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  const sortItemsByPriority = (items, authType) =>
    [...items].sort((a, b) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const sa = getProviderStats(a.id, authType);
      const sb = getProviderStats(b.id, authType);
      const ca = sa.connected > 0 ? 1 : 0;
      const cb = sb.connected > 0 ? 1 : 0;
      if (ca !== cb) return cb - ca;
      return (a.name || "").localeCompare(b.name || "");
    });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [connectionsRes, nodesRes] = await Promise.all([
          fetch("/api/providers"),
          fetch("/api/provider-nodes"),
        ]);
        const connectionsData = await connectionsRes.json();
        const nodesData = await nodesRes.json();
        if (connectionsRes.ok) setConnections(connectionsData.connections || []);
        if (nodesRes.ok) setProviderNodes(nodesData.nodes || []);
      } catch (error) {
        console.log("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getProviderStats = (providerId: any, authType: any) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const providerConnections = connections.filter(
      (c) => c.provider === providerId && authTypes.includes(c.authType),
    );

    const getEffectiveStatus = (conn: any) => {
      const isCooldown = Object.entries(conn).some(
        ([k, v]: [string, any]) =>
          k.startsWith("modelLock_") && v && new Date(v).getTime() > Date.now(),
      );
      return conn.testStatus === "unavailable" && !isCooldown ? "active" : conn.testStatus;
    };

    const connected = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "active" || status === "success";
    }).length;

    const errorConns = providerConnections.filter((c) => {
      const status = getEffectiveStatus(c);
      return status === "error" || status === "expired" || status === "unavailable";
    });

    const error = errorConns.length;
    const total = providerConnections.length;
    const allDisabled = total > 0 && providerConnections.every((c) => c.isActive === false);

    const latestError = errorConns.sort(
      (a: any, b: any) =>
        (new Date(b.lastErrorAt || 0) as any) - (new Date(a.lastErrorAt || 0) as any),
    )[0];
    const errorCode = latestError ? getConnectionErrorTag(latestError) : null;
    const errorTime = latestError?.lastErrorAt ? getRelativeTime(latestError.lastErrorAt) : null;

    return { connected, error, total, errorCode, errorTime, allDisabled };
  };

  const matchStatus = (stats, isNoAuth = false) =>
    matchesStatusFilter(statusFilter, stats, isNoAuth);

  // Toggle all connections for a provider on/off. authType may be a single
  // string or an array (dual-auth counts oauth + api_key/apikey together).
  const handleToggleProvider = async (providerId, authType, newActive) => {
    const authTypes = Array.isArray(authType) ? authType : [authType];
    const matches = (c) => c.provider === providerId && authTypes.includes(c.authType);
    const providerConns = connections.filter(matches);
    setConnections((prev) => prev.map((c) => (matches(c) ? { ...c, isActive: newActive } : c)));
    await Promise.allSettled(
      providerConns.map((c) =>
        fetch(`/api/providers/${c.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newActive }),
        }),
      ),
    );
  };

  const compatibleProviders = providerNodes
    .filter((node) => node.type === "openai-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "OpenAI Compatible",
      color: "#10A37F",
      textIcon: "OC",
      apiType: node.apiType,
      iconId: guessProviderIconIdFromUrl(node.baseUrl),
    }))
    .filter((p) => matchStatus(getProviderStats(p.id, "apikey")));

  const anthropicCompatibleProviders = providerNodes
    .filter((node) => node.type === "anthropic-compatible")
    .map((node) => ({
      id: node.id,
      name: node.name || "Anthropic Compatible",
      color: "#D97757",
      textIcon: "AC",
      iconId: guessProviderIconIdFromUrl(node.baseUrl),
    }))
    .filter((p) => matchStatus(getProviderStats(p.id, "apikey")));

  // Dual-auth providers (oauth + apikey) store API keys as authType "apikey"
  // (and sometimes "api_key"). Card stats must count both so totals match detail.
  const dualAuthTypes = (info, key) => {
    const modes = info?.authModes;
    // Free-tier and API-key providers default to supporting apikey even when the
    // registry entry omits authModes (e.g. byteplus, ollama)
    // — otherwise their apikey connections are invisible on the grid card.
    if (!Array.isArray(modes)) {
      return key in FREE_TIER_PROVIDERS || key in APIKEY_PROVIDERS
        ? ["oauth", "apikey", "api_key"]
        : "oauth";
    }
    if (!modes.includes("apikey")) return "oauth";
    return ["oauth", "apikey", "api_key"];
  };

  const oauthEntries = sortByPriority(
    Object.entries(OAUTH_PROVIDERS).filter(
      ([key, info]) =>
        !info.hidden && matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    ),
    "oauth",
  );
  const freeEntries = Object.entries(FREE_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden && matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([, a], [, b]) => (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0));
  // Free Tier cards may be oauth-only (e.g. kimchi) or dual-auth, so count via
  // dualAuthTypes per provider instead of a fixed "apikey" — otherwise oauth
  // connections are invisible here (mismatch with the detail page).
  const freeTierEntries = Object.entries(FREE_TIER_PROVIDERS)
    .filter(
      ([key, info]) =>
        !info.hidden &&
        (info.serviceKinds ?? ["llm"]).includes("llm") &&
        matchStatus(getProviderStats(key, dualAuthTypes(info, key)), info.noAuth),
    )
    .sort(([ka, a], [kb, b]) => {
      const pa = a.priority ?? 999;
      const pb = b.priority ?? 999;
      if (pa !== pb) return pa - pb;
      const noAuthDiff = (b.noAuth ? 1 : 0) - (a.noAuth ? 1 : 0);
      if (noAuthDiff !== 0) return noAuthDiff;
      const ca = getProviderStats(ka, dualAuthTypes(a, ka)).connected > 0 ? 0 : 1;
      const cb = getProviderStats(kb, dualAuthTypes(b, kb)).connected > 0 ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.name || "").localeCompare(b.name || "");
    });

  if (loading) {
    return (
      <Page>
        <CardGrid>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </CardGrid>
      </Page>
    );
  }

  const hasAnyResult =
    oauthEntries.length > 0 ||
    freeEntries.length > 0 ||
    freeTierEntries.length > 0 ||
    compatibleProviders.length > 0 ||
    anthropicCompatibleProviders.length > 0;

  return (
    <>
      <Page>
        <div className="flex items-center justify-end">
          <StockSelect value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger
              size="sm"
              className="w-45"
              aria-label="Filter providers by connection status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </StockSelect>
        </div>

        {!hasAnyResult && (
          <div className="text-center py-8 border border-dashed border-border rounded-xl">
            <Icon name="search_off" className="text-[32px] text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">No providers match your filters</p>
          </div>
        )}

        {/* Custom Providers (OpenAI/Anthropic Compatible) — dynamic */}
        <Section
          title="Custom Providers (OpenAI/Anthropic Compatible)"
          actions={
            <>
              <Button
                size="sm"
                onClick={() => setShowAddAnthropicCompatibleModal(true)}
                className="w-full sm:w-auto"
              >
                <Icon name="add" />
                Add Anthropic Compatible
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAddCompatibleModal(true)}
                className="w-full sm:w-auto"
              >
                <Icon name="add" />
                Add OpenAI Compatible
              </Button>
            </>
          }
        >
          {compatibleProviders.length === 0 && anthropicCompatibleProviders.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-2 border border-dashed border-border rounded-xl text-muted-foreground text-sm">
              <Icon name="extension" className="text-[18px]" />
              <span>
                No custom providers — use buttons above to add OpenAI/Anthropic compatible endpoints
              </span>
            </div>
          ) : (
            <CardGrid>
              {[...compatibleProviders, ...anthropicCompatibleProviders].map((info) => (
                <ApiKeyProviderCard
                  key={info.id}
                  providerId={info.id}
                  provider={info}
                  stats={getProviderStats(info.id, "apikey")}
                  authType="compatible"
                  onToggle={(active) => handleToggleProvider(info.id, "apikey", active)}
                />
              ))}
            </CardGrid>
          )}
        </Section>

        {/* OAuth Providers */}
        {oauthEntries.length > 0 && (
          <Section title="OAuth Providers" actions={<ModelAvailabilityBadge />}>
            <CardGrid>
              {oauthEntries.map(([key, info]) => {
                const authTypes = dualAuthTypes(info, key);
                return (
                  <ProviderCard
                    key={key}
                    providerId={key}
                    provider={info}
                    stats={getProviderStats(key, authTypes)}
                    authType="oauth"
                    onToggle={(active) => handleToggleProvider(key, authTypes, active)}
                  />
                );
              })}
            </CardGrid>
          </Section>
        )}

        {/* Free Tier Providers */}
        {(freeEntries.length > 0 || freeTierEntries.length > 0) && (
          <Section title="Free Tier Providers">
            <CardGrid>
              {freeEntries.map(([key, info]) => {
                // Dual-auth: count/toggle oauth + apikey/api_key so the
                // card total matches the provider detail page.
                const freeAuthTypes = dualAuthTypes(info, key);
                return (
                  <ProviderCard
                    key={key}
                    providerId={key}
                    provider={info}
                    stats={getProviderStats(key, freeAuthTypes)}
                    authType="free"
                    onToggle={(active) => handleToggleProvider(key, freeAuthTypes, active)}
                  />
                );
              })}
              {freeTierEntries.map(([key, info]) => {
                const freeAuthTypes = dualAuthTypes(info, key);
                return (
                  <ApiKeyProviderCard
                    key={key}
                    providerId={key}
                    provider={info}
                    stats={getProviderStats(key, freeAuthTypes)}
                    authType={
                      Array.isArray(freeAuthTypes) ? (freeAuthTypes[0] ?? "apikey") : freeAuthTypes
                    }
                    onToggle={(active) => handleToggleProvider(key, freeAuthTypes, active)}
                  />
                );
              })}
            </CardGrid>
          </Section>
        )}

        {/* Web Cookie Providers — use browser subscription cookie instead of API key */}
        {/* <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            Web Cookie Providers{" "}
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Object.entries(WEB_COOKIE_PROVIDERS).map(([key, info]) => (
            <ApiKeyProviderCard
              key={key}
              providerId={key}
              provider={info}
              stats={getProviderStats(key, "apikey")}
              authType="apikey"
              onToggle={(active) => handleToggleProvider(key, "apikey", active)}
            />
          ))}
        </div>
      </div> */}
      </Page>
      <AddCompatibleModal
        variant="openai"
        isOpen={showAddCompatibleModal}
        onClose={() => setShowAddCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddCompatibleModal(false);
        }}
      />
      <AddCompatibleModal
        variant="anthropic"
        isOpen={showAddAnthropicCompatibleModal}
        onClose={() => setShowAddAnthropicCompatibleModal(false)}
        onCreated={(node) => {
          setProviderNodes((prev) => [...prev, node]);
          setShowAddAnthropicCompatibleModal(false);
        }}
      />
    </>
  );
}

function providerIconBg(color?: string) {
  if (!color) return undefined;
  return color.length > 7 ? color : `${color}15`;
}

function DisabledBadge() {
  return (
    <Badge variant="default">
      <span className="flex items-center gap-1">
        <Icon name="pause_circle" className="text-[12px]" />
        Disabled
      </span>
    </Badge>
  );
}

function ProviderCard({ providerId, provider, stats, authType, onToggle }: any) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isNoAuth = !!provider.noAuth;

  return (
    <EntityCard
      href={`/dashboard/providers/${providerId}`}
      title={provider.name}
      iconBg={providerIconBg(provider.color)}
      dimmed={allDisabled}
      icon={
        <ProviderIcon
          src={`/providers/${provider.id}.png`}
          alt={provider.name}
          size={30}
          className="max-h-[30px] max-w-[30px] rounded-lg object-contain"
          fallbackText={provider.textIcon || provider.id.slice(0, 2).toUpperCase()}
          fallbackColor={provider.color}
        />
      }
      meta={errorTime && !allDisabled && !isNoAuth ? errorTime : undefined}
      toggle={
        stats.total > 0
          ? {
              checked: !allDisabled,
              enabledLabel: "Enable provider",
              disabledLabel: "Disable provider",
              onToggle: (active: boolean) => onToggle(active),
            }
          : undefined
      }
    >
      {allDisabled ? (
        <DisabledBadge />
      ) : isNoAuth ? (
        <Badge variant="default">
          <span className="size-1.5 rounded-full bg-green-500" />
          Ready
        </Badge>
      ) : (
        getStatusDisplay(connected, error, errorCode)
      )}
    </EntityCard>
  );
}

function ApiKeyProviderCard({ providerId, provider, stats, authType, onToggle }: any) {
  const { connected, error, errorCode, errorTime, allDisabled } = stats;
  const isCompatible = providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
  const isAnthropicCompatible = providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);

  // Brand icon when the baseUrl host maps to a known /providers logo
  // (e.g. api.deepseek.com → deepseek.png); otherwise the API family logo
  // (OpenAI-compatible → openai.png, Anthropic-compatible → anthropic.png);
  // otherwise a letter avatar from the node name.
  const getIconPath = () => {
    if (provider.iconId) {
      const src = getProviderIconSrc(provider.iconId);
      if (src) return src;
    }
    if (isCompatible) return "/providers/openai.png";
    if (isAnthropicCompatible) return "/providers/anthropic.png";
    return getProviderIconSrc(provider.id);
  };

  const familyBadge = isCompatible ? (
    <Badge variant="default">{provider.apiType === "responses" ? "Responses" : "Chat"}</Badge>
  ) : isAnthropicCompatible ? (
    <Badge variant="default">Messages</Badge>
  ) : null;

  return (
    <EntityCard
      href={`/dashboard/providers/${providerId}`}
      title={provider.name}
      iconBg={providerIconBg(provider.color)}
      dimmed={allDisabled}
      icon={
        <ProviderIcon
          src={getIconPath()}
          alt={provider.name}
          size={30}
          className="max-h-[30px] max-w-[30px] rounded-lg object-contain"
          fallbackText={
            getInitials(provider.name) || provider.textIcon || provider.id.slice(0, 2).toUpperCase()
          }
          fallbackColor={provider.color}
        />
      }
      meta={errorTime && !allDisabled ? errorTime : undefined}
      toggle={
        stats.total > 0
          ? {
              checked: !allDisabled,
              enabledLabel: "Enable provider",
              disabledLabel: "Disable provider",
              onToggle: (active: boolean) => onToggle(active),
            }
          : undefined
      }
    >
      {allDisabled ? (
        <DisabledBadge />
      ) : (
        <>
          {getStatusDisplay(connected, error, errorCode)}
          {familyBadge}
        </>
      )}
    </EntityCard>
  );
}
