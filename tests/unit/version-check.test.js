import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeVersion,
  compareVersions,
  isNewerVersion,
  getLatestVersion,
  __resetVersionCache,
} from "../../src/lib/versionCheck.js";

describe("versionCheck: normalize/compare", () => {
  it("strips leading v", () => {
    expect(normalizeVersion("v0.5.84")).toBe("0.5.84");
  });
  it("orders semver numerically, not lexically", () => {
    expect(compareVersions("0.5.9", "0.5.10")).toBeLessThan(0);
    expect(compareVersions("0.5.84", "0.5.84")).toBe(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
  });
  it("isNewerVersion only on strictly newer", () => {
    expect(isNewerVersion("0.5.85", "0.5.84")).toBe(true);
    expect(isNewerVersion("0.5.84", "0.5.84")).toBe(false);
    expect(isNewerVersion("0.5.83", "0.5.84")).toBe(false);
    expect(isNewerVersion(null, "0.5.84")).toBe(false);
  });
});

describe("versionCheck: getLatestVersion", () => {
  beforeEach(() => __resetVersionCache());

  it("reads version from npm /latest payload", async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({ name: "@amir83nasr/10router", version: "0.5.85" }),
    });
    expect((await getLatestVersion({ fetchFn, now: () => 1 })).version).toBe("0.5.85");
  });

  it("hits the npm registry, not GitHub", async () => {
    let seenUrl;
    const fetchFn = async (url) => {
      seenUrl = String(url);
      return { ok: true, json: async () => ({ version: "1.0.0" }) };
    };
    await getLatestVersion({ fetchFn, now: () => 1 });
    expect(seenUrl).toContain("registry.npmjs.org");
    expect(seenUrl).not.toContain("api.github.com");
  });

  it("reports source reason", async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => ({ version: "0.5.85" }),
    });
    expect(await getLatestVersion({ fetchFn, now: () => 1 })).toEqual({
      version: "0.5.85",
      reason: "npm",
    });
  });

  it("fail-open: fetch error returns null, never throws", async () => {
    const fetchFn = async () => {
      throw new Error("offline");
    };
    expect((await getLatestVersion({ fetchFn, now: () => 1 })).version).toBeNull();
  });

  it("fail-open: non-ok response returns null", async () => {
    const fetchFn = async () => ({ ok: false, status: 403 });
    const res = await getLatestVersion({ fetchFn, now: () => 1 });
    expect(res.version).toBeNull();
    expect(res.reason).toBe("npm-403");
  });

  it("fail-open: payload without version returns null", async () => {
    const fetchFn = async () => ({ ok: true, json: async () => ({}) });
    const res = await getLatestVersion({ fetchFn, now: () => 1 });
    expect(res.version).toBeNull();
    expect(res.reason).toBe("no-version");
  });

  it("cooldowns failed fetches, still serves stale cache", async () => {
    let calls = 0;
    const fail = async () => {
      calls++;
      throw new Error("offline");
    };
    expect(await getLatestVersion({ fetchFn: fail, now: () => 0 })).toEqual({
      version: null,
      reason: "fetch-error",
    });
    // Within 10min cooldown: no new fetch.
    expect((await getLatestVersion({ fetchFn: fail, now: () => 1000 })).reason).toBe("cooldown");
    expect(calls).toBe(1);
    // Fresh cache survives — no new fetch while TTL holds.
    const ok = async () => ({ ok: true, json: async () => ({ version: "1.0.0" }) });
    await getLatestVersion({ fetchFn: ok, now: () => 20 * 60 * 1000 });
    expect(await getLatestVersion({ fetchFn: fail, now: () => 21 * 60 * 1000 })).toEqual({
      version: "1.0.0",
      reason: "cache-fresh",
    });
    expect(calls).toBe(1);
  });

  it("caches within TTL, refetches after", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      return { ok: true, json: async () => ({ version: "1.0.0" }) };
    };
    await getLatestVersion({ fetchFn, now: () => 0 });
    await getLatestVersion({ fetchFn, now: () => 1000 });
    expect(calls).toBe(1);
    await getLatestVersion({ fetchFn, now: () => 7 * 60 * 60 * 1000 });
    expect(calls).toBe(2);
  });
});
