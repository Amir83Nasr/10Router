"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Icon from "@/shared/components/Icon";

type HealthStatus = "healthy" | "degraded" | "down" | "cooldown" | "idle";

interface ProviderEntry {
  provider: string;
  connectionId: string;
  connectionName: string;
  requests: number;
  errors: number;
  detailErrors: number;
  successRate: number | null;
  p50LatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
  cooldownUntil: string | null;
  status: HealthStatus;
}

interface FailureEntry {
  timestamp: string;
  provider: string;
  model: string;
  connectionId: string | null;
  connectionName: string | null;
  status: string;
  latencyMs: number | null;
  error: string | null;
}

const STATUS_META: Record<HealthStatus, { label: string; className: string }> = {
  down: { label: "Down", className: "bg-destructive/10 text-destructive" },
  cooldown: { label: "Cooldown", className: "bg-amber-500/10 text-amber-600" },
  degraded: { label: "Degraded", className: "bg-amber-500/10 text-amber-600" },
  healthy: { label: "Healthy", className: "bg-emerald-500/10 text-emerald-600" },
  idle: { label: "Idle", className: "bg-muted text-muted-foreground" },
};

function fmtPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ProviderHealth() {
  const [entries, setEntries] = useState<ProviderEntry[]>([]);
  const [failures, setFailures] = useState<FailureEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setEntries(data.providers || []);
        setFailures(data.recentFailures || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const problemCount = entries.filter(
    (e) => e.status === "down" || e.status === "cooldown" || e.status === "degraded",
  ).length;

  return (
    <Card className="flex min-w-0 flex-col overflow-hidden" style={{ paddingBlock: 0, gap: 0 }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Fallback Health
        </span>
        <span className="text-[11px] text-muted-foreground">24h · per account</span>
        {!loading && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {problemCount === 0 ? "all healthy" : `${problemCount} need attention`}
          </Badge>
        )}
      </div>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Icon name="progress_activity" className="text-[24px] animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Icon name="history" className="text-2xl opacity-50" />
            <p className="text-xs">No provider traffic in the last 24h.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border/60 text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
                    Account
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Requests
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Success
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    p50
                  </th>
                  <th className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide">
                    Last error
                  </th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {entries.slice(0, 12).map((e) => {
                  const meta = STATUS_META[e.status];
                  return (
                    <tr key={`${e.provider}-${e.connectionId}`} className="hover:bg-accent/60">
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-mono text-xs font-medium">
                            {e.connectionName}
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {e.provider}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {e.requests + e.detailErrors}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {fmtPct(e.successRate)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                        {fmtLatency(e.p50LatencyMs)}
                      </td>
                      <td className="max-w-64 px-4 py-2.5">
                        {e.lastError ? (
                          <span
                            className="block truncate text-[11px] text-muted-foreground"
                            title={`${e.lastError} (${fmtTime(e.lastErrorAt)})`}
                          >
                            {e.lastError}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Badge variant="secondary" className={`text-[11px] ${meta.className}`}>
                          {meta.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {failures.length > 0 && (
              <div className="border-t border-border/60 px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent failures — why fallback triggered
                </p>
                <div className="flex flex-col gap-1.5">
                  {failures.slice(0, 5).map((f, i) => (
                    <div
                      key={`${f.timestamp}-${i}`}
                      className="flex min-w-0 items-center gap-2 text-[11px]"
                    >
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {fmtTime(f.timestamp)}
                      </span>
                      <span className="shrink-0 font-mono font-medium">
                        {f.model || f.provider}
                      </span>
                      <span
                        className="min-w-0 flex-1 truncate text-muted-foreground"
                        title={f.error || ""}
                      >
                        {f.error || f.status} ·{" "}
                        {f.connectionName || f.connectionId?.slice(0, 8) || "?"}
                        {f.latencyMs != null ? ` · ${fmtLatency(f.latencyMs)}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
