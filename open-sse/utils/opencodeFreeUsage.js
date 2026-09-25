// Short in-memory backoff for the OpenCode free lane (`Authorization: Bearer public`).
//
// Root cause it addresses: the free lane is one global upstream quota pool behind
// a `noauth` virtual connection, so DB-backed markAccountUnavailable() is a no-op
// for it (early-returns on "noauth") and BaseExecutor never retries 429s. Every
// request during an upstream FreeUsageLimit window therefore burns pool quota and
// surfaces a bare 429. Upstream sends `retry-after` (observed: 34683s) but nothing
// reads it. This module parses it and caps re-hits to ~1/min per model while the
// window lasts. Fail-open: any parse error means "no breaker", never throw.

export const FREE_USAGE_BREAKER_MAX_MS = 60 * 1000;
export const FREE_USAGE_BREAKER_DEFAULT_MS = 30 * 1000;

const breaker = new Map(); // key -> untilMs

function humanMs(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// retry-after is delta-seconds or an HTTP date.
export function parseRetryAfterMs(value) {
  if (value == null || value === "") return null;
  const secs = parseInt(String(value).trim(), 10);
  if (!Number.isNaN(secs) && secs > 0 && String(secs) === String(value).trim()) return secs * 1000;
  const date = new Date(String(value).trim());
  if (!Number.isNaN(date.getTime())) {
    const diff = date.getTime() - Date.now();
    return diff > 0 ? diff : null;
  }
  return null;
}

// Returns { status, message, resetsAtMs } for FreeUsageLimit 429s, else null so
// callers fall through to the default parser.
export function parseFreeUsageError(response, bodyText) {
  try {
    if (!response || response.status !== 429) return null;
    let type = "";
    let msg = "";
    try {
      const json = JSON.parse(bodyText || "{}");
      const err = json?.error && typeof json.error === "object" ? json.error : null;
      type = err?.type || json?.type || "";
      msg = err?.message || json?.message || "";
    } catch {
      msg = bodyText || "";
    }
    const str = typeof msg === "string" ? msg : JSON.stringify(msg);
    if (type !== "FreeUsageLimitError" && !/rate limit/i.test(str)) return null;
    const retryMs = parseRetryAfterMs(response.headers?.get?.("retry-after"));
    const resetsAtMs = retryMs ? Date.now() + retryMs : null;
    const hint = retryMs ? ` (retry after ${humanMs(retryMs)})` : "";
    return {
      status: 429,
      message: `OpenCode free-tier quota exhausted upstream${hint}: ${str || "Rate limit exceeded"}`,
      resetsAtMs,
    };
  } catch {
    return null; // fail-open
  }
}

// Remaining cooldown for key, or 0. Lazily evicts expired entries.
export function freeUsageRemainingMs(key) {
  const until = breaker.get(key);
  if (!until) return 0;
  const left = until - Date.now();
  if (left <= 0) {
    breaker.delete(key);
    return 0;
  }
  return left;
}

// Record a cooldown, capped at MAX so a 9h upstream retry-after never locks a
// user out locally for hours when the pool demonstrably recovers in seconds.
export function recordFreeUsage(key, cooldownMs) {
  const ms = Math.min(
    Math.max(1, cooldownMs || FREE_USAGE_BREAKER_DEFAULT_MS),
    FREE_USAGE_BREAKER_MAX_MS,
  );
  breaker.set(key, Date.now() + ms);
}

export function clearFreeUsageBreaker() {
  breaker.clear();
}

// A 200 proves the upstream window closed — lift the local backoff now.
export function freeUsageClearMs(key) {
  breaker.delete(key);
}

// Local 429 shaped like the upstream one so downstream parsing stays identical.
export function syntheticFreeUsageResponse(remainingMs) {
  const secs = Math.max(1, Math.ceil(remainingMs / 1000));
  return new Response(
    JSON.stringify({
      type: "error",
      error: {
        type: "FreeUsageLimitError",
        message: `Rate limit exceeded. Please try again later. (local backoff, retry after ${humanMs(remainingMs)})`,
      },
      metadata: {},
    }),
    {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(secs) },
    },
  );
}
