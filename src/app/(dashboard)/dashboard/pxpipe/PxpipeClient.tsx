"use client";

import { useState, useEffect, useCallback } from "react";
import { Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

const WINDOW_TABS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7d", label: "7 days" },
  { id: "last30d", label: "30 days" },
  { id: "all", label: "All time" },
] as const;

type WindowId = (typeof WINDOW_TABS)[number]["id"];

const fmtTokens = (n?: number | null) => {
  if (!n) return n === 0 ? "0" : "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
};

const fmtUptime = (ms?: number | null) => {
  if (!ms || ms <= 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};

const REASON_LABELS: Record<string, string> = {
  applied: "Prompt exceeded threshold",
  below_threshold: "Below size threshold",
  not_profitable: "Compression not profitable",
  below_min_chars: "Below minimum chars",
  below_min_tokens: "Below minimum tokens",
  unsupported_model: "Model not in allowlist",
  unsupported_format: "Non-Claude request format",
  timeout: "Compression timed out",
  transform_error: "Transform error",
  passthrough: "Passthrough",
  disabled: "Disabled",
  not_installed: "Not installed",
};

type PxpipeWindow = {
  requests: number;
  compressed: number;
  bypassed: number;
  tokensBeforeEst: number;
  tokensAfterEst: number;
  tokensSavedEst: number;
  savedPct: number;
  imagesGenerated: number;
  avgCompressionMs: number;
  errors: number;
};

type PxpipeEvent = {
  ts: number;
  provider?: string;
  model?: string;
  applied: boolean;
  reason?: string;
  detail?: string;
  tokensBeforeEst?: number;
  tokensAfterEst?: number;
  tokensSavedEst?: number;
  savedPct?: number;
  durationMs?: number;
};

type PxpipeStatus = {
  installed?: boolean;
  running?: boolean;
  enabled?: boolean;
  version?: string;
  uptimeMs?: number;
};

type PxpipeHealth = {
  healthy?: boolean;
};

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${tone || ""}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function PxpipeClient() {
  const [status, setStatus] = useState<PxpipeStatus | null>(null);
  const [health, setHealth] = useState<PxpipeHealth | null>(null);
  const [stats, setStats] = useState<{
    windows?: Record<string, PxpipeWindow>;
    timeline?: { date: string; tokensSavedEst: number }[];
    recent?: PxpipeEvent[];
  } | null>(null);
  const [logs, setLogs] = useState<{ installLog?: string } | null>(null);
  const [windowId, setWindowId] = useState<WindowId>("last7d");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes, logsRes] = await Promise.all([
        fetch("/api/pxpipe/status", { headers: { "Cache-Control": "no-store" } }),
        fetch("/api/pxpipe/stats"),
        fetch("/api/pxpipe/logs?limit=50"),
      ]);
      setStatus(await statusRes.json());
      setStats(await statsRes.json());
      setLogs(await logsRes.json());
      const healthRes = await fetch("/api/pxpipe/health", { method: "POST" });
      setHealth(await healthRes.json());
    } catch {
      /* sections render placeholders */
    } finally {
      setLoading(false);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- mount-time data fetch, same as other dashboard pages */
  useEffect(() => {
    refresh();
  }, [refresh]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const w = stats?.windows?.[windowId];
  const statusLabel = !status
    ? "—"
    : !status.installed
      ? "Not installed"
      : health?.healthy
        ? "Healthy"
        : status.running
          ? "Running"
          : "Stopped";

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ImageIcon className="text-primary" />
          PXPIPE Dashboard
        </h2>
        <div className="flex items-center gap-2">
          <a
            href="/dashboard/token-saver"
            className="text-xs text-primary underline hover:opacity-80"
          >
            Token Saver settings
          </a>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          label="Status"
          value={statusLabel}
          tone={
            health?.healthy
              ? "text-emerald-600"
              : status?.installed
                ? "text-amber-600"
                : "text-muted-foreground"
          }
          sub={status?.enabled ? "Enabled in pipeline" : "Disabled in pipeline"}
        />
        <SummaryCard
          label="Version"
          value={status?.version ? `v${status.version}` : "—"}
          sub="pxpipe-proxy"
        />
        <SummaryCard label="Uptime" value={fmtUptime(status?.uptimeMs)} sub="module loaded" />
        <SummaryCard label="Requests" value={w ? w.requests.toLocaleString() : "—"} />
        <SummaryCard
          label="Compressed"
          value={w ? w.compressed.toLocaleString() : "—"}
          tone="text-emerald-600"
        />
        <SummaryCard label="Bypassed" value={w ? w.bypassed.toLocaleString() : "—"} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">Token savings (estimated)</h3>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
              {WINDOW_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setWindowId(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    windowId === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Original tokens</p>
              <p className="text-lg font-semibold">{w ? fmtTokens(w.tokensBeforeEst) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">After PXPIPE</p>
              <p className="text-lg font-semibold">{w ? fmtTokens(w.tokensAfterEst) : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saved</p>
              <p className="text-lg font-semibold text-emerald-600">
                {w ? fmtTokens(w.tokensSavedEst) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reduction</p>
              <p className="text-lg font-semibold text-emerald-600">{w ? `${w.savedPct}%` : "—"}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Estimates from body size before/after imaging; billed usage per request (recorded on the
            Usage page) remains the ground truth. Images generated:{" "}
            {w ? w.imagesGenerated.toLocaleString() : "—"} · avg compression time:{" "}
            {w ? `${w.avgCompressionMs}ms` : "—"} · errors: {w ? w.errors : "—"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 font-medium">Tokens saved — last 30 days</h3>
          {stats?.timeline?.some((d) => d.tokensSavedEst > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats.timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradPxpipe" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtTokens} width={48} />
                <RechartsTooltip
                  formatter={(v) => [fmtTokens(v as number), "Tokens saved"]}
                  labelFormatter={(d) => d}
                />
                <Area
                  type="monotone"
                  dataKey="tokensSavedEst"
                  stroke="#10b981"
                  fill="url(#gradPxpipe)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No savings recorded yet — enable PXPIPE in the Token Saver and route a large
              Claude-format request.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="mb-3 font-medium">History</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Compressed</TableHead>
                  <TableHead className="text-right">Saved</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats?.recent || []).slice(0, 50).map((ev, i) => (
                  <TableRow key={`${ev.ts}-${i}`}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(ev.ts).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.provider ? `${ev.provider}/${ev.model}` : ev.model || "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ev.applied ? fmtTokens(ev.tokensBeforeEst) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ev.applied ? fmtTokens(ev.tokensAfterEst) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-emerald-600">
                      {ev.applied ? fmtTokens(ev.tokensSavedEst) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ev.applied ? `${ev.savedPct}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {ev.durationMs != null ? `${ev.durationMs}ms` : "—"}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="default"
                            className={
                              ev.applied
                                ? "bg-emerald-500/15 text-emerald-600"
                                : ev.reason === "transform_error" || ev.reason === "timeout"
                                  ? "bg-destructive/15 text-destructive"
                                  : "bg-amber-500/15 text-amber-600"
                            }
                          >
                            {ev.applied
                              ? "Compressed"
                              : REASON_LABELS[ev.reason ?? ""] || ev.reason}
                          </Badge>
                        </TooltipTrigger>
                        {ev.detail ? <TooltipContent>{ev.detail}</TooltipContent> : null}
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {(!stats?.recent || stats.recent.length === 0) && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No PXPIPE activity yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4" id="logs">
          <h3 className="mb-3 font-medium">PXPIPE Logs</h3>
          {logs?.installLog ? (
            <pre className="max-h-64 overflow-x-auto overflow-y-auto rounded bg-black/5 p-3 font-mono text-xs whitespace-pre-wrap dark:bg-white/5">
              {logs.installLog}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No install log yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
