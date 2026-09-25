import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Shared launcher for `pnpm dev` (main) and `pnpm dev:ui` (isolated UI test
// with its own port + DATA_DIR so the real ~/.10router DB is never touched).
// Ports/dirs come from .env — see DEV_* in .env.example. Precedence:
// CLI args > real env > .env.local > .env > default.
// Usage: pnpm dev [port] [dataDir] | pnpm dev:ui [port] [dataDir]

const isUi = process.argv.includes("--ui");
const args = process.argv.slice(2).filter((a) => a !== "--ui");
const tag = isUi ? "dev:ui" : "dev";

// Minimal .env reader (stdlib only) — the wrapper needs values before spawn.
function loadEnvFiles() {
  const out = {};
  for (const f of [".env", ".env.local"]) {
    let text;
    try {
      text = fs.readFileSync(path.join(process.cwd(), f), "utf8");
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

const port = args[0] || pick(isUi ? "DEV_UI_PORT" : "DEV_PORT") || (isUi ? "20129" : "20127");
const rawDir = args[1] || pick(isUi ? "DEV_UI_DATA_DIR" : "DEV_DATA_DIR");
const dataDir = rawDir ? expand(rawDir) : isUi ? path.join(os.homedir(), ".10router-dev") : "";
const baseUrl = `http://localhost:${port}`;

console.log(`[${tag}] port=${port} DATA_DIR=${dataDir || "~/.10router (default)"}`);

const child = spawn("pnpm", ["exec", "next", "dev", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    PORT: port,
    ...(dataDir ? { DATA_DIR: dataDir } : {}),
    // Separate distDir: Next dev lockfile lives in distDir, so a second
    // dev server in the same repo refuses to start without this.
    ...(isUi
      ? { NEXT_DIST_DIR: ".next-dev-ui", BASE_URL: baseUrl, NEXT_PUBLIC_BASE_URL: baseUrl }
      : {}),
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
