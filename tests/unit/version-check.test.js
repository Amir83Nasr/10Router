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

  it("picks highest semver tag, ignores non-release tags", async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => [
        { name: "v0.5.83" },
        { name: "latest" },
        { name: "v0.5.85" },
        { name: "v0.5.84" },
      ],
    });
    expect((await getLatestVersion({ fetchFn, now: () => 1 })).version).toBe("0.5.85");
  });

  it("reports source reason", async () => {
    const fetchFn = async () => ({
      ok: true,
      json: async () => [{ name: "v0.5.85" }],
    });
    expect(await getLatestVersion({ fetchFn, now: () => 1 })).toEqual({
      version: "0.5.85",
      reason: "github",
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
    expect(res.reason).toBe("github-403");
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
    const ok = async () => ({ ok: true, json: async () => [{ name: "v1.0.0" }] });
    await getLatestVersion({ fetchFn: ok, now: () => 20 * 60 * 1000 });
    expect(await getLatestVersion({ fetchFn: fail, now: () => 21 * 60 * 1000 })).toEqual({
      version: "1.0.0",
      reason: "cache-fresh",
    });
    expect(calls).toBe(1);
  });

  it("sends GitHub token when set", async () => {
    let seen;
    const fetchFn = async (_url, opts) => {
      seen = opts.headers;
      return { ok: true, json: async () => [{ name: "v1.0.0" }] };
    };
    process.env.GITHUB_TOKEN = "test-token";
    try {
      await getLatestVersion({ fetchFn, now: () => 0 });
    } finally {
      delete process.env.GITHUB_TOKEN;
    }
    expect(seen.Authorization).toBe("Bearer test-token");
  });

  it("caches within TTL, refetches after", async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls++;
      return { ok: true, json: async () => [{ name: "v1.0.0" }] };
    };
    await getLatestVersion({ fetchFn, now: () => 0 });
    await getLatestVersion({ fetchFn, now: () => 1000 });
    expect(calls).toBe(1);
    await getLatestVersion({ fetchFn, now: () => 7 * 60 * 60 * 1000 });
    expect(calls).toBe(2);
  });
});
