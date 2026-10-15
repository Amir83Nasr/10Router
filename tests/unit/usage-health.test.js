import { describe, it, expect } from "vitest";

// Pure TS lib is ESM; import via compiled path through tsx? vitest handles TS via esbuild.
import { summarizeProviderHealth } from "../../src/lib/usageHealth.ts";

const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000 + 60 * 1000).toISOString();
const nowIso = new Date().toISOString();

describe("summarizeProviderHealth", () => {
  it("marks healthy account with all-ok history", () => {
    const { providers } = summarizeProviderHealth({
      historyRows: [
        { provider: "anthropic", connectionId: "c1", status: "ok", timestamp: nowIso },
        { provider: "anthropic", connectionId: "c1", status: "ok", timestamp: nowIso },
      ],
      detailRows: [],
      connections: [{ id: "c1", provider: "anthropic", name: "Main" }],
      cutoffIso: cutoff,
    });
    expect(providers).toHaveLength(1);
    expect(providers[0].status).toBe("healthy");
    expect(providers[0].successRate).toBe(1);
  });

  it("flags cooldown when rateLimitedUntil is in the future", () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    const { providers } = summarizeProviderHealth({
      historyRows: [{ provider: "openai", connectionId: "c2", status: "ok", timestamp: nowIso }],
      detailRows: [],
      connections: [{ id: "c2", provider: "openai", name: "A", rateLimitedUntil: future }],
      cutoffIso: cutoff,
    });
    expect(providers[0].status).toBe("cooldown");
    expect(providers[0].cooldownUntil).toBe(future);
  });

  it("computes p50 latency and surfaces recent failures", () => {
    const { providers, recentFailures } = summarizeProviderHealth({
      historyRows: [{ provider: "x", connectionId: "c3", status: "ok", timestamp: nowIso }],
      detailRows: [
        { provider: "x", connectionId: "c3", timestamp: nowIso, status: "success", latencyMs: 100 },
        { provider: "x", connectionId: "c3", timestamp: nowIso, status: "success", latencyMs: 300 },
        {
          provider: "x",
          connectionId: "c3",
          timestamp: nowIso,
          status: "error",
          latencyMs: 200,
          error: "429 rate limited",
        },
      ],
      connections: [{ id: "c3", provider: "x", name: "X" }],
      cutoffIso: cutoff,
    });
    expect(providers[0].p50LatencyMs).toBe(200);
    expect(providers[0].status).toBe("degraded");
    expect(providers[0].lastError).toContain("429");
    expect(recentFailures).toHaveLength(1);
  });

  it("marks down when only errors and no successful history", () => {
    const { providers } = summarizeProviderHealth({
      historyRows: [],
      detailRows: [
        {
          provider: "y",
          connectionId: "c4",
          timestamp: nowIso,
          status: "error",
          error: "500 boom",
        },
      ],
      connections: [{ id: "c4", provider: "y", name: "Y" }],
      cutoffIso: cutoff,
    });
    expect(providers[0].status).toBe("down");
  });
});
