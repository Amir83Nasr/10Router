// Zed connection test: POST /api/providers/[id]/test must probe
// GET /client/users/me (not "Provider test not supported").
import { describe, it, expect, vi, beforeEach } from "vitest";

const stub = vi.hoisted(() => ({ mode: "ok" }));

vi.mock("open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: async (url) => {
    const u = String(url);
    if (u.includes("cloud.zed.dev/client/users/me")) {
      if (stub.mode === "unauthorized") return new Response("nope", { status: 401 });
      return Response.json({ default_organization_id: "org-1" });
    }
    return new Response("unexpected", { status: 500 });
  },
  default: async () => new Response("unexpected", { status: 500 }),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnectionById: async (id) => ({
    id,
    provider: "zed",
    authType: "oauth",
    accessToken: "tok",
    providerSpecificData: { userId: "u-1", systemId: "sys-1" },
  }),
  updateProviderConnection: async (id, data) => ({ id, ...data }),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: async () => ({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    vercelRelayUrl: "",
    strictProxy: false,
  }),
}));

vi.mock("@/lib/network/proxyTest", () => ({
  testProxyUrl: async () => ({ ok: true }),
}));

import { testSingleConnection } from "@/app/api/providers/[id]/test/testUtils.js";

beforeEach(() => {
  stub.mode = "ok";
});

describe("zed connection test", () => {
  it("valid token → valid:true (not 'Provider test not supported')", async () => {
    const result = await testSingleConnection("conn-zed-1");
    expect(result.valid).toBe(true);
    expect(String(result.error || "")).not.toMatch(/not supported/i);
  });

  it("401 → valid:false with revoked message", async () => {
    stub.mode = "unauthorized";
    const result = await testSingleConnection("conn-zed-1");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/revoked/i);
  });
});
