#!/usr/bin/env node
// ── UPDATE NOTICE TEST ──────────────────────────────────────────
// Simulates an npm-installed CLI (no pnpm-lock.yaml) with a fake
// old version + fresh cache, so the update notice shows without
// network. Usage: pnpm test:update [--latest 9.9.9] [--current 0.0.1]
//   [--ua pnpm|npm] [-- <cli args...>]

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const val = (s) => {
  const i = argv.indexOf(s);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dash = argv.indexOf("--");
const cliArgs = dash >= 0 ? argv.slice(dash + 1) : ["status"];

const latest = val("--latest") || "9.9.9";
const current = val("--current") || "0.0.1";
const ua = val("--ua") || "pnpm";

const box = fs.mkdtempSync(path.join(os.tmpdir(), "10router-upd-"));
const dataDir = path.join(box, "data");
fs.mkdirSync(path.join(box, "bin"), { recursive: true });
for (const f of ["10router.mjs", "update-check.mjs"])
  fs.copyFileSync(path.join(ROOT, "bin", f), path.join(box, "bin", f));
fs.writeFileSync(
  path.join(box, "package.json"),
  JSON.stringify({ name: "@amir83nasr/10router", version: current }),
);
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(
  path.join(dataDir, "update-check.json"),
  JSON.stringify({ latest, checkedAt: Date.now() }),
);
// Link real deps so the sandbox resolves imports like an npm install.
fs.mkdirSync(path.join(box, "node_modules"), { recursive: true });
for (const dep of ["chalk"]) {
  const src = path.join(ROOT, "node_modules", dep);
  const dst = path.join(box, "node_modules", dep);
  try {
    fs.symlinkSync(src, dst, "dir");
  } catch {
    /* best-effort */
  }
}

console.log(`[test:update] ${current} → ${latest} (ua=${ua}) box=${box}`);
const env = { ...process.env, DATA_DIR: dataDir };
if (ua === "npm") env.npm_config_user_agent = "npm/11.0.0 node/v22.0.0";
else env.npm_config_user_agent = "pnpm/10.0.0 node/v22.0.0";
const r = spawnSync(process.execPath, [path.join(box, "bin", "10router.mjs"), ...cliArgs], {
  stdio: "inherit",
  env,
});
console.log(`[test:update] cleanup: rm -rf ${box}`);
process.exit(r.status ?? 0);
