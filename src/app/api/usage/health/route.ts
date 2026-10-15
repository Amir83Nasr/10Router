import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver.js";
import { getProviderConnections } from "@/lib/db/index.js";
import { parseJson } from "@/lib/db/helpers/jsonCol.js";
import { summarizeProviderHealth } from "@/lib/usageHealth";

const HISTORY_LIMIT = 5000;
const DETAIL_LIMIT = 200;
const WINDOW_MS = 24 * 60 * 60 * 1000;

function extractError(data: any): string | null {
  const r = data?.response;
  if (!r || typeof r !== "object") return null;
  if (typeof r.error === "string") return r.error;
  if (r.error != null) {
    try {
      return JSON.stringify(r.error);
    } catch {
      return String(r.error);
    }
  }
  return null;
}

/**
 * GET /api/usage/health
 * Fallback inspector: per-account success rate, p50 latency, last error,
 * cooldown state + recent failure trace (last 24h window).
 */
export async function GET() {
  try {
    const db = await getAdapter();
    const cutoffIso = new Date(Date.now() - WINDOW_MS).toISOString();

    const historyRows = db.all(
      `SELECT provider, connectionId, status, timestamp FROM usageHistory WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?`,
      [cutoffIso, HISTORY_LIMIT],
    ) as Array<{
      provider: string | null;
      connectionId: string | null;
      status: string | null;
      timestamp: string;
    }>;

    const detailRaw = db.all(`SELECT data FROM requestDetails ORDER BY timestamp DESC LIMIT ?`, [
      DETAIL_LIMIT,
    ]) as Array<{ data: string }>;

    const detailRows: Array<{
      provider?: string | null;
      connectionId?: string | null;
      timestamp?: string;
      status?: string | null;
      latencyMs?: number;
      error?: string | null;
    }> = [];
    for (const row of detailRaw) {
      const data = parseJson(row.data, null) as any;
      if (!data) continue;
      const latencyMs =
        typeof data?.latency?.total === "number"
          ? data.latency.total
          : typeof data?.data?.latency?.total === "number"
            ? data.data.latency.total
            : undefined;
      detailRows.push({
        provider: data.provider || null,
        connectionId: data.connectionId || null,
        timestamp: data.timestamp || "",
        status: data.status || null,
        latencyMs,
        error: extractError(data),
      });
    }

    // Attach model names to recent failures (cheap second pass over parsed rows).
    const parsedDetails = detailRaw.map((r) => parseJson(r.data, null) as any).filter(Boolean);

    const connections = await getProviderConnections();

    const { providers, recentFailures } = summarizeProviderHealth({
      historyRows: historyRows.map((r) => ({
        provider: r.provider,
        connectionId: r.connectionId,
        status: r.status,
        timestamp: r.timestamp,
      })),
      detailRows,
      connections: connections.map((c: any) => ({
        id: c.id,
        provider: c.provider,
        name: c.name || c.email || null,
        rateLimitedUntil: c.rateLimitedUntil || null,
        testStatus: c.testStatus || null,
        lastError: c.lastError ?? null,
      })),
      cutoffIso,
    });

    const modelByKey = new Map<string, string>();
    for (const d of parsedDetails) {
      if (d?.provider && d?.connectionId && d?.timestamp && d?.model) {
        modelByKey.set(`${d.provider}|||${d.connectionId}|||${d.timestamp}`, d.model);
      }
    }
    const failuresWithModel = recentFailures.map((f) => ({
      ...f,
      model: modelByKey.get(`${f.provider}|||${f.connectionId}|||${f.timestamp}`) || "",
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      window: "24h",
      providers,
      recentFailures: failuresWithModel,
    });
  } catch (error) {
    console.error("[API] Failed to get usage health:", error);
    return NextResponse.json({ error: "Failed to fetch provider health" }, { status: 500 });
  }
}
