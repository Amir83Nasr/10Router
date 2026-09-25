import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── CONTAINER DETECTION ──────────────────────────────────────────────
// Best-effort check whether the server runs inside a container (Docker /
// Podman / k8s). Fail-open: any error returns false so local dev is
// unaffected. CLI-tool detection reads the *server's* home dir, which
// inside a container is not the user's home — callers use this flag to
// say "manual setup" instead of "not installed".
export function isContainer() {
  try {
    if (fs.existsSync("/.dockerenv")) return true;
    const cgroup = fs.readFileSync("/proc/1/cgroup", "utf-8");
    return /docker|kubepods|containerd/i.test(cgroup);
  } catch {
    return false;
  }
}

// ── HOST HOME ────────────────────────────────────────────────────────
// When running in Docker, the host home can be bind-mounted into the
// container (e.g. `$HOME:/host-home:rw` + `HOST_HOME=/host-home`).
// CLI-tool paths must resolve against it, not the container's own home.
export function hostHome() {
  const h = (process.env.HOST_HOME || "").trim();
  if (h) {
    try {
      if (fs.existsSync(h)) return h;
    } catch {
      /* fall through to os.homedir() */
    }
  }
  return os.homedir();
}

export function hasHostHome() {
  const h = (process.env.HOST_HOME || "").trim();
  if (!h) return false;
  try {
    return fs.existsSync(h);
  } catch {
    return false;
  }
}

// Cross-platform candidate dirs for a tool config living directly under a
// home dir (e.g. `.claude`, `.codex`). The container always reports linux,
// while the host may be macOS/Windows — so check every platform layout.
export function homeCandidates(home, ...segments) {
  const out = [path.join(home, ...segments)];
  const [first, ...rest] = segments;
  if (first === ".config") {
    // macOS: ~/Library/Application Support/<name>
    out.push(path.join(home, "Library", "Application Support", ...rest));
    // Windows: %LOCALAPPDATA%/<name>, %APPDATA%/<name>
    const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    const roaming = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    out.push(path.join(local, ...rest), path.join(roaming, ...rest));
  }
  return out;
}
