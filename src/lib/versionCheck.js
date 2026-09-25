const REPO = "Amir83Nasr/10Router";
const TAGS_URL = `https://api.github.com/repos/${REPO}/tags?per_page=100`;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Short negative cache so one GitHub failure (rate limit / no egress on
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
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "10router" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetchFn(TAGS_URL, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      cache.failAt = now();
      return { version: cache.latest, reason: `github-${res.status}` };
    }
    const tags = await res.json();
    let best = null;
    for (const t of Array.isArray(tags) ? tags : []) {
      const v = normalizeVersion(t?.name);
      if (/^\d+\.\d+\.\d+/.test(v) && (!best || compareVersions(v, best) > 0)) best = v;
    }
    if (best) cache = { at: now(), latest: best, failAt: 0 };
    return { version: cache.latest, reason: best ? "github" : "no-tags" };
  } catch (err) {
    cache.failAt = now();
    return { version: cache.latest, reason: "fetch-error" };
  }
}

export function __resetVersionCache() {
  cache = { at: 0, latest: null, failAt: -Infinity };
}
