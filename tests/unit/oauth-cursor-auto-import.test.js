import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fsPromises from "fs/promises";
import { execFile } from "child_process";
import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { tmpdir as realTmpdir } from "node:os";

// Mock next/server
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => ({
      status: init?.status || 200,
      body,
      json: async () => body,
    })),
  },
}));

// homedir is rewired per-test via globalThis.__mockHome: tmp dirs for
// extraction tests, /mock/home for path-probing tests.
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal("os");
  const homedir = () => globalThis.__mockHome ?? "/mock/home";
  return { ...actual, default: { ...actual.default, homedir }, homedir };
});

// Mock fs/promises access for path-probing tests; restored to real fs
// for extraction tests that use a real temp sqlite db.
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  constants: { R_OK: 4 },
}));

// Mock child_process execFile (sqlite3 CLI fallback + `which cursor` check)
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

const realAccess = async (path, mode) => (await vi.importActual("fs/promises")).access(path, mode);

async function seedStateDb(dbPath, rows) {
  mkdirSync(dirname(dbPath), { recursive: true });
  // node:sqlite (built-in, no native binding) — better-sqlite3 crashes workers on Node >= 24.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE IF NOT EXISTS itemTable (key TEXT PRIMARY KEY, value TEXT)");
  const stmt = db.prepare("INSERT OR REPLACE INTO itemTable (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(rows)) stmt.run(key, value);
  db.close();
}

function darwinDbPath(home) {
  return join(home, "Library/Application Support/Cursor/User/globalStorage/state.vscdb");
}

// We need to dynamically import after mocks are registered
let GET;
const tmpDirs = [];

describe("GET /api/oauth/cursor/auto-import", () => {
  const originalPlatform = process.platform;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    globalThis.__mockHome = "/mock/home";
    vi.mocked(execFile).mockImplementation((cmd, args, opts, cb) => {
      const callback = typeof opts === "function" ? opts : cb;
      callback(new Error(`${cmd} not available`));
    });
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    // Force darwin so macOS-specific logic is exercised
    Object.defineProperty(process, "platform", { value: "darwin", writable: true });
    // Re-import to pick up fresh mocks each run
    const mod = await import("../../src/app/api/oauth/cursor/auto-import/route.js");
    GET = mod.GET;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
    globalThis.__mockHome = "/mock/home";
    for (const dir of tmpDirs.splice(0)) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  // Extraction tests use a real temp sqlite db + real fs access, since the
  // route loads better-sqlite3 via require() (not vi.mock-able) and
  // child_process is ESM-imported.
  async function useTempDb(rows) {
    const dir = mkdtempSync(join(realTmpdir(), "cursor-auto-import-"));
    tmpDirs.push(dir);
    globalThis.__mockHome = dir;
    vi.mocked(fsPromises.access).mockImplementation(realAccess);
    await seedStateDb(darwinDbPath(dir), rows);
  }

  // ── macOS path probing ────────────────────────────────────────────────

  it("returns not-found when no macOS cursor db paths are accessible", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found. Checked locations:");
    expect(response.body.error).toContain(
      "Make sure Cursor IDE is installed and opened at least once.",
    );
  });

  it("falls back to manual when macOS db file exists but is not a sqlite db", async () => {
    await useTempDb({});
    const { writeFileSync } = await import("fs");
    writeFileSync(darwinDbPath(globalThis.__mockHome), "not a database");

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.windowsManual).toBe(true);
    expect(response.body.dbPath).toContain("state.vscdb");
  });

  // ── Token extraction ──────────────────────────────────────────────────

  it("extracts tokens using exact keys", async () => {
    await useTempDb({
      "cursorAuth/accessToken": "test-token",
      "storage.serviceMachineId": "test-machine-id",
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("test-token");
    expect(response.body.machineId).toBe("test-machine-id");
  });

  it("unwraps JSON-encoded string values", async () => {
    await useTempDb({
      "cursorAuth/accessToken": '"json-token"',
      "storage.serviceMachineId": '"json-machine-id"',
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("json-token");
    expect(response.body.machineId).toBe("json-machine-id");
  });

  it("reads tokens with the node:sqlite binding", async () => {
    await useTempDb({
      "cursorAuth/accessToken": "cli-token",
      "storage.serviceMachineId": "cli-machine",
    });

    const response = await GET();

    expect(response.body.found).toBe(true);
    expect(response.body.accessToken).toBe("cli-token");
    expect(response.body.machineId).toBe("cli-machine");
  });

  it("returns manual fallback when tokens are missing", async () => {
    await useTempDb({});

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.windowsManual).toBe(true);
    expect(response.body.dbPath).toContain("state.vscdb");
  });

  // ── Linux ─────────────────────────────────────────────────────────────

  it("linux reports checked locations when no db is accessible", async () => {
    Object.defineProperty(process, "platform", { value: "linux", writable: true });
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found. Checked locations:");
    expect(response.body.error).toContain(".config/Cursor/User/globalStorage/state.vscdb");
  });

  it("linux skips auto-import when Cursor IDE is not installed", async () => {
    Object.defineProperty(process, "platform", { value: "linux", writable: true });
    // db candidate exists, but the cursor.desktop check file does not
    vi.mocked(fsPromises.access).mockImplementation(async (path) => {
      if (String(path).includes("state.vscdb")) return;
      throw new Error("ENOENT");
    });

    const response = await GET();

    expect(response.body.found).toBe(false);
    expect(response.body.error).toBe(
      "Cursor config files found but Cursor IDE does not appear to be installed. Skipping auto-import.",
    );
  });

  it("unknown platforms fall through to the default linux-style paths", async () => {
    Object.defineProperty(process, "platform", { value: "freebsd", writable: true });
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.body.found).toBe(false);
    expect(response.body.error).toContain("Cursor database not found. Checked locations:");
  });
});
