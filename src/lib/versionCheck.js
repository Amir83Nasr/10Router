// Single source of truth for the dashboard update check (/api/version →
// sidebar VersionLabel). Uses the npm registry — not GitHub tags — so the
// offered version always matches `npm i -g <pkg>@latest`.
import pkg from "../../package.json" with { type: "json" };

const NPM_PKG = pkg.name || "@amir83nasr/10router";
const LATEST_URL = `https://registry.npmjs.org/${NPM_PKG.replace("/", "%2F")}/latest`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Short negative cache so one npm failure (rate limit / no egress on
// docker) doesn't turn every /api/version hit into another upstream call.
const FAIL_TTL_MS = 10 * 60 * 1000;

let cache = { at: 0, latest: null, failAt: -Infinity };

export function normalizeVersion(v) {
  return String(v || "")
    .trim()
    .replace(/^v/i, "");
}

export function compareVersions(a, b) {
  const pa = normalizeVersion(a).split(".");
  const pb = normalizeVersion(b).split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = parseInt(pa[i], 10) || 0;
    const y = parseInt(pb[i], 10) || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  return compareVersions(latest, current) > 0;
}

// Fail-open: any error returns last-known (or null) + a reason — never throws.
export async function getLatestVersion({ fetchFn = fetch, now = Date.now } = {}) {
  if (cache.latest && now() - cache.at < CACHE_TTL_MS)
    return { version: cache.latest, reason: "cache-fresh" };
  if (!cache.latest && now() - cache.failAt < FAIL_TTL_MS)
    return { version: null, reason: "cooldown" };
  try {
    const res = await fetchFn(LATEST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      cache.failAt = now();
      return { version: cache.latest, reason: `npm-${res.status}` };
    }
    const data = await res.json();
    const v = normalizeVersion(data?.version);
    if (!/^\d+\.\d+\.\d+/.test(v)) {
      cache.failAt = now();
      return { version: cache.latest, reason: "no-version" };
    }
    cache = { at: now(), latest: v, failAt: 0 };
    return { version: v, reason: "npm" };
  } catch (err) {
    cache.failAt = now();
    return { version: cache.latest, reason: "fetch-error" };
  }
}

export function __resetVersionCache() {
  cache = { at: 0, latest: null, failAt: -Infinity };
}
