#!/usr/bin/env node
// ── 10ROUTER CLI ────────────────────────────────────────────────────
// Local lifecycle: start/stop/status/logs/open/doctor. No Docker.
// Stdlib only (+ already-installed `open` for the `open` command).

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// ── COMMANDS ────────────────────────────────────────────────────────
async function cmdStart(opts) {
  // npm-installed package has a prebuilt .next — default to prod there.
  const mode = opts.dev && IS_REPO ? "dev" : opts.prod || !IS_REPO ? "prod" : "dev";
  const port = opts.port || (mode === "prod" ? PROD_PORT : DEV_PORT);
  const st = readState();
  if (st && isAlive(st.pid)) {
    console.log(`already running (pid ${st.pid}, ${st.mode} :${st.port})`);
    return;
  }
  if (st) fs.rmSync(PID_FILE, { force: true }); // stale pidfile

  const env = { ...process.env, PORT: String(port), DATA_DIR };
  let cmd, args;
  if (mode === "prod") {
    if (!fs.existsSync(path.join(ROOT, ".next"))) {
      console.error("no .next build found — run `pnpm build` first");
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
    console.log(`[${mode}] ${baseUrl(port)} (foreground, Ctrl+C to stop)`);
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
  console.log(`started ${mode} (pid ${child.pid}) → ${baseUrl(port)}`);
  console.log(`logs: ${LOG_FILE}`);
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
    console.log("not running (no pidfile)");
    return;
  }
  if (!isAlive(st.pid)) {
    fs.rmSync(PID_FILE, { force: true });
    console.log("stale pidfile removed — was not running");
    return;
  }
  killTree(st.pid);
  fs.rmSync(PID_FILE, { force: true });
  console.log(`stopped (was pid ${st.pid}, ${st.mode} :${st.port})`);
}

async function cmdStatus() {
  const st = readState();
  const alive = st ? isAlive(st.pid) : false;
  if (st && !alive) fs.rmSync(PID_FILE, { force: true }); // clean stale
  const port = st?.port || process.env.PORT;
  const ok = port ? await health(port) : false;
  console.log(`running: ${alive ? `yes (pid ${st.pid}, ${st.mode})` : "no"}`);
  console.log(
    port
      ? `health:  ${ok ? `ok ${baseUrl(port)}/api/health` : `down :${port}`}`
      : "health:  — (nothing started, PORT unset)",
  );
  console.log(`data:    ${DATA_DIR}`);
  if (!alive) process.exitCode = 1;
}

function cmdLogs(opts) {
  let text;
  try {
    text = fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    console.log("no logs yet");
    return;
  }
  const lines = text.trimEnd().split("\n");
  const n = opts.n || 50;
  process.stdout.write(lines.slice(-n).join("\n") + "\n");
  if (!opts.follow) return;
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

function cmdDoctor() {
  const fails = [];
  const check = (name, ok, hint = "") => {
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : ` — ${hint}`}`);
    if (!ok) fails.push(name);
  };
  const major = Number(process.versions.node.split(".")[0]);
  check(`node ${process.version}`, major >= 20, "need node >= 20");
  if (IS_REPO) {
    const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
    check(`pnpm ${pnpm.stdout?.trim() || "?"}`, pnpm.status === 0, "need pnpm for dev mode");
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.accessSync(DATA_DIR, fs.constants.W_OK);
    check(`DATA_DIR ${DATA_DIR}`, true);
  } catch {
    check(`DATA_DIR ${DATA_DIR}`, false, "not writable");
  }
  check(
    ".next build (for start --prod)",
    fs.existsSync(path.join(ROOT, ".next")),
    "run pnpm build",
  );
  if (fails.length) process.exitCode = 1;
}

function help() {
  console.log(`10router — local gateway lifecycle (DATA_DIR=${DATA_DIR})

usage: 10router <command> [options]

  start [--prod|--dev] [--port N] [--foreground]  start gateway
                                   (repo default: dev :${DEV_PORT}; npm install: prod :${PROD_PORT})
  stop                                        stop background gateway
  status                                      pid alive? health? paths?
  logs [-n N] [-f]                            tail log (default last 50 lines)
  open [--port N]                             open dashboard in browser
  doctor                                      node/pnpm/DATA_DIR/build checks
  help | --help                               this text
  --version                                   package version

env: DATA_DIR (default ~/.10router), PORT. prod default :${PROD_PORT}.`);
}

// ── ARGS ────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flag = (s, l) => rest.includes(s) || (l && rest.includes(l));
const val = (s, l) => {
  const i = rest.findIndex((a) => a === s || a === l);
  return i >= 0 ? rest[i + 1] : undefined;
};
const opts = {
  prod: flag("--prod"),
  dev: flag("--dev"),
  foreground: flag("--foreground") || flag("--fg"),
  follow: flag("-f", "--follow"),
  port: val("--port", "-p"),
  n: Number(val("-n", "--lines")) || undefined,
};

const run = async () => {
  switch (cmd) {
    case "start":
      return cmdStart(opts);
    case "stop":
      return cmdStop();
    case "status":
      return cmdStatus();
    case "logs":
      return cmdLogs(opts);
    case "open":
      return cmdOpen(opts);
    case "doctor":
      return cmdDoctor();
    case "--version":
    case "version": {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      console.log(pkg.version);
      return;
    }
    default:
      help();
      if (cmd && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
  }
};

run().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
