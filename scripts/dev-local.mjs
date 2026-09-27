import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Dev launcher: sets PORT/DATA_DIR from .env then delegates to the real
// CLI (bin/10router.mjs), so `pnpm dev <command>` behaves exactly like the
// published npm package. Args pass through verbatim — use the CLI's own
// flags (e.g. `pnpm dev start --port 20128`). Bare `pnpm dev` shows help.
// Precedence: CLI flags/real env > .env.local > .env > default.
// Usage: pnpm dev [start|stop|status|logs|open|--help] [options]
// Dev shows the prod update notice by default (bare `--update-preview` → 9.9.9).
// Pass your own `--update-preview X.Y.Z` for a custom version, or
// `--no-update-check` to silence it.

const ROOT = process.cwd();
const args = process.argv.slice(2);

// Dev preview of the prod update notice (never published behavior —
// bin/10router.mjs stays silent in-repo without this flag).
const previewArgs =
  args.includes("--update-preview") || args.includes("--no-update-check")
    ? args
    : [...args, "--update-preview"];

// Minimal .env reader (stdlib only) — the wrapper needs values before spawn.
function loadEnvFiles() {
  const out = {};
  for (const f of [".env", ".env.local"]) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if (
        v.length > 1 &&
        ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))
      )
        v = v.slice(1, -1);
      out[m[1]] = v;
    }
  }
  return out;
}

const file = loadEnvFiles();
const pick = (k) => process.env[k] || file[k] || "";
const expand = (p) => (p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p);

const val = (s, l) => {
  const i = args.findIndex((a) => a === s || a === l);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = val("--port", "-p") || pick("DEV_PORT") || "20127";
const rawDir = pick("DEV_DATA_DIR");
const dataDir = rawDir ? expand(rawDir) : path.join(os.homedir(), ".10router-dev");
const baseUrl = `http://localhost:${port}`;

console.log(`[dev] port=${port} DATA_DIR=${dataDir}`);

const previewEnv = { ...process.env };
if (previewArgs.includes("--update-preview")) {
  // Preview the prod notice exactly as an npm user sees it (pnpm itself
  // sets npm_config_user_agent=pnpm/…, which would render the pnpm variant).
  previewEnv.npm_config_user_agent = `npm/11.0.0 node/v${process.versions.node}`;
}

const child = spawn(process.execPath, [path.join(ROOT, "bin", "10router.mjs"), ...previewArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...previewEnv,
    PORT: port,
    DATA_DIR: dataDir,
    BASE_URL: baseUrl,
    NEXT_PUBLIC_BASE_URL: baseUrl,
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
