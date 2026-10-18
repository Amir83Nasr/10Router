#!/usr/bin/env node
// ── UPDATE CHECK ────────────────────────────────────────────────────
// Fail-open latest-version notice for npm-installed CLI. Stdlib only,
// side-effect-free (no top-level run) so tests can import it.

import fs from "node:fs";
import path from "node:path";

// Short TTL on purpose: the check runs on every CLI invocation, so a new
// publish must be detected promptly. A 24h cache froze `latest` across
// same-day releases and the notice never fired. At most one registry GET
// per hour of CLI use; offline stays fail-open via stale-cache fallback.
export const UPDATE_TTL = 3600 * 1000;

// The registry resolves to both A and AAAA records. On networks that drop
// IPv6 silently, Node's first connection attempt blackholes for ~10s before
// Happy Eyeballs falls back to IPv4, so a cold check routinely needs 2-14s.
// The old 3s budget aborted nearly every check on such links (measured 5/8),
// and the failure then re-served the stale version — so 0.1.10 never showed.
// 10s measured 8/8 here; FAIL_TTL bounds what a genuinely offline run costs.
const FETCH_TIMEOUT_MS = 10000;

// A failed check is remembered, so a bad network costs one stall per window
// instead of one per invocation. Mirrors FAIL_TTL_MS in src/lib/versionCheck.js.
export const FAIL_TTL = 10 * 60 * 1000;

export function cmpVer(a, b) {
  const pa = String(a).replace(/^v/, "").split("-")[0].split(".").map(Number);
  const pb = String(b).replace(/^v/, "").split("-")[0].split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  // numeric tie: prerelease < release (1.0.0-alpha < 1.0.0)
  const preA = String(a).includes("-") ? 0 : 1;
  const preB = String(b).includes("-") ? 0 : 1;
  return preA === preB ? 0 : preA < preB ? -1 : 1;
}

export async function fetchLatest(pkgName, fetchFn = fetch) {
  try {
    const r = await fetchFn(`https://registry.npmjs.org/${pkgName.replace("/", "%2F")}/latest`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return null;
    return (await r.json())?.version || null;
  } catch {
    return null; // offline → silent
  }
}

// Returns the notice string, or null when silent. Never throws.
export async function checkUpdate({
  root,
  dataDir,
  isRepo,
  argv = [],
  env = process.env,
  fetchFn = fetch,
  now = Date.now(),
  previewLatest = null,
} = {}) {
  try {
    // previewLatest: dev-only escape hatch (`--update-preview X.Y.Z`) to see
    // the prod notice without network. Still gated by the same opt-outs.
    if (argv.includes("--no-update-check")) return null;
    if (env.NO_UPDATE_CHECK === "1" || env.CI) return null;
    if (!previewLatest && isRepo) return null;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    } catch {
      return null;
    }
    if (!pkg?.name || !pkg?.version) return null;
    const cacheFile = path.join(dataDir, "update-check.json");
    let cached = null;
    try {
      cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } catch {
      /* no cache */
    }
    let latest = previewLatest;
    if (!latest) {
      latest = cached?.latest && now - (cached.checkedAt || 0) < UPDATE_TTL ? cached.latest : null;
    }
    if (!latest) {
      // A recent failure means the registry was unreachable: re-fetching would
      // re-pay the full timeout stall on every invocation. Serve stale instead.
      const cooling = now - (cached?.failedAt || 0) < FAIL_TTL;
      latest = cooling ? cached?.latest || null : await fetchLatest(pkg.name, fetchFn);
      if (!cooling) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(
            cacheFile,
            // On failure keep the last-known version but mark it stale, so the
            // notice still fires from cache while the fetch is in cooldown.
            latest
              ? JSON.stringify({ latest, checkedAt: now })
              : JSON.stringify({ latest: cached?.latest || null, checkedAt: 0, failedAt: now }),
          );
        } catch {
          /* cache best-effort */
        }
      }
      if (!latest) latest = cached?.latest || null; // stale cache beats silence
    }
    if (!latest || cmpVer(pkg.version, latest) >= 0) return null;
    const ua = env.npm_config_user_agent || "";
    const install = ua.startsWith("pnpm")
      ? `pnpm add -g ${pkg.name}@latest`
      : `npm install -g ${pkg.name}@latest`;
    // stop first: upgrade replaces running code — stop is idempotent when idle.
    // ponytail: single stop+install line; split per-status messaging when needed.
    return `\nUpdate available: ${pkg.version} → ${latest}\n  10router stop; ${install}\n`;
  } catch {
    return null; // fail-open: update notice never breaks the CLI
  }
}
