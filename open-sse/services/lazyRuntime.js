// Lazy loader for heavy optional runtime deps (playwright-core, wreq-js).
//
// They are devDependencies only, so end-user installs stay small. On first
// use the package is downloaded into <DATA_DIR>/runtime and imported from there.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getWritableDataDir } from "../utils/writableDataDir.js";

const LAZY_DEP_VERSIONS = {
  "playwright-core": "^1.62.1",
  "wreq-js": "^3.2.0",
};

function getRuntimeDir() {
  return path.join(getWritableDataDir(), "runtime");
}

let createRequirePromise;
function getCreateRequire() {
  createRequirePromise ??= import(/* webpackIgnore: true */ "node:module").then(
    (mod) => mod.createRequire,
  );
  return createRequirePromise;
}

function isModuleMissing(error) {
  const code = String(error?.code || "");
  return code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND";
}

function npmInstall(pkg, version) {
  const cwd = getRuntimeDir();
  fs.mkdirSync(cwd, { recursive: true });
  const manifest = path.join(cwd, "package.json");
  if (!fs.existsSync(manifest)) {
    fs.writeFileSync(
      manifest,
      JSON.stringify({ name: "10router-runtime", private: true }, null, 2),
    );
  }
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["install", "--no-audit", "--no-fund", "--prefer-online", `${pkg}@${version}`];
  return new Promise((resolve) => {
    const child = spawn(npm, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => resolve({ ok: false, stderr: String(error.message || error) }));
    child.on("close", (status) => resolve({ ok: status === 0, stderr }));
  });
}

async function installIntoRuntime(pkg, version) {
  const res = await npmInstall(pkg, version);
  if (!res.ok) {
    const reason =
      (res.stderr.match(/npm ERR! ?(.+)/) || [])[1] ||
      res.stderr.split("\n").filter(Boolean).pop() ||
      "unknown npm error";
    throw new Error(
      `${pkg} is missing and the on-demand install failed (${String(reason).slice(0, 160)}) — ` +
        `install it manually: cd "${getRuntimeDir()}" && npm install ${pkg}@${version}`,
    );
  }
}

const inflight = new Map();

async function load(pkg) {
  try {
    return await import(/* webpackIgnore: true */ pkg);
  } catch (error) {
    if (!isModuleMissing(error)) throw error;
  }
  const createRequire = await getCreateRequire();
  const runtimeRequire = createRequire(path.join(getRuntimeDir(), "package.json"));
  try {
    return await import(/* webpackIgnore: true */ pathToFileURL(runtimeRequire.resolve(pkg)).href);
  } catch (error) {
    if (!isModuleMissing(error)) throw error;
  }
  const version = LAZY_DEP_VERSIONS[pkg] || "latest";
  await installIntoRuntime(pkg, version);
  try {
    return await import(/* webpackIgnore: true */ pathToFileURL(runtimeRequire.resolve(pkg)).href);
  } catch (error) {
    if (!isModuleMissing(error)) throw error;
    fs.rmSync(path.join(getRuntimeDir(), "node_modules", pkg), { recursive: true, force: true });
    await installIntoRuntime(pkg, version);
    return import(/* webpackIgnore: true */ pathToFileURL(runtimeRequire.resolve(pkg)).href);
  }
}

export function loadRuntimeDep(pkg) {
  if (!inflight.has(pkg)) {
    inflight.set(
      pkg,
      load(pkg).finally(() => inflight.delete(pkg)),
    );
  }
  return inflight.get(pkg);
}
