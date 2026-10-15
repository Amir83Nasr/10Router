export interface HealthHistoryRow {
  provider?: string | null;
  connectionId?: string | null;
  status?: string | null;
  timestamp?: string;
}

export interface HealthDetailRow {
  provider?: string | null;
  connectionId?: string | null;
  timestamp?: string;
  status?: string | null;
  latencyMs?: number;
  error?: string | null;
}

export interface HealthConnection {
  id: string;
  provider: string;
  name?: string | null;
  rateLimitedUntil?: string | null;
  testStatus?: string | null;
  lastError?: unknown;
}

export type HealthStatus = "healthy" | "degraded" | "down" | "cooldown" | "idle";

export interface ProviderHealthEntry {
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

export interface RecentFailure {
  timestamp: string;
  provider: string;
  model: string;
  connectionId: string | null;
  connectionName: string | null;
  status: string;
  latencyMs: number | null;
  error: string | null;
}

function isOkStatus(status: unknown): boolean {
  if (!status) return true;
  const s = String(status).toLowerCase();
  return s === "ok" || s === "success";
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function shortError(value: unknown, max = 220): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  const clean = s.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function summarizeProviderHealth(input: {
  historyRows: HealthHistoryRow[];
  detailRows: HealthDetailRow[];
  connections: HealthConnection[];
  cutoffIso: string;
}): { providers: ProviderHealthEntry[]; recentFailures: RecentFailure[] } {
  const cutoffMs = new Date(input.cutoffIso).getTime();
  const connById = new Map<string, HealthConnection>();
  for (const c of input.connections) connById.set(c.id, c);

  type Acc = {
    provider: string;
    connectionId: string;
    requests: number;
    errors: number;
    detailErrors: number;
    latencies: number[];
    lastError: string | null;
    lastErrorAt: string | null;
  };
  const accs = new Map<string, Acc>();
  const accKey = (provider: string, connectionId: string) => `${provider}|||${connectionId}`;

  const ensure = (provider: string, connectionId: string): Acc => {
    const key = accKey(provider, connectionId);
    let a = accs.get(key);
    if (!a) {
      a = {
        provider,
        connectionId,
        requests: 0,
        errors: 0,
        detailErrors: 0,
        latencies: [],
        lastError: null,
        lastErrorAt: null,
      };
      accs.set(key, a);
    }
    return a;
  };

  for (const r of input.historyRows) {
    if (!r.provider || !r.connectionId) continue;
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (Number.isFinite(cutoffMs) && ts < cutoffMs) continue;
    const a = ensure(r.provider, r.connectionId);
    a.requests += 1;
    if (!isOkStatus(r.status)) a.errors += 1;
  }

  const failures: RecentFailure[] = [];
  for (const d of input.detailRows) {
    if (!d.provider) continue;
    const connId = d.connectionId || "unknown";
    const ts = d.timestamp || "";
    const tsMs = ts ? new Date(ts).getTime() : 0;
    const inWindow = !Number.isFinite(cutoffMs) || tsMs >= cutoffMs;
    if (inWindow && d.connectionId) {
      const a = ensure(d.provider, d.connectionId);
      if (typeof d.latencyMs === "number" && d.latencyMs >= 0) a.latencies.push(d.latencyMs);
      if (!isOkStatus(d.status)) {
        a.detailErrors += 1;
        const err = shortError(d.error);
        if (err && (!a.lastErrorAt || ts > a.lastErrorAt)) {
          a.lastError = err;
          a.lastErrorAt = ts;
        }
      } else if (typeof d.latencyMs === "number" && d.latencyMs >= 0 && !a.lastErrorAt) {
        // keep lastErrorAt empty on pure success; nothing to do
      }
    }
    if (!isOkStatus(d.status)) {
      const conn = d.connectionId ? connById.get(d.connectionId) : undefined;
      failures.push({
        timestamp: ts,
        provider: d.provider,
        model: "",
        connectionId: d.connectionId || null,
        connectionName: conn?.name || null,
        status: String(d.status || "error"),
        latencyMs: typeof d.latencyMs === "number" ? d.latencyMs : null,
        error: shortError(d.error),
      });
    }
    void connId;
  }

  // Seed accounts that have connections but zero traffic so the UI shows idle/cooldown rows.
  for (const c of input.connections) {
    ensure(c.provider, c.id);
  }

  const now = Date.now();
  const providers: ProviderHealthEntry[] = [...accs.values()].map((a) => {
    const conn = connById.get(a.connectionId);
    const cooldownUntil = conn?.rateLimitedUntil || null;
    const cooldownActive = !!cooldownUntil && new Date(cooldownUntil).getTime() > now;
    a.latencies.sort((x, y) => x - y);
    const total = a.requests + a.detailErrors;
    const failed = a.errors + a.detailErrors;
    const successRate =
      a.requests > 0 ? (a.requests - a.errors) / a.requests : total > 0 ? 0 : null;
    let status: HealthStatus;
    if (cooldownActive) status = "cooldown";
    else if (total === 0) status = "idle";
    else if (a.requests === 0 || (successRate !== null && successRate < 0.5)) status = "down";
    else if (failed > 0) status = "degraded";
    else status = "healthy";
    // Surface connection-level lastError when no detail error was captured.
    let lastError = a.lastError;
    let lastErrorAt = a.lastErrorAt;
    if (!lastError && conn?.lastError) {
      lastError = shortError(conn.lastError);
    }
    return {
      provider: a.provider,
      connectionId: a.connectionId,
      connectionName: conn?.name || `${a.connectionId.slice(0, 8)}…`,
      requests: a.requests,
      errors: a.errors,
      detailErrors: a.detailErrors,
      successRate,
      p50LatencyMs: percentile(a.latencies, 0.5),
      lastError,
      lastErrorAt,
      cooldownUntil: cooldownActive ? cooldownUntil : null,
      status,
    };
  });

  providers.sort((x, y) => {
    const rank: Record<HealthStatus, number> = {
      down: 0,
      cooldown: 1,
      degraded: 2,
      healthy: 3,
      idle: 4,
    };
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    return y.requests + y.detailErrors - (x.requests + x.detailErrors);
  });

  failures.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return { providers, recentFailures: failures.slice(0, 20) };
}
