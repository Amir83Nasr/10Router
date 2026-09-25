/**
 * Zed monthly-quota cache — in-memory, refreshed on demand.
 * Used by auth.ts pre-filter to skip accounts whose monthly quota
 * (edit_predictions / model_requests from /client/users/me) is exhausted,
 * and by the chat error path to sync the exact billing-cycle resetAt.
 * RAM-only on purpose: the generic modelLock path caps cooldowns at 30m,
 * but a billing-cycle reset can be weeks out — the cache holds the exact
 * date while the process lives; a restart costs one upstream error per account.
 */

import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getZedUsage } from "open-sse/services/usage/zed.js";
import * as log from "../utils/logger";

// In-memory cache: connectionId → exhausted entry { remainingPercentage: 0, resetAt }
const quotaCache = new Map<string, { remainingPercentage: number; resetAt?: string }>();
// Latest known billing-cycle reset per connection (from subscription_period.ended_at),
// even when no quota row is exhausted — token-billed plans need it for spend-limit blocks.
const billingResetCache = new Map<string, number>();
// Track last refresh per connection to avoid hammering
const lastRefreshAt = new Map<string, number>();
// In-flight refresh promises — dedup concurrent 402/403/429 bursts
const inflightRefresh = new Map<string, Promise<any>>();

const MIN_REFRESH_INTERVAL_MS = 30_000; // 30s between refreshes per connection

/**
 * Get the quota cache (read-only reference for auth.ts pre-filter).
 */
export function getZedQuotaCache() {
  return quotaCache;
}

/**
 * Clear a connection's exhausted entry after a successful request.
 * A success proves the account serves traffic, so any cached block is stale.
 */
export function clearZedQuotaBlock(connectionId: string): void {
  quotaCache.delete(connectionId);
  billingResetCache.delete(connectionId);
}

/**
 * Token-spend signals (plan credits, not request counts). Zed bills Student/Pro
 * token usage against credits; /client/users/me quota rows report edit_predictions
 * only, so the 403 `token_spend_limit_reached` body is the only signal. The
 * client-facing "(reset after 2m)" is rate-limit formatting, not the billing
 * reset — trust the latest billing-cycle reset only when it is in the future,
 * else cap so one error can't park an account past the cooldown window.
 */
export function isZedSpendLimitError(status: number, errorText: string): boolean {
  if (status !== 403 && status !== 402) return false;
  const text = String(errorText || "").toLowerCase();
  return (
    text.includes("token_spend_limit") ||
    text.includes("spend_limit") ||
    text.includes("credits consumed") ||
    (text.includes("credit") && text.includes("consumed"))
  );
}

/**
 * Latest billing-cycle reset across exhausted quota rows, or null when healthy.
 * Unlimited rows never block; exhausted rows without a future resetAt can't
 * be scheduled, so they fall through to the generic backoff path.
 */
function usageHasQuotas(usage: any): boolean {
  const quotas = usage?.quotas;
  return !!quotas && typeof quotas === "object" && Object.keys(quotas).length > 0;
}

/** Billing-cycle reset from a usage payload (row resetAt wins, top-level fallback). */
function parseUsageResetMs(usage: any): number | null | undefined {
  if (!usageHasQuotas(usage)) return undefined; // no signal — error payload
  let best: number | null = null;
  for (const row of Object.values(usage.quotas) as any[]) {
    const resetAt = row?.resetAt || usage.resetAt;
    if (!resetAt) continue;
    const ms = new Date(resetAt).getTime();
    // Keep even a past reset: lastRefreshAt already gates the extra upstream call.
    if (Number.isFinite(ms) && (best == null || ms > best)) best = ms;
  }
  return best; // null = quotas present but no reset anywhere
}

function findExhaustedResetMs(usage: any): number | null {
  const quotas = usage?.quotas;
  if (!quotas || typeof quotas !== "object") return null;
  const now = Date.now();
  let latest: number | null = null;
  for (const row of Object.values(quotas) as any[]) {
    if (!row || row.unlimited) continue;
    if ((row.remainingPercentage ?? 100) > 0) continue;
    const resetAt = row.resetAt || usage.resetAt;
    if (!resetAt) continue;
    const ms = new Date(resetAt).getTime();
    if (Number.isFinite(ms) && ms > now && (latest == null || ms > latest)) latest = ms;
  }
  return latest;
}

/**
 * Refresh quota for a single Zed connection from /client/users/me.
 * Caches only the exhausted state; a healthy reading drops any stale block.
 * @returns quotas map, or null on failure / throttled (known cache preserved)
 */
export async function refreshZedQuota(
  connectionId: string,
  accessToken: string,
  providerSpecificData: any,
): Promise<Record<string, any> | null> {
  const now = Date.now();
  // Coalesce concurrent refreshes before applying the interval gate.
  const inflight = inflightRefresh.get(connectionId);
  if (inflight) return inflight;

  const lastRefresh = lastRefreshAt.get(connectionId) || 0;
  if (now - lastRefresh < MIN_REFRESH_INTERVAL_MS) {
    log.debug(
      "ZED_QUOTA",
      `${connectionId.slice(0, 8)} | skip refresh (${Math.round((now - lastRefresh) / 1000)}s ago)`,
    );
    return null;
  }

  // Record every attempt so failed quota calls cannot amplify an upstream burst.
  lastRefreshAt.set(connectionId, now);
  const promise = _doRefresh(connectionId, accessToken, providerSpecificData);
  inflightRefresh.set(connectionId, promise);
  try {
    return await promise;
  } finally {
    inflightRefresh.delete(connectionId);
  }
}

async function _doRefresh(
  connectionId: string,
  accessToken: string,
  providerSpecificData: any,
): Promise<Record<string, any> | null> {
  try {
    const proxyCfg = await resolveConnectionProxyConfig(providerSpecificData || {});
    const proxyOptions = {
      connectionProxyEnabled: proxyCfg.connectionProxyEnabled === true,
      connectionProxyUrl: proxyCfg.connectionProxyUrl || "",
      connectionNoProxy: proxyCfg.connectionNoProxy || "",
      vercelRelayUrl: proxyCfg.vercelRelayUrl || "",
      strictProxy: proxyCfg.strictProxy === true,
    };

    const usage = await getZedUsage(accessToken, providerSpecificData, proxyOptions);
    // Cache the billing-cycle reset even on healthy readings — token-billed
    // plans (spend-limit errors) have no exhausted quota row to read it from.
    const cycleResetMs = parseUsageResetMs(usage);
    if (cycleResetMs != null) billingResetCache.set(connectionId, cycleResetMs);
    else if (cycleResetMs === null && usageHasQuotas(usage)) billingResetCache.delete(connectionId);
    // Auth failures / missing userId come back as { message } with no quotas.
    // Preserve known cache instead of replacing it with an error response.
    // (A token-billing note message WITH quotas is fine — scan the rows.)
    const quotas = usage?.quotas;
    if (!quotas || Object.keys(quotas).length === 0) return null;

    const resetMs = findExhaustedResetMs(usage);
    if (resetMs == null) {
      // Healthy reading — drop any stale block (quota refilled / new cycle).
      quotaCache.delete(connectionId);
      return quotas;
    }

    const resetAt = new Date(resetMs).toISOString();
    quotaCache.set(connectionId, { remainingPercentage: 0, resetAt });
    return quotas;
  } catch (e: any) {
    log.warn("ZED_QUOTA", `${connectionId.slice(0, 8)} | refresh failed: ${e.message}`);
    return null;
  }
}

/**
 * Handle Zed 402/403/429 — refresh the monthly-quota cache and return the
 * billing-cycle reset when exhausted. Token-spend blocks (403
 * `token_spend_limit_reached`) never match a quota row, so they resolve from
 * the cached billing-cycle reset when it is in the future, else fall through
 * to the capped generic backoff path. Called from the chat error path.
 * @returns resetAt timestamp ms (for resetsAtMs passthrough) or null
 */
export async function handleZedQuotaError(
  connectionId: string,
  status: number,
  model: string,
  accessToken: string,
  providerSpecificData: any,
  errorText?: string,
): Promise<number | null> {
  log.info("ZED_QUOTA", `${connectionId.slice(0, 8)} | ${status} on ${model} — refreshing quota`);

  // Throttled/failed refresh still leaves a known block in cache — read it back.
  await refreshZedQuota(connectionId, accessToken, providerSpecificData);

  if (isZedSpendLimitError(status, errorText ?? "")) {
    const cycleMs = billingResetCache.get(connectionId);
    if (cycleMs != null && cycleMs > Date.now()) {
      const resetAt = new Date(cycleMs).toISOString();
      quotaCache.set(connectionId, { remainingPercentage: 0, resetAt });
      log.warn(
        "ZED_QUOTA",
        `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — token spend limit; CACHE_BLOCK until ${resetAt}`,
      );
      return cycleMs;
    }
    // No usable cycle reset (token billing without a cycle date, or a stale
    // past one): let the caller fall through to generic capped backoff instead
    // of inventing a long block. Past resets are stale — drop them.
    if (cycleMs != null && cycleMs <= Date.now()) billingResetCache.delete(connectionId);
    return null;
  }

  const entry = quotaCache.get(connectionId);
  if (!entry?.resetAt) return null;

  const resetMs = new Date(entry.resetAt).getTime();
  if (!Number.isFinite(resetMs) || resetMs <= Date.now()) {
    quotaCache.delete(connectionId);
    return null;
  }

  log.warn(
    "ZED_QUOTA",
    `${connectionId.slice(0, 8)} | UPSTREAM_${status} ${model} — monthly quota exhausted; CACHE_BLOCK until ${entry.resetAt}`,
  );
  return resetMs;
}
