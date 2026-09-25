// Background proactive OAuth token refresh — independent of inbound requests.
// Fail-open everywhere: tick errors and per-connection failures never kill the interval.

import * as log from "../utils/logger";
import { getRefreshLeadMs } from "open-sse/services/tokenRefresh.js";
import { getCredentialExpiryMs } from "open-sse/services/oauthCredentialManager.js";

/** Refresh when expiry is within 30 minutes (or the provider on-request lead, whichever larger). */
export const BACKGROUND_REFRESH_LEAD_MS = 30 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const INITIAL_DELAY_MS = 10 * 1000;
const SENSITIVE_PROVIDERS = new Set(["antigravity"]);

let started = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let initialTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let tickRunning = false;

function isTruthyEnv(value: string | undefined | null): boolean {
  if (value == null || value === "") return false;
  const v = String(value).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function isNonServerRuntime(): boolean {
  if (typeof window !== "undefined") return true;
  const phase = process.env.NEXT_PHASE || "";
  if (phase === "phase-production-build" || phase === "phase-export" || phase === "phase-static") {
    return true;
  }
  // Next.js build / static generation markers
  if (process.env.NEXT_RUNTIME === "edge") return true;
  return false;
}

/**
 * Pure selection: OAuth connections with a refreshToken whose access token
 * expires within max(provider on-request lead, BACKGROUND_REFRESH_LEAD_MS).
 *
 * @param {Array<object>} connections
 * @param {number} [nowMs]
 * @returns {Array<object>}
 */
export function selectConnectionsNeedingRefresh<
  T extends { authType?: any; refreshToken?: any; provider?: any },
>(connections: T[], nowMs: number = Date.now()): T[] {
  if (!Array.isArray(connections) || connections.length === 0) return [];

  const out: T[] = [];
  for (const conn of connections) {
    if (!conn) continue;

    const authType = String(conn.authType || "")
      .toLowerCase()
      .replace(/_/g, "");
    if (authType !== "oauth") continue;
    if (!conn.refreshToken) continue;

    const expiresAtMs = getCredentialExpiryMs(conn);
    if (expiresAtMs === null) continue;

    const providerLead = getRefreshLeadMs(conn.provider);
    const leadMs = Math.max(
      Number.isFinite(providerLead) ? providerLead : 0,
      BACKGROUND_REFRESH_LEAD_MS,
    );

    if (expiresAtMs - nowMs < leadMs) {
      out.push(conn);
    }
  }
  return out;
}

async function loadActiveConnections(): Promise<any[]> {
  // Dynamic import avoids circular load with db / app graph at module eval time.
  const { getProviderConnections } = await import("../../lib/db/repos/connectionsRepo");
  return getProviderConnections({ isActive: true });
}

async function refreshOne(connection: any): Promise<any> {
  const { checkAndRefreshToken } = await import("./tokenRefresh");
  return checkAndRefreshToken(connection.provider, connection, { force: true });
}

type RefreshDeps = {
  loadConnections?: () => Promise<any[]>;
  refreshConnection?: (conn: any) => Promise<any>;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * One scheduler tick. Fail-open at top level and per connection.
 * @param {{ loadConnections?: Function, refreshConnection?: Function }} [deps]
 */
export async function runBackgroundTokenRefreshTick(deps: RefreshDeps = {}): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const load = deps.loadConnections || loadActiveConnections;
    const refresh = deps.refreshConnection || refreshOne;
    const sleep = deps.sleep || ((ms: number) => new Promise((res) => setTimeout(res, ms)));

    const connections = await load();
    const due = selectConnectionsNeedingRefresh(connections, Date.now());

    if (due.length === 0) return;

    const baseSensitiveDelay = Number(process.env.BG_REFRESH_GOOGLE_DELAY_MS) || 12_000;
    const baseNormalDelay = Number(process.env.BG_REFRESH_DELAY_MS) || 1_500;

    for (let i = 0; i < due.length; i++) {
      const conn = due[i];
      try {
        await refresh(conn);
        log.info("BG_TOKEN_REFRESH", "Connection refresh finished", {
          id: conn.id,
          email: conn.email || conn.name || conn.id,
          provider: conn.provider,
        });
      } catch (err: any) {
        log.warn("BG_TOKEN_REFRESH", "Connection refresh failed (swallowed)", {
          id: conn?.id,
          email: conn?.email || conn?.name || conn?.id,
          provider: conn?.provider,
          error: err?.message ?? String(err),
        });
      }

      // Sequential delay between accounts to prevent bursting upstream providers (especially Google Cloud)
      if (i < due.length - 1) {
        const isSensitive = SENSITIVE_PROVIDERS.has(conn.provider);
        const baseDelay = isSensitive ? baseSensitiveDelay : baseNormalDelay;
        const jitter = isSensitive ? Math.floor(Math.random() * 4000) : 200;
        await sleep(baseDelay + jitter);
      }
    }
  } catch (err: any) {
    log.warn("BG_TOKEN_REFRESH", "Tick failed (swallowed)", {
      error: err?.message ?? String(err),
    });
  } finally {
    tickRunning = false;
  }
}

/**
 * Start the background interval. Safe to call multiple times (no-op if already started).
 * @param {{ intervalMs?: number }} [opts]
 * @returns {boolean} true if started this call
 */
export function startBackgroundTokenRefresh({ intervalMs }: { intervalMs?: number } = {}): boolean {
  if (started) return false;
  if (isTruthyEnv(process.env.DISABLE_BACKGROUND_TOKEN_REFRESH)) return false;
  if (isNonServerRuntime()) return false;

  started = true;
  const period = Number.isFinite(intervalMs) && intervalMs! > 0 ? intervalMs! : DEFAULT_INTERVAL_MS;

  const safeTick = () => {
    runBackgroundTokenRefreshTick().catch((err: any) => {
      log.warn("BG_TOKEN_REFRESH", "Unhandled tick rejection (swallowed)", {
        error: err?.message ?? String(err),
      });
    });
  };

  // First pass soon after boot so idle connections don't wait a full interval.
  initialTimeoutHandle = setTimeout(safeTick, INITIAL_DELAY_MS);
  if (initialTimeoutHandle.unref) initialTimeoutHandle.unref();

  intervalHandle = setInterval(safeTick, period);
  if (intervalHandle.unref) intervalHandle.unref();

  return true;
}

export function stopBackgroundTokenRefresh(): void {
  if (initialTimeoutHandle) {
    clearTimeout(initialTimeoutHandle);
    initialTimeoutHandle = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (started) {
    started = false;
  }
}
