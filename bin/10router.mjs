#!/usr/bin/env node
// ── 10ROUTER CLI ────────────────────────────────────────────────────
// Local lifecycle: start/stop/status/logs/open. No Docker.
// Stdlib + already-installed `chalk` (colors, NO_COLOR-aware) and `open`.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkUpdate } from "./update-check.mjs";
import chalk from "chalk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEV_PORT = "20127";
const PROD_PORT = "20128";
// Repo checkout (pnpm-lock) → dev workflow; npm-installed package → prod only.
const IS_REPO = fs.existsSync(path.join(ROOT, "pnpm-lock.yaml"));

// ── DATA DIR (mirrors src/lib/dataDir.js, sync version) ─────────────
function getDataDir() {
  const configured = process.env.DATA_DIR;
  const fallback = path.join(os.homedir(), ".10router");
  if (!configured) return fallback;
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch {
    return fallback;
  }
}

const DATA_DIR = getDataDir();
const PID_FILE = path.join(DATA_DIR, "10router.pid");
const LOG_FILE = path.join(DATA_DIR, "10router.log");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(PID_FILE, "utf8"));
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function baseUrl(port) {
  return `http://localhost:${port}`;
}

async function health(port) {
  try {
    const r = await fetch(`${baseUrl(port)}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ── UPDATE CHECK (npm mode only, fail-open, cached) ───────────────
// Logic lives in ./update-check.mjs (side-effect-free, testable).

// ── COMMANDS ────────────────────────────────────────────────────────
async function cmdStart(opts) {
  // npm-installed package has a prebuilt .next — always prod there.
  const mode = IS_REPO ? "dev" : "prod";
  const port = opts.port || (mode === "prod" ? PROD_PORT : DEV_PORT);
  const st = readState();
  if (st && isAlive(st.pid)) {
    console.log(chalk.yellow(`already running (pid ${st.pid}, ${st.mode} :${st.port})`));
    return;
  }
  if (st) fs.rmSync(PID_FILE, { force: true }); // stale pidfile

  const env = { ...process.env, PORT: String(port), DATA_DIR };
  let cmd, args;
  if (mode === "prod") {
    if (!fs.existsSync(path.join(ROOT, ".next"))) {
      console.error(chalk.red("no .next build found — run `pnpm build` first"));
      process.exitCode = 1;
      return;
    }
    cmd = process.execPath;
    args = [path.join(ROOT, "custom-server.js"), "--port", String(port)];
  } else {
    // Repo-only dev mode (IS_REPO) — pnpm is the repo's package manager.
    cmd = "pnpm";
    args = ["exec", "next", "dev", "--port", String(port)];
  }

  if (opts.foreground) {
    console.log(chalk.green(`[${mode}] ${baseUrl(port)} (foreground, Ctrl+C to stop)`));
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", env });
    const stop = () => child.kill();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const logFd = fs.openSync(LOG_FILE, "a");
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ["ignore", logFd, logFd],
    env,
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
  });
  child.unref();
  fs.writeFileSync(
    PID_FILE,
    JSON.stringify({ pid: child.pid, port: String(port), mode, startedAt: Date.now() }),
  );
  console.log(chalk.green(`started ${mode} (pid ${child.pid}) → ${baseUrl(port)}`));
  console.log(chalk.dim(`logs: ${LOG_FILE}`));
}

function killTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM"); // process group (dev spawns pnpm→next)
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already dead */
      }
    }
  }
}

function cmdStop() {
  const st = readState();
  if (!st) {
    console.log(chalk.yellow("not running (no pidfile)"));
    return;
  }
  if (!isAlive(st.pid)) {
    fs.rmSync(PID_FILE, { force: true });
    console.log(chalk.yellow("stale pidfile removed — was not running"));
    return;
  }
  killTree(st.pid);
  fs.rmSync(PID_FILE, { force: true });
  console.log(chalk.green(`stopped (was pid ${st.pid}, ${st.mode} :${st.port})`));
}

async function cmdStatus() {
  const st = readState();
  const alive = st ? isAlive(st.pid) : false;
  if (st && !alive) fs.rmSync(PID_FILE, { force: true }); // clean stale
  const port = st?.port || process.env.PORT;
  const ok = port ? await health(port) : false;
  console.log(
    `running: ${alive ? chalk.green(`yes (pid ${st.pid}, ${st.mode})`) : chalk.red("no")}`,
  );
  console.log(
    port
      ? `health:  ${ok ? chalk.green(`ok ${baseUrl(port)}/api/health`) : chalk.red(`down :${port}`)}`
      : `health:  ${chalk.dim("— (nothing started, PORT unset)")}`,
  );
  console.log(`data:    ${chalk.dim(DATA_DIR)}`);
  if (!alive) process.exitCode = 1;
}

function cmdLogs() {
  let text;
  try {
    text = fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    console.log("no logs yet");
    return;
  }
  const lines = text.trimEnd().split("\n");
  process.stdout.write(lines.slice(-50).join("\n") + "\n");
  // follow: poll for appended bytes (cross-platform, no `tail` dep)
  let pos = fs.statSync(LOG_FILE).size;
  const timer = setInterval(() => {
    const size = fs.statSync(LOG_FILE).size;
    if (size > pos) {
      const fd = fs.openSync(LOG_FILE, "r");
      const buf = Buffer.alloc(size - pos);
      fs.readSync(fd, buf, 0, buf.length, pos);
      fs.closeSync(fd);
      process.stdout.write(buf.toString());
      pos = size;
    }
  }, 500);
  process.once("SIGINT", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

async function cmdOpen(opts) {
  const st = readState();
  const port = opts.port || st?.port || process.env.PORT || PROD_PORT;
  const url = `${baseUrl(port)}/dashboard`;
  const { default: open } = await import("open");
  await open(url);
  console.log(url);
}

function help() {
  const H = chalk.green;
  const C = chalk.blue;
  console.log(`${H.bold("10router")} ${chalk.dim(`— local gateway lifecycle (DATA_DIR=${DATA_DIR})`)}

${H("Usage:")} 10router [OPTIONS] <COMMAND>

${H("Commands:")}
  ${C("start")}   Start gateway
  ${C("stop")}    Stop background gateway
  ${C("status")}  Show pid, health and paths
  ${C("logs")}    Tail log (follows)
  ${C("open")}    Open dashboard in browser

${H("Options:")}
  ${C("-p, --port <N>")}    Gateway port (default :${PROD_PORT})
  ${C("    --foreground")}  Run in foreground (Ctrl+C to stop)
  ${C("-h, --help")}        Show this help
  ${C("-V, --version")}     Show package version`);
}

// ── ARGS ────────────────────────────────────────────────────────────
const _all = process.argv.slice(2);
// Strip --update-preview [ver] before command dispatch (dev preview only).
const _pv = _all.indexOf("--update-preview");
const _args =
  _pv >= 0 && _all[_pv + 1] && /^[v\d]/.test(_all[_pv + 1])
    ? [..._all.slice(0, _pv), ..._all.slice(_pv + 2)]
    : _pv >= 0
      ? [..._all.slice(0, _pv), ..._all.slice(_pv + 1)]
      : _all;
const [cmd, ...rest] = _args;
const flag = (s, l) => rest.includes(s) || (l && rest.includes(l));
const val = (s, l) => {
  const i = rest.findIndex((a) => a === s || a === l);
  return i >= 0 ? rest[i + 1] : undefined;
};
const opts = {
  foreground: flag("--foreground") || flag("--fg"),
  port: val("--port", "-p"),
};

const run = async () => {
  // Update notice: stderr only (stdout stays pipeable), fail-open, npm-only.
  // Dev preview: `--update-preview [ver] <cmd>` shows the prod notice in-repo.
  const previewIdx = _all.indexOf("--update-preview");
  const previewArg = previewIdx >= 0 ? _all[previewIdx + 1] : null;
  const previewLatest =
    previewIdx >= 0 ? (previewArg && /^[v\d]/.test(previewArg) ? previewArg : "9.9.9") : null;
  const notice = await checkUpdate({
    root: ROOT,
    dataDir: DATA_DIR,
    isRepo: IS_REPO,
    argv: rest,
    previewLatest,
  });
  if (notice) console.error(chalk.yellow.bold(notice));
  switch (cmd) {
    case "start":
      return cmdStart(opts);
    case "stop":
      return cmdStop();
    case "status":
      return cmdStatus();
    case "logs":
      return cmdLogs();
    case "open":
      return cmdOpen(opts);
    case "-h":
    case "--help":
    case "help":
      return help();
    case "-V":
    case "--version": {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      console.log(pkg.version);
      return;
    }
    default:
      help();
      if (cmd) process.exitCode = 1;
  }
};

run().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
