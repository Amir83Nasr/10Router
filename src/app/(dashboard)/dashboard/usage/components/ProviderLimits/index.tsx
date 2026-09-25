"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ProviderIcon from "@/shared/components/ProviderIcon";
import QuotaTable from "./QuotaTable";
import { Switch } from "@/components/ui/switch";
import { Tooltip as ShadcnTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  parseQuotaData,
  calculatePercentage,
  filterQuotasByVisibility,
  getHiddenQuotaRows,
  getQuotaVisibilityKey,
  getConnectionLabel,
  getConnectionQuotaRemaining,
  sortVisibleConnections,
  buildLoadingState,
  filterQuotaStateByConnections,
  getConnectionsEmptyMessage,
  getPageSizeLabel,
  getConnectionsPaginationSummary,
  getSafePagination,
  getSafeTotals,
  shouldResetPage,
  getPaginationPageValue,
  getProviderOptions,
  reconcileConnectionsPage,
  getQuotaCache,
  setQuotaCache,
  QUOTA_CACHE_KEY,
  REFRESH_INTERVAL_MS,
  CLAUDE_REFRESH_INTERVAL_MS,
  DEPLETED_QUOTA_THRESHOLD,
  AUTO_REFRESH_STORAGE_KEY,
  CONNECTIONS_PAGE_SIZE,
  ACCOUNT_PAGE_SIZE_OPTIONS,
  ACCOUNT_PAGE_SIZE_MAX,
  ACCOUNT_FILTER_OPTIONS,
  QUOTA_SORT_OPTIONS,
} from "./utils";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmModal, EditConnectionModal } from "@/shared/components";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { USAGE_SUPPORTED_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";

const AUTO_PING_SETTINGS_KEYS = {
  claude: "claudeAutoPing",
  codex: "codexAutoPing",
};

const AUTO_PING_TOOLTIPS = {
  claude:
    "When your 5h quota runs out, auto-sends a request the moment it resets so a new window starts right away.",
  codex:
    "Auto-starts the next 5h Codex window after reset by sending a tiny gpt-5.5 request. Consumes a small amount of quota.",
};

function getConnectionSecondaryLabel(connection) {
  if (
    connection.name?.trim() &&
    connection.email?.trim() &&
    connection.name.trim() !== connection.email.trim()
  ) {
    return connection.email.trim();
  }

  if (
    connection.name?.trim() &&
    connection.displayName?.trim() &&
    connection.name.trim() !== connection.displayName.trim()
  ) {
    return connection.displayName.trim();
  }

  return null;
}

function getCodexResetCreditCount(quota) {
  const value = quota?.raw?.resetCredits?.availableCount;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function providerLabel(providerId) {
  return AI_PROVIDERS[providerId]?.name || providerId;
}

function formatCreditDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRemaining(value) {
  if (!value) return "N/A";
  const diffMs = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return "N/A";
  if (diffMs <= 0) return "Expired";
  const totalHours = Math.ceil(diffMs / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

export default function ProviderLimits() {
  const { copied, copy } = useCopyToClipboard();
  const [connections, setConnections] = useState<any[]>([]);
  const [quotaData, setQuotaData] = useState<any>({});
  const [loading, setLoading] = useState<any>({});
  const [errors, setErrors] = useState<any>({});
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [autoPingMaps, setAutoPingMaps] = useState({ claude: {}, codex: {} });
  const [lastUpdated, setLastUpdated] = useState<any>(null);
  const [hasHydratedAutoRefresh, setHasHydratedAutoRefresh] = useState<boolean>(false);
  const [refreshingAll, setRefreshingAll] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(60);
  const [connectionsLoading, setConnectionsLoading] = useState<boolean>(true);
  const [deletingId, setDeletingId] = useState<any>(null);
  const [togglingId, setTogglingId] = useState<any>(null);
  const [resettingLimitId, setResettingLimitId] = useState<any>(null);
  const [resetConfirmState, setResetConfirmState] = useState<any>(null);
  const [resetCreditsState, setResetCreditsState] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [selectedConnection, setSelectedConnection] = useState<any>(null);
  const [proxyPools, setProxyPools] = useState<any[]>([]);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [providerOptions, setProviderOptions] = useState<any[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [quotaSortMode, setQuotaSortMode] = useState<string>("default");
  const [quotaVisibility, setQuotaVisibility] = useState<any>({});
  const [expiringFirst, setExpiringFirst] = useState<boolean>(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState<boolean>(false);
  const [bulkToggling, setBulkToggling] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState(CONNECTIONS_PAGE_SIZE);
  const [customPageSizeInput, setCustomPageSizeInput] = useState(String(CONNECTIONS_PAGE_SIZE));
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: CONNECTIONS_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [totals, setTotals] = useState({
    eligibleConnections: 0,
    providerFilteredConnections: 0,
  });

  const intervalRef = useRef<any>(null);
  const countdownRef = useRef<any>(null);
  const tickCountRef = useRef<number>(0);

  const fetchConnections = useCallback(
    async (targetPage = page) => {
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(pageSize),
          accountStatus: accountFilter,
          sort: "priority",
        });

        if (providerFilter !== "all") {
          params.set("provider", providerFilter);
        }

        const response = await fetch(`/api/providers/client?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch connections");

        const data = await response.json();
        const connectionList = data.connections || [];
        const nextPagination = getSafePagination(data.pagination, pageSize);
        const nextTotals = getSafeTotals(data.totals, connectionList.length);

        setConnections(connectionList);
        setProviderOptions(getProviderOptions(data.providerOptions));
        setPagination(nextPagination);
        setTotals(nextTotals);
        setPage(getPaginationPageValue(data.pagination, targetPage));
        return connectionList;
      } catch (error) {
        console.error("Error fetching connections:", error);
        setConnections([]);
        setProviderOptions([]);
        setPagination({ page: 1, pageSize, total: 0, totalPages: 1 });
        setTotals({ eligibleConnections: 0, providerFilteredConnections: 0 });
        return [];
      }
    },
    [accountFilter, expiringFirst, page, pageSize, providerFilter],
  );

  // Fetch quota for a specific connection
  const fetchQuota = useCallback(async (connectionId, provider, { force = false } = {}) => {
    setLoading((prev) => ({ ...prev, [connectionId]: true }));
    setErrors((prev) => ({ ...prev, [connectionId]: null }));

    try {
      console.log(`[ProviderLimits] Fetching quota for ${provider} (${connectionId})`);
      const url = `/api/usage/${connectionId}${force ? "?force=1" : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.error || response.statusText;

        // Handle different error types gracefully
        if (response.status === 404) {
          // Connection not found - skip silently
          console.warn(`[ProviderLimits] Connection not found for ${provider}, skipping`);
          return;
        }

        if (response.status === 401) {
          // Auth error - show message instead of throwing
          console.warn(`[ProviderLimits] Auth error for ${provider}:`, errorMsg);
          const quotaEntry = {
            quotas: [],
            message: errorMsg,
          };
          setQuotaData((prev) => ({
            ...prev,
            [connectionId]: quotaEntry,
          }));
          setQuotaCache(connectionId, quotaEntry);
          return;
        }

        throw new Error(`HTTP ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      console.log(`[ProviderLimits] Got quota for ${provider}:`, data);

      // Parse quota data using provider-specific parser
      const parsedQuotas = parseQuotaData(provider, data);

      const quotaEntry = {
        quotas: parsedQuotas,
        plan: data.plan || null,
        message: data.message || null,
        raw: data,
      };

      setQuotaData((prev) => ({
        ...prev,
        [connectionId]: quotaEntry,
      }));
      setQuotaCache(connectionId, quotaEntry);
    } catch (error) {
      console.error(
        `[ProviderLimits] Error fetching quota for ${provider} (${connectionId}):`,
        error,
      );
      setErrors((prev) => ({
        ...prev,
        [connectionId]: error.message || "Failed to fetch quota",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [connectionId]: false }));
    }
  }, []);

  // Refresh quota for a specific provider
  const refreshProvider = useCallback(
    async (connectionId, provider) => {
      await fetchQuota(connectionId, provider, { force: true });
      setLastUpdated(new Date());
    },
    [fetchQuota],
  );

  const handleResetCodexLimit = useCallback(
    async (connectionId, provider) => {
      if (provider !== "codex" || resettingLimitId) return;

      setResettingLimitId(connectionId);
      setErrors((prev) => ({ ...prev, [connectionId]: null }));

      try {
        const response = await fetch(`/api/usage/${connectionId}/codex-reset-credits`, {
          method: "POST",
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message || result.error || result.code || "Failed to reset Codex limit",
          );
        }

        await fetchQuota(connectionId, provider);
        setLastUpdated(new Date());
      } catch (error) {
        setErrors((prev) => ({
          ...prev,
          [connectionId]: error.message || "Failed to reset Codex limit",
        }));
      } finally {
        setResettingLimitId(null);
      }
    },
    [fetchQuota, resettingLimitId],
  );

  const handleViewCodexResetCredits = useCallback(async (connection) => {
    setResetCreditsState({ connection, loading: true, error: null, data: null });
    try {
      const response = await fetch(`/api/usage/${connection.id}/codex-reset-credits`, {
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || result.message || "Failed to load Codex reset credits");
      }
      const credits = Array.isArray(result.credits) ? [...result.credits] : [];
      credits.sort((a, b) => {
        const aTime = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
      setResetCreditsState({
        connection,
        loading: false,
        error: null,
        data: { ...result, credits },
      });
    } catch (error) {
      setResetCreditsState({
        connection,
        loading: false,
        error: error.message || "Failed to load Codex reset credits",
        data: null,
      });
    }
  }, []);

  const handleDeleteConnection = useCallback(
    async (id) => {
      if (!confirm("Delete this connection?")) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
        if (res.ok) {
          setQuotaData((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setLoading((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          setErrors((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });

          if (typeof window !== "undefined") {
            try {
              const cache = getQuotaCache();
              if (cache[id]) {
                delete cache[id];
                window.localStorage.setItem(QUOTA_CACHE_KEY, JSON.stringify(cache));
              }
            } catch (e) {
              console.error("Error deleting cache entry:", e);
            }
          }

          await reconcileConnectionsPage(fetchConnections, page);
        }
      } catch (error) {
        console.error("Error deleting connection:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [fetchConnections, page],
  );

  const handleToggleConnectionActive = useCallback(
    async (id, isActive) => {
      setTogglingId(id);
      try {
        const res = await fetch(`/api/providers/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive }),
        });
        if (res.ok) {
          setQuotaData((prev) => {
            const next = { ...prev };
            return next;
          });
          await reconcileConnectionsPage(fetchConnections, page);
        }
      } catch (error) {
        console.error("Error updating connection status:", error);
      } finally {
        setTogglingId(null);
      }
    },
    [fetchConnections, page],
  );

  const handleUpdateConnection = useCallback(
    async (formData) => {
      if (!selectedConnection?.id) return;
      const connectionId = selectedConnection.id;
      const provider = selectedConnection.provider;
      try {
        const res = await fetch(`/api/providers/${connectionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          await fetchConnections();
          setShowEditModal(false);
          setSelectedConnection(null);
          if (USAGE_SUPPORTED_PROVIDERS.includes(provider)) {
            await fetchQuota(connectionId, provider);
          }
        }
      } catch (error) {
        console.error("Error saving connection:", error);
      }
    },
    [selectedConnection, fetchConnections, fetchQuota],
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/proxy-pools?isActive=true", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.proxyPools) {
          setProxyPools(data.proxyPools);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAll = useCallback(
    async (force = false) => {
      if (refreshingAll) return;

      setRefreshingAll(true);
      setCountdown(60);

      // Throttle Claude: poll its quota every Nth auto-tick (manual force bypasses)
      const tick = (tickCountRef.current += 1);
      const claudeEvery = Math.round(CLAUDE_REFRESH_INTERVAL_MS / REFRESH_INTERVAL_MS);
      const shouldFetch = (conn) => force || conn.provider !== "claude" || tick % claudeEvery === 0;

      try {
        const visibleConnections = await fetchConnections(page);

        setLoading(buildLoadingState(visibleConnections));
        setErrors((prev) => filterQuotaStateByConnections(prev, visibleConnections));
        setQuotaData((prev) => filterQuotaStateByConnections(prev, visibleConnections));

        await Promise.all(
          visibleConnections.filter(shouldFetch).map((conn) => fetchQuota(conn.id, conn.provider)),
        );

        setLastUpdated(new Date());
      } catch (error) {
        console.error("Error refreshing all providers:", error);
      } finally {
        setRefreshingAll(false);
      }
    },
    [refreshingAll, fetchConnections, fetchQuota, page],
  );

  useEffect(() => {
    const initializeData = async () => {
      setConnectionsLoading(true);
      const visibleConnections = await fetchConnections(page);
      setConnectionsLoading(false);

      // Always fetch fresh quota on mount, no cache display
      setLoading(buildLoadingState(visibleConnections));
      setErrors((prev) => filterQuotaStateByConnections(prev, visibleConnections));
      setQuotaData((prev) => filterQuotaStateByConnections(prev, visibleConnections));

      await Promise.all(visibleConnections.map((conn) => fetchQuota(conn.id, conn.provider)));
      setLastUpdated(new Date());
    };

    initializeData();
  }, [fetchConnections, fetchQuota, page]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    setAutoRefresh(stored === null ? true : stored === "true");
    setHasHydratedAutoRefresh(true);
  }, []);

  // Persist auto-refresh preference
  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedAutoRefresh) return;
    window.localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
  }, [autoRefresh, hasHydratedAutoRefresh]);

  // Load auto-ping per-connection maps
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((s: any) => {
        setAutoPingMaps({
          claude: s?.claudeAutoPing?.connections || {},
          codex: s?.codexAutoPing?.connections || {},
        });
        setQuotaVisibility(s?.quotaVisibility || {});
      })
      .catch(() => {});
  }, []);

  const toggleAutoPing = useCallback(
    async (connectionId, provider, on) => {
      const settingsKey = AUTO_PING_SETTINGS_KEYS[provider];
      if (!settingsKey) return;

      const previous = autoPingMaps;
      const nextProviderMap = { ...(autoPingMaps[provider] || {}), [connectionId]: on };
      const nextMaps = { ...autoPingMaps, [provider]: nextProviderMap };
      setAutoPingMaps(nextMaps);
      try {
        const r = await fetch("/api/settings", { cache: "no-store" });
        const s = r.ok ? await r.json() : {};
        const cfg = { ...(s[settingsKey] || {}), connections: nextProviderMap };
        await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [settingsKey]: cfg }),
        });
      } catch {
        setAutoPingMaps(previous);
      }
    },
    [autoPingMaps],
  );

  const updateQuotaVisibility = useCallback(async (nextVisibility, previousVisibility) => {
    setQuotaVisibility(nextVisibility);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaVisibility: nextVisibility }),
      });
      if (!response.ok) throw new Error("Failed to update quota visibility");
    } catch (error) {
      console.error("Error updating quota visibility:", error);
      setQuotaVisibility(previousVisibility);
    }
  }, []);

  const handleHideQuota = useCallback(
    (provider, quota) => {
      const key = getQuotaVisibilityKey(quota);
      if (!provider || !key) return;

      const previous = quotaVisibility;
      const providerVisibility = previous[provider] || {};
      const hidden: Set<any> = new Set(providerVisibility.hidden || []);
      hidden.add(key);
      if (provider === "antigravity") {
        if (key === "gemini") {
          for (const k of hidden) {
            if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
          }
        } else if (key === "claude") {
          for (const k of hidden) {
            if (k.startsWith("claude-")) hidden.delete(k);
          }
        }
      }
      const next = {
        ...previous,
        [provider]: {
          ...providerVisibility,
          hidden: [...hidden],
        },
      };
      updateQuotaVisibility(next, previous);
    },
    [quotaVisibility, updateQuotaVisibility],
  );

  const handleShowQuota = useCallback(
    (provider, quota) => {
      const key = getQuotaVisibilityKey(quota);
      if (!provider || !key) return;

      const previous = quotaVisibility;
      const providerVisibility = previous[provider] || {};
      const hidden: Set<any> = new Set(providerVisibility.hidden || []);
      hidden.delete(key);
      if (provider === "antigravity") {
        if (key === "gemini") {
          for (const k of hidden) {
            if (k.startsWith("gemini-") && !k.includes("image")) hidden.delete(k);
          }
        } else if (key === "claude") {
          for (const k of hidden) {
            if (k.startsWith("claude-")) hidden.delete(k);
          }
        }
      }
      const next = {
        ...previous,
        [provider]: {
          ...providerVisibility,
          hidden: [...hidden],
        },
      };
      updateQuotaVisibility(next, previous);
    },
    [quotaVisibility, updateQuotaVisibility],
  );

  // Auto-refresh interval
  useEffect(() => {
    if (!hasHydratedAutoRefresh || !autoRefresh) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    // Main refresh interval
    intervalRef.current = setInterval(() => {
      refreshAll();
    }, REFRESH_INTERVAL_MS);

    // Countdown interval
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return 60;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

  // Pause auto-refresh when tab is hidden (Page Visibility API)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      } else if (autoRefresh && hasHydratedAutoRefresh) {
        // Resume auto-refresh when tab becomes visible
        intervalRef.current = setInterval(() => refreshAll(), REFRESH_INTERVAL_MS);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
        }, 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefresh, refreshAll, hasHydratedAutoRefresh]);

  const sortedConnections = useMemo(
    () =>
      sortVisibleConnections(connections, quotaData, expiringFirst, providerFilter, quotaSortMode),
    [connections, quotaData, expiringFirst, providerFilter, quotaSortMode],
  );

  // Connection is depleted when any quota entry hit the threshold
  const isConnectionDepleted = (conn) => {
    const quotas = quotaData[conn.id]?.quotas;
    if (!quotas?.length) return false;
    return quotas.some((q) => {
      if (!q.total || q.total <= 0) return false;
      return calculatePercentage(q.used, q.total) <= DEPLETED_QUOTA_THRESHOLD;
    });
  };

  const bulkSetActive = useCallback(
    async (targetIds, isActive) => {
      if (!targetIds.length || bulkToggling) return;
      setBulkToggling(true);
      try {
        await Promise.all(
          targetIds.map((id) =>
            fetch(`/api/providers/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive }),
            }),
          ),
        );
        await reconcileConnectionsPage(fetchConnections, page);
      } catch (error) {
        console.error("Error bulk toggling connections:", error);
      } finally {
        setBulkToggling(false);
      }
    },
    [bulkToggling, fetchConnections, page],
  );

  const handleDisableDepleted = () => {
    const ids = sortedConnections
      .filter((c) => (c.isActive ?? true) && isConnectionDepleted(c))
      .map((c) => c.id);
    bulkSetActive(ids, false);
  };

  const handleEnableAvailable = () => {
    const ids = sortedConnections
      .filter((c) => !(c.isActive ?? true) && !isConnectionDepleted(c))
      .map((c) => c.id);
    bulkSetActive(ids, true);
  };

  const selectedProviderLabel =
    providerFilter === "all" ? "All providers" : providerLabel(providerFilter);
  const hasEligibleConnections = totals.eligibleConnections > 0;
  const hasVisibleConnections = sortedConnections.length > 0;
  const emptyState = getConnectionsEmptyMessage(totals, providerFilter, accountFilter);
  const connectionsPageSummary = getConnectionsPaginationSummary(pagination);
  const isCustomPageSize = !ACCOUNT_PAGE_SIZE_OPTIONS.includes(pageSize);
  const pageSizeLabel = getPageSizeLabel(pageSize, isCustomPageSize);

  if (!connectionsLoading && !hasEligibleConnections) {
    return (
      <Card className="p-8">
        <CardContent className="px-0 py-0">
          <div className="text-center py-12">
            <Icon name="cloud_off" className="text-[64px] text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No Providers Connected</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              Connect to providers with OAuth to track your API quota limits and usage.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!connectionsLoading && !hasVisibleConnections) {
    return (
      <Card className="p-8">
        <CardContent className="px-0 py-0">
          <div className="text-center py-12">
            <Icon name={emptyState.icon} className="text-[64px] text-muted-foreground opacity-20" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">{emptyState.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              {emptyState.description}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative">
            <ShadcnTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setProviderMenuOpen((prev) => !prev)}
                  className="flex h-8 items-center justify-between gap-1 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-foreground transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
                  aria-haspopup="menu"
                  aria-expanded={providerMenuOpen}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {providerFilter === "all" ? (
                      <Icon name="apps" className="text-[14px] text-muted-foreground" />
                    ) : (
                      <ProviderIcon
                        src={`/providers/${providerFilter}.png`}
                        alt={providerFilter}
                        size={18}
                        className="size-[18px] rounded object-contain"
                        fallbackText={providerFilter.slice(0, 2).toUpperCase()}
                      />
                    )}
                    <span className="truncate hidden lg:inline">{selectedProviderLabel}</span>
                  </span>
                  <Icon name="expand_more" className="text-[14px] text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Filter quota providers</TooltipContent>
            </ShadcnTooltip>

            {providerMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-30 bg-transparent"
                  aria-label="Close provider filter"
                  onClick={() => setProviderMenuOpen(false)}
                />
                <div className="absolute left-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-black/10 bg-card/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur dark:border-white/10 dark:bg-card/95 sm:w-72">
                  <button
                    type="button"
                    onClick={() => {
                      if (shouldResetPage(providerFilter, "all")) {
                        setPage(1);
                      }
                      setProviderFilter("all");
                      setProviderMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${providerFilter === "all" ? "bg-primary/10 text-primary" : "text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                  >
                    <Icon name="apps" className="text-[22px]" />
                    <span className="font-medium">All providers</span>
                    {providerFilter === "all" && (
                      <Icon name="check" className="ml-auto text-[20px]" />
                    )}
                  </button>
                  <div className="my-1 h-px bg-black/10 dark:bg-white/10" />
                  <div className="max-h-72 overflow-y-auto pr-1">
                    {providerOptions.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => {
                          if (shouldResetPage(providerFilter, provider)) {
                            setPage(1);
                          }
                          setProviderFilter(provider);
                          setProviderMenuOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${providerFilter === provider ? "bg-primary/10 text-primary" : "text-foreground hover:bg-black/5 dark:hover:bg-white/10"}`}
                      >
                        <ProviderIcon
                          src={`/providers/${provider}.png`}
                          alt={provider}
                          size={24}
                          className="size-6 rounded-md object-contain"
                          fallbackText={provider.slice(0, 2).toUpperCase()}
                        />
                        <span className="font-medium">{providerLabel(provider)}</span>
                        {providerFilter === provider && (
                          <Icon name="check" className="ml-auto text-[20px]" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <select
            value={accountFilter}
            onChange={(event: any) => {
              const nextValue = event.target.value;
              if (shouldResetPage(accountFilter, nextValue)) {
                setPage(1);
              }
              setAccountFilter(nextValue);
            }}
            className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-foreground outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
            aria-label="Filter accounts by status"
          >
            {ACCOUNT_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {providerFilter === "codex" && (
            <select
              value={quotaSortMode}
              onChange={(event: any) => setQuotaSortMode(event.target.value)}
              className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-foreground outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
              aria-label="Sort Codex quotas by remaining"
            >
              {QUOTA_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}

          <ShadcnTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExpiringFirst((prev) => !prev)}
                aria-pressed={expiringFirst}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs transition-colors ${expiringFirst ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-black/10 text-foreground hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"}`}
              >
                <Icon name="hourglass_top" className="text-[14px]" />
                <span className="hidden sm:inline">Expiring first</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Sort accounts by earliest quota reset time</TooltipContent>
          </ShadcnTooltip>

          {/* Bulk: disable depleted */}
          <ShadcnTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleDisableDepleted}
                disabled={bulkToggling}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-500/30 px-2 text-xs text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <Icon name="block" className="text-[14px]" />
                <span className="hidden sm:inline">Turn off Empty</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Disable connections with depleted quota on the current page
            </TooltipContent>
          </ShadcnTooltip>

          {/* Bulk: enable available */}
          <ShadcnTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleEnableAvailable}
                disabled={bulkToggling}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-emerald-500/30 px-2 text-xs text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
              >
                <Icon name="check_circle" className="text-[14px]" />
                <span className="hidden sm:inline">Turn on Available</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              Enable connections that still have quota on the current page
            </TooltipContent>
          </ShadcnTooltip>

          {/* Auto-refresh toggle */}
          <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 px-2 text-xs transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5">
            <Switch
              checked={autoRefresh}
              onCheckedChange={() => setAutoRefresh((prev) => !prev)}
              size="sm"
              aria-label={autoRefresh ? "Disable auto-refresh" : "Enable auto-refresh"}
            />
            <span className="hidden text-foreground sm:inline">Auto-refresh</span>
            {autoRefresh && (
              <span className="text-[10px] text-muted-foreground tabular-nums">({countdown}s)</span>
            )}
          </label>

          {/* Refresh all button */}
          <ShadcnTooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => refreshAll(true)}
                disabled={refreshingAll}
                className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-black/10 px-2 text-xs text-foreground transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5 disabled:opacity-50"
              >
                <Icon
                  name="refresh"
                  className={`text-[14px] ${refreshingAll ? "animate-spin" : ""}`}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Refresh all</TooltipContent>
          </ShadcnTooltip>
        </div>
      </div>

      {/* Provider cards: 2 columns, compact */}
      {expiringFirst && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Expiring-first currently reorders accounts inside the current page. Cross-page ordering
          still follows backend pagination.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedConnections.map((conn) => {
          const quota = quotaData[conn.id];
          const isLoading = loading[conn.id];
          const error = errors[conn.id];

          // Use table layout for all providers
          const isInactive = conn.isActive === false;
          const isCodex = conn.provider === "codex";
          const resetCreditCount = getCodexResetCreditCount(quota);
          const isResettingLimit = resettingLimitId === conn.id;
          const rowBusy = deletingId === conn.id || togglingId === conn.id || isResettingLimit;
          const rawQuotas = quota?.quotas || [];
          const visibleQuotas = filterQuotasByVisibility(conn.provider, rawQuotas, quotaVisibility);
          const hiddenQuotaRows = getHiddenQuotaRows(conn.provider, rawQuotas, quotaVisibility);

          return (
            <Card
              key={conn.id}
              className={`min-w-0 [--card-spacing:0] ${isInactive ? "opacity-60" : ""}`}
            >
              <CardContent className="px-0 gap-0">
                <div className="px-3 py-2 border-b border-black/10 dark:border-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 shrink-0 rounded-md flex items-center justify-center overflow-hidden">
                        <ProviderIcon
                          src={`/providers/${conn.provider}.png`}
                          alt={conn.provider}
                          size={32}
                          className="object-contain"
                          fallbackText={conn.provider?.slice(0, 2).toUpperCase() || "PR"}
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">
                          {providerLabel(conn.provider)}
                        </h3>
                        {getConnectionLabel(conn) ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {getConnectionLabel(conn)}
                          </p>
                        ) : null}
                        {getConnectionSecondaryLabel(conn) ? (
                          <p className="text-[11px] text-muted-foreground/80 truncate">
                            {getConnectionSecondaryLabel(conn)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isCodex && (
                        <>
                          <ShadcnTooltip>
                            <TooltipTrigger asChild>
                              <span className="relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setResetConfirmState({ connection: conn, resetCreditCount })
                                  }
                                  disabled={resetCreditCount <= 0 || isLoading || rowBusy}
                                  aria-label={
                                    resetCreditCount > 0
                                      ? `Use one Codex reset credit. ${resetCreditCount} available.`
                                      : "No Codex reset credits available"
                                  }
                                  className={`flex h-8 min-w-10 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60 disabled:cursor-not-allowed disabled:opacity-60 ${
                                    resetCreditCount > 0
                                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                                      : "border-black/10 bg-black/[0.02] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]"
                                  }`}
                                >
                                  <Icon
                                    name={isResettingLimit ? "progress_activity" : "restart_alt"}
                                    className={`text-[15px] ${isResettingLimit ? "animate-spin" : ""}`}
                                  />
                                  <span>{resetCreditCount}</span>
                                </button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {resetCreditCount > 0
                                ? `Use one Codex reset credit. Available: ${resetCreditCount}`
                                : "No Codex reset credits available"}
                            </TooltipContent>
                          </ShadcnTooltip>
                          <ShadcnTooltip>
                            <TooltipTrigger asChild>
                              <span className="relative inline-flex">
                                <button
                                  type="button"
                                  onClick={() => handleViewCodexResetCredits(conn)}
                                  disabled={isLoading || rowBusy}
                                  aria-label="View Codex reset credit expiry"
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-muted-foreground transition-colors hover:bg-black/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
                                >
                                  <Icon name="schedule" className="text-[17px]" />
                                </button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              View Codex reset credit expiry
                            </TooltipContent>
                          </ShadcnTooltip>
                        </>
                      )}
                      {AUTO_PING_SETTINGS_KEYS[conn.provider] && conn.authType === "oauth" && (
                        <ShadcnTooltip>
                          <TooltipTrigger asChild>
                            <span className="relative inline-flex">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleAutoPing(
                                    conn.id,
                                    conn.provider,
                                    !(autoPingMaps[conn.provider]?.[conn.id] === true),
                                  )
                                }
                                aria-label="Toggle auto-ping"
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${autoPingMaps[conn.provider]?.[conn.id] === true ? "text-primary" : "text-muted-foreground"}`}
                              >
                                <Icon name="bolt" className="text-[18px]" />
                              </button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {AUTO_PING_TOOLTIPS[conn.provider]}
                          </TooltipContent>
                        </ShadcnTooltip>
                      )}
                      <ShadcnTooltip>
                        <TooltipTrigger asChild>
                          <span className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => refreshProvider(conn.id, conn.provider)}
                              disabled={isLoading || rowBusy}
                              aria-label="Refresh quota"
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
                            >
                              <Icon
                                name="refresh"
                                className={`text-[18px] text-muted-foreground ${isLoading ? "animate-spin" : ""}`}
                              />
                            </button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Refresh quota</TooltipContent>
                      </ShadcnTooltip>
                      <ShadcnTooltip>
                        <TooltipTrigger asChild>
                          <span className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedConnection(conn);
                                setShowEditModal(true);
                              }}
                              disabled={rowBusy}
                              aria-label="Edit connection"
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            >
                              <Icon name="edit" className="text-[18px]" />
                            </button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Edit connection</TooltipContent>
                      </ShadcnTooltip>
                      <ShadcnTooltip>
                        <TooltipTrigger asChild>
                          <span className="relative inline-flex">
                            <button
                              type="button"
                              onClick={() => handleDeleteConnection(conn.id)}
                              disabled={rowBusy}
                              aria-label="Delete connection"
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-50"
                            >
                              <Icon
                                name="delete"
                                className={`text-[18px] ${deletingId === conn.id ? "animate-pulse" : ""}`}
                              />
                            </button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Delete connection</TooltipContent>
                      </ShadcnTooltip>
                      <div className="inline-flex items-center pl-0.5">
                        <ShadcnTooltip>
                          <TooltipTrigger asChild>
                            <Switch
                              size="sm"
                              checked={conn.isActive ?? true}
                              disabled={rowBusy}
                              onCheckedChange={(nextActive) =>
                                handleToggleConnectionActive(conn.id, nextActive)
                              }
                              aria-label={
                                (conn.isActive ?? true) ? "Disable connection" : "Enable connection"
                              }
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {(conn.isActive ?? true) ? "Disable connection" : "Enable connection"}
                          </TooltipContent>
                        </ShadcnTooltip>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-2 py-1.5">
                  {isLoading ? (
                    <div className="text-center py-5 text-muted-foreground">
                      <Icon name="progress_activity" className="text-[28px] animate-spin" />
                    </div>
                  ) : error ? (
                    <div className="text-center py-5">
                      <Icon name="error" className="text-[28px] text-red-500" />
                      <p className="mt-1.5 text-xs text-muted-foreground">{error}</p>
                    </div>
                  ) : quota?.message ? (
                    <div className="text-center py-5">
                      <p className="text-xs text-muted-foreground">{quota.message}</p>
                    </div>
                  ) : (
                    <QuotaTable
                      quotas={visibleQuotas}
                      compact
                      sortMode="default"
                      showSortLabel={conn.provider === "codex" && quotaSortMode !== "default"}
                      onHideQuota={(quotaRow) => handleHideQuota(conn.provider, quotaRow)}
                    />
                  )}
                  {quota?.message && !error && !isLoading && (
                    <p className="mt-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
                      {quota.message}
                    </p>
                  )}
                  {hiddenQuotaRows.length > 0 && (
                    <div className="mt-2 flex min-w-0 items-center gap-1 border-t border-black/5 pt-2 text-[10px] text-muted-foreground dark:border-white/5">
                      <Icon name="visibility_off" className="shrink-0 text-[14px]" />
                      <span className="shrink-0">Hidden:</span>
                      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap pb-2">
                        {hiddenQuotaRows.map((quotaRow) => (
                          <ShadcnTooltip key={getQuotaVisibilityKey(quotaRow)}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => handleShowQuota(conn.provider, quotaRow)}
                                className="shrink-0 rounded-md border border-black/10 px-1.5 py-0.5 transition-colors hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/5"
                              >
                                {quotaRow.name}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Show this quota row</TooltipContent>
                          </ShadcnTooltip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{connectionsPageSummary}</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={isCustomPageSize ? "custom" : String(pageSize)}
              onChange={(event: any) => {
                const nextValue = event.target.value;
                if (nextValue === "custom") return;
                const nextPageSize = Number.parseInt(nextValue, 10);
                if (Number.isFinite(nextPageSize)) {
                  setPage(1);
                  setPageSize(nextPageSize);
                  setCustomPageSizeInput(String(nextPageSize));
                }
              }}
              className="h-8 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-foreground outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
              aria-label="Accounts per page"
            >
              {ACCOUNT_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {option} / page
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            <input
              type="number"
              min="1"
              max={String(ACCOUNT_PAGE_SIZE_MAX)}
              inputMode="numeric"
              value={customPageSizeInput}
              onChange={(event: any) => setCustomPageSizeInput(event.target.value)}
              onBlur={() => {
                const parsedValue = Number.parseInt(customPageSizeInput, 10);
                if (!Number.isFinite(parsedValue)) {
                  setCustomPageSizeInput(String(pageSize));
                  return;
                }
                const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
                setPage(1);
                setPageSize(nextPageSize);
                setCustomPageSizeInput(String(nextPageSize));
              }}
              onKeyDown={(event: any) => {
                if (event.key !== "Enter") return;
                const parsedValue = Number.parseInt(customPageSizeInput, 10);
                if (!Number.isFinite(parsedValue)) {
                  setCustomPageSizeInput(String(pageSize));
                  return;
                }
                const nextPageSize = Math.min(ACCOUNT_PAGE_SIZE_MAX, Math.max(1, parsedValue));
                setPage(1);
                setPageSize(nextPageSize);
                setCustomPageSizeInput(String(nextPageSize));
              }}
              className="h-8 w-20 rounded-lg border border-black/10 bg-black/[0.02] px-2 text-xs text-foreground outline-none transition-colors hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10"
              aria-label="Custom accounts per page"
              placeholder="Custom"
            />
            <span className="text-xs text-muted-foreground">
              Page {pagination.page} / {pagination.totalPages}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={pagination.page <= 1 || connectionsLoading || refreshingAll}
              className="flex h-8 items-center rounded-lg border border-black/10 px-3 text-xs text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
            >
              First Page
            </button>
            <button
              type="button"
              onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              disabled={pagination.page <= 1 || connectionsLoading || refreshingAll}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              aria-label="Previous accounts page"
            >
              <Icon name="chevron_left" className="text-[16px]" />
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((currentPage) => Math.min(pagination.totalPages, currentPage + 1))
              }
              disabled={
                pagination.page >= pagination.totalPages || connectionsLoading || refreshingAll
              }
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
              aria-label="Next accounts page"
            >
              <Icon name="chevron_right" className="text-[16px]" />
            </button>
            <button
              type="button"
              onClick={() => setPage(pagination.totalPages)}
              disabled={
                pagination.page >= pagination.totalPages || connectionsLoading || refreshingAll
              }
              className="flex h-8 items-center rounded-lg border border-black/10 px-3 text-xs text-foreground transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:hover:bg-white/5"
            >
              Last Page
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={Boolean(resetConfirmState)}
        onClose={() => {
          if (!resettingLimitId) setResetConfirmState(null);
        }}
        onConfirm={async () => {
          const connection = resetConfirmState?.connection;
          if (!connection) return;
          await handleResetCodexLimit(connection.id, connection.provider);
          setResetConfirmState(null);
        }}
        title="Reset Codex limit?"
        message={`Use 1 Codex reset credit for ${getConnectionLabel(resetConfirmState?.connection || {}) || "this account"}. This cannot be undone. Remaining credits: ${resetConfirmState?.resetCreditCount ?? 0}.`}
        confirmText="Reset limit"
        cancelText="Cancel"
        variant="danger"
        loading={Boolean(resettingLimitId)}
      />

      {resetCreditsState && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setResetCreditsState(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Codex Reset Credit Expiry</DialogTitle>
              <p className="truncate text-xs text-muted-foreground">
                {getConnectionLabel(resetCreditsState.connection) || "Codex account"}
              </p>
            </DialogHeader>

            <div className="max-h-[70vh] overflow-auto p-4">
              {resetCreditsState.loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Icon name="progress_activity" className="animate-spin text-[20px]" />
                  Loading reset credits...
                </div>
              ) : resetCreditsState.error ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                  {resetCreditsState.error}
                </div>
              ) : resetCreditsState.data?.credits?.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                    <span>
                      {resetCreditsState.data.credits.length} reset credit
                      {resetCreditsState.data.credits.length === 1 ? "" : "s"}
                    </span>
                    <span>{resetCreditsState.data.availableCount ?? 0} available</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-black/[0.03] text-xs uppercase tracking-wide text-muted-foreground dark:bg-white/[0.04]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Granted At</th>
                          <th className="px-3 py-2 font-medium">Expires At</th>
                          <th className="px-3 py-2 font-medium">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resetCreditsState.data.credits.map((credit, index) => (
                          <tr
                            key={`${credit.status}-${credit.expiresAt || index}`}
                            className="border-t border-black/5 dark:border-white/5"
                          >
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {credit.status || "unknown"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatCreditDate(credit.grantedAt)}
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {formatCreditDate(credit.expiresAt)}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground">
                              {formatTimeRemaining(credit.expiresAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-8 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
                  No reset credit details returned for this account.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <EditConnectionModal
        isOpen={showEditModal}
        connection={selectedConnection}
        proxyPools={proxyPools}
        onSave={handleUpdateConnection}
        onClose={() => {
          setShowEditModal(false);
          setSelectedConnection(null);
        }}
      />
    </div>
  );
}
