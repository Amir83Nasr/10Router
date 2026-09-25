/**
 * Generic OAuth2 token refresh — config-driven profiles.
 *
 * Verifies refreshAccessToken() handles the foldable providers
 * (iflow, github, claude) via a REFRESH_PROFILES table,
 * while preserving the legacy generic path for unknown providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalFetch = global.fetch;

function mockFetchOnce(payload, { ok = true, status = 200 } = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  });
  global.fetch = fn;
  return fn;
}

describe("refreshAccessToken — config-driven profiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = originalFetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("iflow: Basic Auth header from clientId:clientSecret, form body keeps client_secret", async () => {
    const fm = mockFetchOnce({ access_token: "if-acc", refresh_token: "if-rot", expires_in: 3600 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");

    await refreshAccessToken("iflow", "if-old", {}, console);

    const [, init] = fm.mock.calls[0];
    expect(init.headers["Authorization"]).toMatch(/^Basic /);
    const body = new URLSearchParams(init.body);
    expect(body.get("client_id")).toBeTruthy();
    expect(body.get("client_secret")).toBeTruthy();
  });

  it("github: provider removed from registry → refresh returns null", async () => {
    const fm = mockFetchOnce({ access_token: "gh-acc", expires_in: 28800 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");

    const out = await refreshAccessToken("github", "gh-old", {}, console);

    // No github entry in providers/registry → no refresh URL → null, no fetch.
    expect(out).toBeNull();
    expect(fm).not.toHaveBeenCalled();
  });

  it("unknown provider with no refresh profile returns null without fetch", async () => {
    const fm = mockFetchOnce({ access_token: "xx-acc", expires_in: 86400 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");

    const out = await refreshAccessToken(
      "no-such-provider",
      "xx-old",
      {
        providerSpecificData: { deviceId: "dev-xyz" },
      },
      console,
    );

    expect(out).toBeNull();
    expect(fm).not.toHaveBeenCalled();
  });

  it("claude: JSON body, client_id only (no client_secret)", async () => {
    const fm = mockFetchOnce({ access_token: "cl-acc", refresh_token: "cl-rot", expires_in: 3600 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");

    await refreshAccessToken("claude", "cl-old", {}, console);

    const [, init] = fm.mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(init.body);
    expect(parsed.grant_type).toBe("refresh_token");
    expect(parsed.client_id).toBeTruthy();
    expect(parsed).not.toHaveProperty("client_secret");
  });

  it("returns null on non-ok response", async () => {
    mockFetchOnce({ error: "invalid_grant" }, { ok: false, status: 400 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");
    const out = await refreshAccessToken("iflow", "dead", {}, console);
    expect(out).toBeNull();
  });

  it("returns null when refreshToken missing", async () => {
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");
    const out = await refreshAccessToken("iflow", "", {}, console);
    expect(out).toBeNull();
  });

  it("dedupes concurrent calls with same refresh token (same dedupKey)", async () => {
    const fm = mockFetchOnce({ access_token: "dd-acc", expires_in: 3600 });
    const { refreshAccessToken } = await import("open-sse/services/tokenRefresh/providers.js");
    const creds = { providerSpecificData: { deviceId: "d" } };
    await Promise.all([
      refreshAccessToken("iflow", "dup-refresh", creds, console),
      refreshAccessToken("iflow", "dup-refresh", creds, console),
    ]);
    expect(fm).toHaveBeenCalledTimes(1);
  });
});
