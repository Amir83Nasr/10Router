import fs from "node:fs";
import path from "path";
import os from "os";

const APP_NAME = "10router";
const LEGACY_APP_NAME = "9router";

function legacyDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      LEGACY_APP_NAME,
    );
  }
  return path.join(os.homedir(), `.${LEGACY_APP_NAME}`);
}

function isEmptyDir(dir) {
  try {
    return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}

// One-time migration: copy existing 9router data into the new 10router dir.
function migrateLegacyDir() {
  const next = defaultDir();
  const prev = legacyDir();
  if (next === prev || !isEmptyDir(next)) return;
  try {
    if (!fs.existsSync(prev) || isEmptyDir(prev)) return;
    fs.mkdirSync(next, { recursive: true });
    fs.cpSync(prev, next, { recursive: true, force: false, errorOnExist: false });
  } catch (e) {
    console.warn(
      `[DATA_DIR] legacy migrate ~/.${LEGACY_APP_NAME} → ~/.${APP_NAME} failed: ${e?.message || e}`,
    );
  }
}

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APP_NAME,
    );
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) {
    migrateLegacyDir();
    return defaultDir();
  }

  // On Windows, ignore Unix-style absolute paths (e.g. /var/lib/...) that come
  // from a Linux-targeted .env or Docker config — they are not valid here.
  if (process.platform === "win32" && /^\//.test(configured)) {
    console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows → fallback to default`);
    return defaultDir();
  }

  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    throw e;
  }
}

export const DATA_DIR = getDataDir();
