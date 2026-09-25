// Global outbound proxy → proxy pool resolution.
// Pool (http only) wins over manual URL; relay pools fall back to manual.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
let tempDir;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "10router-outbound-pool-"));
  process.env.DATA_DIR = tempDir;
  vi.resetModules();
  const db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

describe("resolveOutboundProxyTarget", () => {
  it("manual URL used when no pool selected", async () => {
    const { resolveOutboundProxyTarget } = await import("@/lib/network/resolveOutboundProxy.js");
    const out = await resolveOutboundProxyTarget({
      outboundProxyEnabled: true,
      outboundProxyPoolId: "",
      outboundProxyUrl: "http://127.0.0.1:7897",
      outboundNoProxy: "localhost",
    });
    expect(out.outboundProxyUrl).toBe("http://127.0.0.1:7897");
    expect(out.outboundNoProxy).toBe("localhost");
  });

  it("http pool overrides manual URL", async () => {
    const db = await import("@/lib/db/index.js");
    const { resolveOutboundProxyTarget } = await import("@/lib/network/resolveOutboundProxy.js");
    const pool = await db.createProxyPool({
      name: "p1",
      proxyUrl: "http://10.0.0.1:8080",
      noProxy: "internal",
      type: "http",
    });
    const out = await resolveOutboundProxyTarget({
      outboundProxyEnabled: true,
      outboundProxyPoolId: pool.id,
      outboundProxyUrl: "http://127.0.0.1:7897",
    });
    expect(out.outboundProxyUrl).toBe("http://10.0.0.1:8080");
    expect(out.outboundNoProxy).toBe("internal");
  });

  it("relay pool falls back to manual URL", async () => {
    const db = await import("@/lib/db/index.js");
    const { resolveOutboundProxyTarget } = await import("@/lib/network/resolveOutboundProxy.js");
    const pool = await db.createProxyPool({
      name: "relay",
      proxyUrl: "https://relay.example.workers.dev",
      type: "vercel",
    });
    const out = await resolveOutboundProxyTarget({
      outboundProxyEnabled: true,
      outboundProxyPoolId: pool.id,
      outboundProxyUrl: "http://127.0.0.1:7897",
    });
    expect(out.outboundProxyUrl).toBe("http://127.0.0.1:7897");
  });

  it("missing pool falls back to manual URL (fail open)", async () => {
    const { resolveOutboundProxyTarget } = await import("@/lib/network/resolveOutboundProxy.js");
    const out = await resolveOutboundProxyTarget({
      outboundProxyEnabled: true,
      outboundProxyPoolId: "does-not-exist",
      outboundProxyUrl: "http://127.0.0.1:7897",
    });
    expect(out.outboundProxyUrl).toBe("http://127.0.0.1:7897");
  });

  it("inactive pool falls back to manual URL", async () => {
    const db = await import("@/lib/db/index.js");
    const { resolveOutboundProxyTarget } = await import("@/lib/network/resolveOutboundProxy.js");
    const pool = await db.createProxyPool({
      name: "off",
      proxyUrl: "http://10.0.0.2:8080",
      type: "http",
      isActive: false,
    });
    const out = await resolveOutboundProxyTarget({
      outboundProxyEnabled: true,
      outboundProxyPoolId: pool.id,
      outboundProxyUrl: "http://127.0.0.1:7897",
    });
    expect(out.outboundProxyUrl).toBe("http://127.0.0.1:7897");
  });
});
