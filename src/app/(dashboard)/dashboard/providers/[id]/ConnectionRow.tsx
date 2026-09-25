"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useRef } from "react";
import { getStatusVariant as getConnectionStatusVariant } from "@/shared/utils/connectionStatus";
import { Badge } from "@/components/ui/badge";
import CooldownTimer from "./CooldownTimer";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

function mapLegacyVariant(
  v: string,
): "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" {
  if (v === "success" || v === "primary") return "default";
  if (v === "error") return "destructive";
  if (v === "warning" || v === "info") return "secondary";
  if (v === "destructive" || v === "secondary" || v === "outline" || v === "ghost" || v === "link")
    return v;
  return "default";
}

function StatusDot({ variant }: { variant: string }) {
  const color =
    variant === "success" || variant === "primary"
      ? "bg-green-500"
      : variant === "error"
        ? "bg-red-500"
        : "bg-gray-500";
  return <span className={`size-1.5 rounded-full ${color}`} />;
}

export default function ConnectionRow({
  connection,
  proxyPools,
  isOAuth,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onToggleActive,
  onUpdateProxy,
  onEdit,
  onDelete,
  oneByOneStatus = null,
  autoPing = null,
}: any) {
  const [showProxyDropdown, setShowProxyDropdown] = useState<boolean>(false);
  const [updatingProxy, setUpdatingProxy] = useState<boolean>(false);
  const proxyDropdownRef = useRef<any>(null);

  const proxyPoolMap: Map<any, any> = new Map(
    (proxyPools || []).map((pool: any) => [pool.id, pool]),
  );
  const boundProxyPoolId = connection.providerSpecificData?.proxyPoolId || null;
  const boundProxyPool = boundProxyPoolId ? proxyPoolMap.get(boundProxyPoolId) : null;
  const hasLegacyProxy =
    connection.providerSpecificData?.connectionProxyEnabled === true &&
    !!connection.providerSpecificData?.connectionProxyUrl;
  const hasAnyProxy = !!boundProxyPoolId || hasLegacyProxy;
  const proxyDisplayText = boundProxyPool
    ? `Pool: ${boundProxyPool.name}`
    : boundProxyPoolId
      ? `Pool: ${boundProxyPoolId} (inactive/missing)`
      : hasLegacyProxy
        ? `Legacy: ${connection.providerSpecificData?.connectionProxyUrl}`
        : "";
  const autoPingTooltip =
    autoPing?.provider === "codex"
      ? "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota."
      : "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.";

  let maskedProxyUrl = "";
  if (boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl) {
    const rawProxyUrl =
      boundProxyPool?.proxyUrl || connection.providerSpecificData?.connectionProxyUrl;
    try {
      const parsed = new URL(rawProxyUrl);
      maskedProxyUrl = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    } catch {
      maskedProxyUrl = rawProxyUrl;
    }
  }

  const noProxyText =
    boundProxyPool?.noProxy || connection.providerSpecificData?.connectionNoProxy || "";

  let proxyBadgeVariant: "default" | "success" | "error" = "default";
  if (boundProxyPool?.isActive === true) {
    proxyBadgeVariant = "success";
  } else if (boundProxyPoolId || hasLegacyProxy) {
    proxyBadgeVariant = "error";
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showProxyDropdown) return;
    const handler = (e: any) => {
      if (proxyDropdownRef.current && !proxyDropdownRef.current.contains(e.target)) {
        setShowProxyDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showProxyDropdown]);

  const handleSelectProxy = async (poolId) => {
    setUpdatingProxy(true);
    try {
      await onUpdateProxy(poolId === "__none__" ? null : poolId);
    } finally {
      setUpdatingProxy(false);
      setShowProxyDropdown(false);
    }
  };

  const rowAuthType = connection.authType || (isOAuth ? "oauth" : "apikey");
  const isOAuthConnection = rowAuthType === "oauth";
  const isCookieConnection = rowAuthType === "cookie";
  const authIcon = isCookieConnection ? "cookie" : isOAuthConnection ? "lock" : "key";
  const authLabel = isOAuthConnection ? "OAuth" : isCookieConnection ? "Cookie" : "API Key";
  const displayName =
    connection.name?.trim() ||
    connection.email?.trim() ||
    connection.displayName?.trim() ||
    (isOAuthConnection ? "OAuth Account" : isCookieConnection ? "Cookie Account" : "API Key");
  const secondaryDisplayName =
    connection.name?.trim() &&
    connection.email?.trim() &&
    connection.name.trim() !== connection.email.trim()
      ? connection.email.trim()
      : connection.name?.trim() &&
          connection.displayName?.trim() &&
          connection.name.trim() !== connection.displayName.trim()
        ? connection.displayName.trim()
        : null;

  // Use useState + useEffect for impure Date.now() to avoid calling during render
  const [isCooldown, setIsCooldown] = useState<boolean>(false);

  // Get earliest model lock timestamp (useEffect handles the Date.now() comparison)
  const modelLockUntil =
    Object.entries(connection)
      .filter(([k]: [string, any]) => k.startsWith("modelLock_"))
      .map(([, v]: [string, any]) => v)
      .filter((v) => !!v)
      .sort()[0] || null;

  useEffect(() => {
    const checkCooldown = () => {
      const until =
        Object.entries(connection)
          .filter(([k]: [string, any]) => k.startsWith("modelLock_"))
          .map(([, v]: [string, any]) => v)
          .filter((v) => v && new Date(v).getTime() > Date.now())
          .sort()[0] || null;
      setIsCooldown(!!until);
    };

    checkCooldown();
    const interval = modelLockUntil ? setInterval(checkCooldown, 1000) : null;
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [modelLockUntil]);

  // Determine effective status (override unavailable if cooldown expired)
  const effectiveStatus =
    connection.testStatus === "unavailable" && !isCooldown
      ? "active" // Cooldown expired → treat as active
      : connection.testStatus;

  const getStatusVariant = () => getConnectionStatusVariant(connection.isActive, effectiveStatus);

  const getOneByOneVariant = () => {
    if (!oneByOneStatus) return "default";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed") return "error";
    if (oneByOneStatus.state === "testing") return "primary";
    return "default";
  };

  const getOneByOneLabel = () => {
    if (!oneByOneStatus) return null;
    if (oneByOneStatus.state === "queued") return "queued";
    if (oneByOneStatus.state === "testing") return "testing";
    if (oneByOneStatus.state === "success") return "success";
    if (oneByOneStatus.state === "failed")
      return oneByOneStatus.error ? `failed: ${oneByOneStatus.error}` : "failed";
    return null;
  };

  return (
    <div
      className={`group flex min-w-0 flex-col gap-3 rounded-lg p-2 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between ${connection.isActive === false ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
        {/* Priority arrows */}
        <div className="flex shrink-0 flex-col">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className={`p-0.5 rounded ${isFirst ? "text-muted-foreground/30 cursor-not-allowed" : "hover:bg-sidebar text-muted-foreground hover:text-primary"}`}
          >
            <Icon name="keyboard_arrow_up" className="text-sm" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className={`p-0.5 rounded ${isLast ? "text-muted-foreground/30 cursor-not-allowed" : "hover:bg-sidebar text-muted-foreground hover:text-primary"}`}
          >
            <Icon name="keyboard_arrow_down" className="text-sm" />
          </button>
        </div>
        <Icon name={authIcon} className="shrink-0 text-base text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{displayName}</p>
          {secondaryDisplayName && (
            <p className="text-xs text-muted-foreground truncate">{secondaryDisplayName}</p>
          )}
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge variant={mapLegacyVariant(getStatusVariant())}>
              <StatusDot variant={getStatusVariant()} />
              {connection.isActive === false ? "disabled" : effectiveStatus || "Unknown"}
            </Badge>
            <Badge variant="default">{authLabel}</Badge>
            {hasAnyProxy && <Badge variant={mapLegacyVariant(proxyBadgeVariant)}>Proxy</Badge>}
            {isCooldown && connection.isActive !== false && (
              <CooldownTimer until={modelLockUntil} />
            )}
            {connection.lastError && connection.isActive !== false && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-full truncate text-xs text-red-500 sm:max-w-[300px]">
                    {connection.lastError}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{connection.lastError}</TooltipContent>
              </Tooltip>
            )}
            <span className="text-xs text-muted-foreground">#{connection.priority}</span>
            {connection.globalPriority && (
              <span className="text-xs text-muted-foreground">
                Auto: {connection.globalPriority}
              </span>
            )}
            {getOneByOneLabel() && (
              <Badge variant={mapLegacyVariant(getOneByOneVariant())}>{getOneByOneLabel()}</Badge>
            )}
          </div>
          {hasAnyProxy && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-full truncate text-[11px] text-muted-foreground sm:max-w-[420px]">
                    {proxyDisplayText}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{proxyDisplayText}</TooltipContent>
              </Tooltip>
              {maskedProxyUrl && (
                <code className="max-w-full truncate rounded bg-black/5 px-1 py-0.5 font-mono text-[10px] text-muted-foreground dark:bg-white/5 sm:max-w-[260px]">
                  {maskedProxyUrl}
                </code>
              )}
              {noProxyText && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="max-w-full truncate text-[11px] text-muted-foreground sm:max-w-[320px]">
                      no_proxy: {noProxyText}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{noProxyText}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="grid flex-1 grid-cols-3 gap-1 sm:flex sm:flex-none">
          {/* Proxy button with inline dropdown */}
          {(proxyPools || []).length > 0 && (
            <div className="relative" ref={proxyDropdownRef}>
              <button
                onClick={() => setShowProxyDropdown((v) => !v)}
                className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${hasAnyProxy ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                disabled={updatingProxy}
              >
                <Icon name={updatingProxy ? "progress_activity" : "lan"} className="text-[18px]" />
                <span className="text-[10px] leading-tight">Proxy</span>
              </button>
              {showProxyDropdown && (
                <div className="absolute right-0 top-full z-50 mt-1 max-w-[78vw] min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg">
                  <button
                    onClick={() => handleSelectProxy("__none__")}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${!boundProxyPoolId ? "text-primary font-medium" : "text-foreground"}`}
                  >
                    None
                  </button>
                  {(proxyPools || []).map((pool) => (
                    <button
                      key={pool.id}
                      onClick={() => handleSelectProxy(pool.id)}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 ${boundProxyPoolId === pool.id ? "text-primary font-medium" : "text-foreground"}`}
                    >
                      {pool.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {autoPing && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative inline-flex">
                  <button
                    onClick={() => autoPing.onToggle(!autoPing.on)}
                    className={`flex w-full flex-col items-center rounded px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${autoPing.on ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                  >
                    <Icon name="bolt" className="text-[18px]" />
                    <span className="text-[10px] leading-tight">Auto-ping</span>
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{autoPingTooltip}</TooltipContent>
            </Tooltip>
          )}
          <button
            onClick={onEdit}
            className="flex flex-col items-center rounded px-2 py-1 text-muted-foreground hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
          >
            <Icon name="edit" className="text-[18px]" />
            <span className="text-[10px] leading-tight">Edit</span>
          </button>
          <button
            onClick={onDelete}
            className="flex flex-col items-center rounded px-2 py-1 text-red-500 hover:bg-red-500/10"
          >
            <Icon name="delete" className="text-[18px]" />
            <span className="text-[10px] leading-tight">Delete</span>
          </button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Switch
              size="sm"
              checked={connection.isActive ?? true}
              onCheckedChange={onToggleActive}
              aria-label={
                (connection.isActive ?? true) ? "Disable connection" : "Enable connection"
              }
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            {(connection.isActive ?? true) ? "Disable connection" : "Enable connection"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
