import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Pre-publish npm-package test (stdlib only):
// build → pack → `npm install` tarball into a sandbox (no pnpm-lock.yaml,
// so bin/10router.mjs runs in npm/prod mode like a real user) → foreground
// run on the same port + DATA_DIR as `pnpm dev` (20127, ~/.10router-dev).
// Usage: pnpm pkg:test [--port N] [--data-dir PATH] [--skip-build]

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const val = (s, l) => {
  const i = argv.findIndex((a) => a === s || a === l);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (s) => argv.includes(s);

if (flag("--help") || flag("-h")) {
  console.log(`usage: pnpm pkg:test [--port N] [--data-dir PATH] [--skip-build]

  --port N        gateway port (default 20127, same as pnpm dev)
  --data-dir PATH isolated DATA_DIR (default ~/.10router-dev)
  --skip-build    reuse existing .next build + tarball`);
  process.exit(0);
}

const port = val("--port", "-p") || "20127";
const dataDir = val("--data-dir") || path.join(os.homedir(), ".10router-dev");
const sandbox = path.join(os.tmpdir(), "10router-pkg-test");
const shell = process.platform === "win32";

// Minimal .env reader — forward secrets so dashboard login matches dev.
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
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return out;
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

const newestTarball = () =>
  fs
    .readdirSync(ROOT)
    .filter((f) => f.endsWith(".tgz"))
    .map((f) => ({ f, t: fs.statSync(path.join(ROOT, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]?.f;

if (!flag("--skip-build")) {
  console.log("[pkg:test] build…");
  run("pnpm", ["build"]);
  console.log("[pkg:test] pack…");
  run("pnpm", ["pack"]);
}

const tgz = newestTarball();
if (!tgz) {
  console.error("[pkg:test] no .tgz found — run without --skip-build first");
  process.exit(1);
}

console.log("[pkg:test] sandbox install…");
fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });
fs.writeFileSync(
  path.join(sandbox, "package.json"),
  JSON.stringify({ name: "pkg-test", private: true }),
);
run("npm", ["install", "--no-audit", "--no-fund", path.join(ROOT, tgz)], {
  cwd: sandbox,
});
fs.rmSync(path.join(ROOT, tgz)); // keep repo clean

const pkgDir = path.join(sandbox, "node_modules", "@amir83nasr", "10router");
if (fs.existsSync(path.join(pkgDir, "pnpm-lock.yaml"))) {
  console.error("[pkg:test] sandbox looks like a repo checkout — abort");
  process.exit(1);
}

const file = loadEnvFiles();
const env = {
  ...process.env,
  DATA_DIR: dataDir,
  JWT_SECRET: process.env.JWT_SECRET || file.JWT_SECRET || crypto.randomBytes(32).toString("hex"),
  ...(process.env.INITIAL_PASSWORD || file.INITIAL_PASSWORD
    ? { INITIAL_PASSWORD: process.env.INITIAL_PASSWORD || file.INITIAL_PASSWORD }
    : {}),
};

console.log(`[pkg:test] DATA_DIR=${dataDir} port=${port} sandbox=${sandbox}`);
console.log(`[pkg:test] dashboard → http://localhost:${port}/dashboard/cli-tools`);
console.log("[pkg:test] foreground run (Ctrl+C to stop), cleanup: rm -rf sandbox + DATA_DIR");
spawn(
  process.execPath,
  [path.join(pkgDir, "bin", "10router.mjs"), "start", "--foreground", "--port", port],
  {
    stdio: "inherit",
    cwd: sandbox,
    env,
  },
).on("exit", (code) => process.exit(code ?? 0));
