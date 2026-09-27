#!/usr/bin/env node
// ── UPDATE CHECK ────────────────────────────────────────────────────
// Fail-open latest-version notice for npm-installed CLI. Stdlib only,
// side-effect-free (no top-level run) so tests can import it.

import fs from "node:fs";
import path from "node:path";

export const UPDATE_TTL = 24 * 3600 * 1000;

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
      signal: AbortSignal.timeout(3000),
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
      latest = await fetchLatest(pkg.name, fetchFn);
      if (latest) {
        try {
          fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(cacheFile, JSON.stringify({ latest, checkedAt: now }));
        } catch {
          /* cache best-effort */
        }
      } else latest = cached?.latest || null; // stale cache beats silence
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
