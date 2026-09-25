"use client";
import Icon from "@/shared/components/Icon";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FREE_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";

// Keep providers without serviceKinds (default LLM) or with "llm" in serviceKinds
function isLLMProvider(id) {
  const p = AI_PROVIDERS[id];
  if (!p?.serviceKinds) return true;
  return p.serviceKinds.includes("llm");
}
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SegmentedControl from "./SegmentedControl";
import { CardGrid } from "./layouts/Page";
import { StatCardSkeleton, PanelSkeleton } from "./EntityCardSkeleton";
import OverviewCards from "@/app/(dashboard)/dashboard/usage/components/OverviewCards";
import UsageTable, { fmt, fmtTime } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";
import dynamic from "next/dynamic";
// Lazy-load: keeps @xyflow/react out of the shared bundle until topology renders
const ProviderTopology = dynamic(
  () => import("@/app/(dashboard)/dashboard/usage/components/ProviderTopology"),
  { ssr: false },
);
import UsageChart from "@/app/(dashboard)/dashboard/usage/components/UsageChart";

function timeAgo(timestamp: any) {
  const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Auto-update time display every second without re-rendering parent
function TimeAgo({ timestamp }: any) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return <>{timeAgo(timestamp)}</>;
}

function RecentRequests({ requests = [], providerNames = {} }: any) {
  return (
    <Card
      className="flex min-w-0 flex-col overflow-hidden"
      style={{ height: 480, paddingBlock: 0, gap: 0 }}
    >
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recent Requests
        </span>
        <Badge variant="secondary" className="ml-auto text-xs">
          last {requests.length} requests
        </Badge>
      </div>

      <div className="grid shrink-0 grid-cols-[8px_minmax(0,1fr)_minmax(0,88px)_64px_64px_52px] items-center gap-2 border-b border-border/60 px-4 py-2">
        <span />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Model
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Provider
        </span>
        <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Input ↑
        </span>
        <span className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Output ↓
        </span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          When
        </span>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {!requests.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Icon name="history" className="text-2xl opacity-50" />
            <p className="text-xs">No requests yet.</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {requests.map((r: any, i: any) => {
              const ok = !r.status || r.status === "ok" || r.status === "success";
              return (
                <div
                  key={i}
                  className="grid grid-cols-[8px_minmax(0,1fr)_minmax(0,88px)_64px_64px_52px] items-center gap-2 border-b border-border/40 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-accent/60"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${ok ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" : "bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.8)]"}`}
                  />
                  <span className="truncate font-mono text-xs font-medium">{r.model}</span>
                  <Badge variant="ghost" className="justify-start truncate px-1.5">
                    {providerNames[r.provider] || r.provider || "—"}
                  </Badge>
                  <span className="flex w-full items-center justify-center rounded-md bg-primary/10 px-1.5 py-1 text-center text-[11px] font-medium text-primary tabular-nums">
                    {fmt(r.promptTokens)}
                  </span>
                  <span className="flex w-full items-center justify-center rounded-md bg-emerald-500/10 px-1.5 py-1 text-center text-[11px] font-medium text-emerald-600 tabular-nums">
                    {fmt(r.completionTokens)}
                  </span>
                  <span className="text-right text-[11px] whitespace-nowrap text-muted-foreground">
                    <TimeAgo timestamp={r.timestamp} />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function sortData(dataMap: any, pendingMap: any = {}, sortBy: any, sortOrder: any) {
  return Object.entries(dataMap || {})
    .map(([key, data]: any) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      const totalCost = data.cost || 0;
      // ponytail: cost split is a token-share allocation of the (rate-accurate)
      // server total, not a per-rate recompute. cached is a subset of prompt, so
      // peel it out of the input share. Upgrade to a stored per-component cost
      // breakdown if exact cached-rate cost display is needed.
      const cachedTokens = data.cachedTokens || 0;
      const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
      const inputCost = totalTokens > 0 ? nonCachedInput * (totalCost / totalTokens) : 0;
      const cachedCost = totalTokens > 0 ? cachedTokens * (totalCost / totalTokens) : 0;
      const outputCost =
        totalTokens > 0 ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0;
      return {
        ...data,
        key,
        totalTokens,
        totalCost,
        inputCost,
        cachedCost,
        outputCost,
        pending: pendingMap[key] || 0,
      };
    })
    .sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
}

function getGroupKey(item: any, keyField: any) {
  switch (keyField) {
    case "rawModel":
      return item.rawModel || "Unknown Model";
    case "accountName":
      return (
        item.accountName || `Account ${item.connectionId?.slice(0, 8)}...` || "Unknown Account"
      );
    case "keyName":
      return item.keyName || "Unknown Key";
    case "endpoint":
      return item.endpoint || "Unknown Endpoint";
    default:
      return item[keyField] || "Unknown";
  }
}

function groupDataByKey(data: any, keyField: any) {
  if (!Array.isArray(data)) return [];
  const groups = {};
  data.forEach((item) => {
    const gk = getGroupKey(item, keyField);
    if (!groups[gk]) {
      groups[gk] = {
        groupKey: gk,
        summary: {
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          totalTokens: 0,
          cost: 0,
          inputCost: 0,
          cachedCost: 0,
          outputCost: 0,
          lastUsed: null,
          pending: 0,
        },
        items: [],
      };
    }
    const s = groups[gk].summary;
    s.requests += item.requests || 0;
    s.promptTokens += item.promptTokens || 0;
    s.completionTokens += item.completionTokens || 0;
    s.cachedTokens += item.cachedTokens || 0;
    s.totalTokens += item.totalTokens || 0;
    s.cost += item.cost || 0;
    s.inputCost += item.inputCost || 0;
    s.cachedCost += item.cachedCost || 0;
    s.outputCost += item.outputCost || 0;
    s.pending += item.pending || 0;
    if (item.lastUsed && (!s.lastUsed || new Date(item.lastUsed) > new Date(s.lastUsed))) {
      s.lastUsed = item.lastUsed;
    }
    groups[gk].items.push(item);
  });
  return Object.values(groups);
}

const MODEL_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ACCOUNT_COLUMNS = [
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "accountName", label: "Account" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const API_KEY_COLUMNS = [
  { field: "keyName", label: "API Key Name" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const ENDPOINT_COLUMNS = [
  { field: "endpoint", label: "Endpoint" },
  { field: "rawModel", label: "Model" },
  { field: "provider", label: "Provider" },
  { field: "requests", label: "Requests", align: "right" },
  { field: "lastUsed", label: "Last Used", align: "right" },
];

const TABLE_OPTIONS = [
  { value: "model", label: "Usage by Model" },
  { value: "account", label: "Usage by Account" },
  { value: "apiKey", label: "Usage by API Key" },
  { value: "endpoint", label: "Usage by Endpoint" },
];

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

interface UsageStatsProps {
  period?: any;
  setPeriod?: any;
  hidePeriodSelector?: boolean;
}

export default function UsageStats({
  period: periodProp,
  setPeriod: setPeriodProp,
  hidePeriodSelector = false,
}: UsageStatsProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sortBy = searchParams.get("sortBy") || "rawModel";
  const sortOrder = searchParams.get("sortOrder") || "asc";

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [tableView, setTableView] = useState("model");
  const [viewMode, setViewMode] = useState("costs");
  const [providers, setProviders] = useState([]);
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [periodLocal, setPeriodLocal] = useState("today");
  const isInitialLoad = useRef(true);
  const hasLoadedStats = useRef(false);
  const period = periodProp ?? periodLocal;
  const setPeriod = setPeriodProp ?? setPeriodLocal;

  // Fetch connected providers once, deduplicate by provider type
  // Always include noAuth free providers (e.g. opencode) regardless of connections
  useEffect(() => {
    Promise.all([
      fetch("/api/providers").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/provider-nodes").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, nodesData]) => {
        // Build node name lookup for custom providers
        const nodeNameMap = {};
        for (const node of nodesData?.nodes || []) {
          nodeNameMap[node.id] = node.name;
        }
        const seen = new Set();
        const unique = (d?.connections || [])
          .filter((c) => {
            if (c.isActive === false) return false;
            if (!isLLMProvider(c.provider)) return false;
            if (seen.has(c.provider)) return false;
            seen.add(c.provider);
            return true;
          })
          .map((c) => ({
            ...c,
            nodeName: nodeNameMap[c.provider] || null,
          }));
        const noAuthProviders = Object.values(FREE_PROVIDERS)
          .filter((p) => p.noAuth && !seen.has(p.id) && isLLMProvider(p.id))
          .map((p) => ({ provider: p.id, name: p.name }));
        setProviders([...unique, ...noAuthProviders]);
        setProviderNames(nodeNameMap);
      })
      .catch(() => {});
  }, []);

  // Fetch filtered stats via REST when period changes
  useEffect(() => {
    // First load: show full spinner; subsequent: show subtle fetching indicator
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      setLoading(true);
    } else {
      setFetching(true);
    }

    fetch(`/api/usage/stats?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          hasLoadedStats.current = true;
          setStats((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [period]);

  // SSE connection - real-time updates for activeRequests + recentRequests only
  useEffect(() => {
    const es = new EventSource("/api/usage/stream");

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        // Always merge only real-time fields, never overwrite full stats from REST
        setStats((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            activeRequests: data.activeRequests,
            recentRequests: data.recentRequests,
            errorProvider: data.errorProvider,
            pending: data.pending,
          };
        });
        if (hasLoadedStats.current) setLoading(false);
      } catch (err) {
        console.error("[SSE CLIENT] parse error:", err);
      }
    };

    es.onerror = () => setLoading(false);

    return () => es.close();
  }, []);

  const toggleSort = useCallback(
    (tableType, field) => {
      const params = new URLSearchParams(searchParams.toString());
      if (params.get("sortBy") === field) {
        params.set("sortOrder", params.get("sortOrder") === "asc" ? "desc" : "asc");
      } else {
        params.set("sortBy", field);
        params.set("sortOrder", "asc");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // Compute active table data
  const activeTableConfig = useMemo(() => {
    if (!stats) return null;
    switch (tableView) {
      case "model": {
        const pendingMap = stats.pending?.byModel || {};
        return {
          columns: MODEL_COLUMNS,
          groupedData: groupDataByKey(
            sortData(stats.byModel, pendingMap, sortBy, sortOrder),
            "rawModel",
          ),
          storageKey: "usage-stats:expanded-models",
          emptyMessage: "No usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                {fmt(group.summary.requests)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(group.summary.lastUsed)}
              </td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td
                className={`px-4 py-2.5 truncate font-mono text-xs font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}
              >
                {item.rawModel}
              </td>
              <td className="px-4 py-2.5">
                <Badge
                  variant={item.pending > 0 ? "default" : "ghost"}
                  className="justify-start truncate px-1.5"
                >
                  {item.provider}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(item.lastUsed)}
              </td>
            </>
          ),
        };
      }
      case "account": {
        const pendingMap = {};
        if (stats?.pending?.byAccount) {
          Object.entries(stats.byAccount || {}).forEach(([accountKey, data]: any) => {
            const connPending = stats.pending.byAccount[data.connectionId];
            if (connPending) {
              const modelKey = data.provider
                ? `${data.rawModel} (${data.provider})`
                : data.rawModel;
              pendingMap[accountKey] = connPending[modelKey] || 0;
            }
          });
        }
        return {
          columns: ACCOUNT_COLUMNS,
          groupedData: groupDataByKey(
            sortData(stats.byAccount, pendingMap, sortBy, sortOrder),
            "accountName",
          ),
          storageKey: "usage-stats:expanded-accounts",
          emptyMessage: "No account-specific usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                {fmt(group.summary.requests)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(group.summary.lastUsed)}
              </td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td
                className={`px-4 py-2.5 truncate text-xs font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}
              >
                {item.accountName || `Account ${item.connectionId?.slice(0, 8)}...`}
              </td>
              <td
                className={`px-4 py-2.5 truncate font-mono text-xs font-medium transition-colors ${item.pending > 0 ? "text-primary" : ""}`}
              >
                {item.rawModel}
              </td>
              <td className="px-4 py-2.5">
                <Badge
                  variant={item.pending > 0 ? "default" : "ghost"}
                  className="justify-start truncate px-1.5"
                >
                  {item.provider}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(item.lastUsed)}
              </td>
            </>
          ),
        };
      }
      case "apiKey": {
        return {
          columns: API_KEY_COLUMNS,
          groupedData: groupDataByKey(sortData(stats.byApiKey, {}, sortBy, sortOrder), "keyName"),
          storageKey: "usage-stats:expanded-apikeys",
          emptyMessage: "No API key usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                {fmt(group.summary.requests)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(group.summary.lastUsed)}
              </td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-4 py-2.5 truncate text-xs font-medium">{item.keyName}</td>
              <td className="px-4 py-2.5 truncate font-mono text-xs">{item.rawModel}</td>
              <td className="px-4 py-2.5">
                <Badge variant="ghost" className="justify-start truncate px-1.5">
                  {item.provider}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(item.lastUsed)}
              </td>
            </>
          ),
        };
      }
      case "endpoint":
      default: {
        return {
          columns: ENDPOINT_COLUMNS,
          groupedData: groupDataByKey(
            sortData(stats.byEndpoint, {}, sortBy, sortOrder),
            "endpoint",
          ),
          storageKey: "usage-stats:expanded-endpoints",
          emptyMessage: "No endpoint usage recorded yet.",
          renderSummaryCells: (group) => (
            <>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-muted-foreground text-xs">—</td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                {fmt(group.summary.requests)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(group.summary.lastUsed)}
              </td>
            </>
          ),
          renderDetailCells: (item) => (
            <>
              <td className="px-4 py-2.5 truncate font-mono text-xs font-medium">
                {item.endpoint}
              </td>
              <td className="px-4 py-2.5 truncate font-mono text-xs">{item.rawModel}</td>
              <td className="px-4 py-2.5">
                <Badge variant="ghost" className="justify-start truncate px-1.5">
                  {item.provider}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right text-xs tabular-nums">{fmt(item.requests)}</td>
              <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap text-[11px]">
                {fmtTime(item.lastUsed)}
              </td>
            </>
          ),
        };
      }
    }
  }, [stats, tableView, sortBy, sortOrder]);

  if (!stats && !loading)
    return <div className="text-muted-foreground">Failed to load usage statistics.</div>;

  const statsSkeleton = (
    <CardGrid variant="stat">
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </CardGrid>
  );
  const panelSpinner = (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Icon name="progress_activity" className="text-[32px] animate-spin" />
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Period selector (hidden when controlled by parent) */}
      {!hidePeriodSelector && (
        <div className="flex w-full items-center gap-2 sm:w-auto sm:self-end">
          <div className="grid flex-1 grid-cols-5 items-center gap-1 rounded-lg border border-border bg-muted p-1 sm:flex sm:flex-none">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                disabled={fetching}
                className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${period === p.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {fetching && (
            <Icon
              name="progress_activity"
              className="text-[16px] text-muted-foreground animate-spin"
            />
          )}
        </div>
      )}

      {/* Overview cards */}
      {loading ? statsSkeleton : <OverviewCards stats={stats} />}

      {/* Live activity: topology + recent requests, equal height */}
      {loading ? (
        <>
          <PanelSkeleton />
          <PanelSkeleton />
        </>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ProviderTopology
            providers={providers}
            activeRequests={stats.activeRequests || []}
            lastProvider={stats.recentRequests?.[0]?.provider || ""}
            errorProvider={stats.errorProvider || ""}
          />
          <RecentRequests requests={stats.recentRequests || []} providerNames={providerNames} />
        </div>
      )}

      {/* Token / Cost chart - sync period */}
      {loading ? <PanelSkeleton /> : <UsageChart period={period} />}

      {/* Usage breakdown table, full width */}
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            options={[
              { value: "costs", label: "Costs" },
              { value: "tokens", label: "Tokens" },
            ]}
            value={viewMode}
            onChange={setViewMode}
            size="sm"
            className="w-full sm:w-auto"
          />
          <Select value={tableView} onValueChange={setTableView}>
            <SelectTrigger className="w-full sm:w-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TABLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loading
          ? panelSpinner
          : activeTableConfig && (
              <UsageTable
                title={TABLE_OPTIONS.find((o) => o.value === tableView)?.label || "Usage"}
                columns={activeTableConfig.columns}
                groupedData={activeTableConfig.groupedData}
                tableType={tableView}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onToggleSort={toggleSort}
                viewMode={viewMode}
                storageKey={activeTableConfig.storageKey}
                renderSummaryCells={activeTableConfig.renderSummaryCells}
                renderDetailCells={activeTableConfig.renderDetailCells}
                emptyMessage={activeTableConfig.emptyMessage}
              />
            )}
      </div>
    </div>
  );
}
