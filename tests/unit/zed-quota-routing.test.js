import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
  getZedUsage: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: mocks.getSettings,
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  updateProviderConnection: vi.fn(),
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
  pickProxyPoolId: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("open-sse/services/usage/zed.js", () => ({
  getZedUsage: mocks.getZedUsage,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const {
  getZedQuotaCache,
  handleZedQuotaError,
  refreshZedQuota,
  clearZedQuotaBlock,
  isZedSpendLimitError,
} = await import("@/sse/services/zedQuota.js");
const { getProviderCredentials } = await import("@/sse/services/auth.js");

const MODEL = "claude-opus-4-6";
const FUTURE_RESET = "2026-10-01T00:00:00.000Z";

function exhaustedUsage() {
  return {
    plan: "Zed Pro",
    quotas: {
      "Edit Predictions": {
        used: 50,
        total: 50,
        remainingPercentage: 0,
        resetAt: FUTURE_RESET,
        unlimited: false,
      },
    },
    message: null,
  };
}

function healthyUsage() {
  return {
    plan: "Zed Pro",
    quotas: {
      "Edit Predictions": {
        used: 3,
        total: 50,
        remainingPercentage: 94,
        resetAt: FUTURE_RESET,
        unlimited: false,
      },
    },
    message: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getZedQuotaCache().clear();
  mocks.resolveConnectionProxyConfig.mockResolvedValue({});
  mocks.getSettings.mockResolvedValue({});
});

describe("Zed monthly-quota routing", () => {
  it("records exhausted monthly quota after 402 and returns its exact reset time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.getZedUsage.mockResolvedValue(exhaustedUsage());

    try {
      await expect(handleZedQuotaError("zed-a", 402, MODEL, "token", {})).resolves.toBe(
        Date.parse(FUTURE_RESET),
      );
      expect(getZedQuotaCache().get("zed-a")).toEqual({
        remainingPercentage: 0,
        resetAt: FUTURE_RESET,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips exhausted account and selects the next account", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.getProviderConnections.mockResolvedValue([
      { id: "zed-a", email: "a@example.com", isActive: true },
      { id: "zed-b", email: "b@example.com", isActive: true },
    ]);
    getZedQuotaCache().set("zed-a", { remainingPercentage: 0, resetAt: FUTURE_RESET });

    try {
      await expect(getProviderCredentials("zed", null, MODEL)).resolves.toMatchObject({
        connectionId: "zed-b",
        connectionName: "b@example.com",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports retry time when every account is cache-blocked", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.getProviderConnections.mockResolvedValue([
      { id: "zed-a", email: "a@example.com", isActive: true },
    ]);
    getZedQuotaCache().set("zed-a", { remainingPercentage: 0, resetAt: FUTURE_RESET });

    try {
      await expect(getProviderCredentials("zed", null, MODEL)).resolves.toMatchObject({
        allRateLimited: true,
        retryAfter: FUTURE_RESET,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets account back into rotation once reset time has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:01.000Z"));
    mocks.getProviderConnections.mockResolvedValue([
      { id: "zed-a", email: "a@example.com", isActive: true },
    ]);
    getZedQuotaCache().set("zed-a", { remainingPercentage: 0, resetAt: FUTURE_RESET });

    try {
      await expect(getProviderCredentials("zed", null, MODEL)).resolves.toMatchObject({
        connectionId: "zed-a",
        connectionName: "a@example.com",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("coalesces concurrent quota refreshes for one account", async () => {
    let resolveUsage;
    mocks.getZedUsage.mockReturnValue(
      new Promise((resolve) => {
        resolveUsage = resolve;
      }),
    );

    const first = refreshZedQuota("zed-concurrent", "token", {});
    const second = refreshZedQuota("zed-concurrent", "token", {});
    resolveUsage(exhaustedUsage());

    await expect(Promise.all([first, second])).resolves.toEqual([
      exhaustedUsage().quotas,
      exhaustedUsage().quotas,
    ]);
    expect(mocks.getZedUsage).toHaveBeenCalledTimes(1);
  });

  it("keeps known cache when quota endpoint returns an error payload", async () => {
    getZedQuotaCache().set("zed-error", { remainingPercentage: 0, resetAt: FUTURE_RESET });
    mocks.getZedUsage.mockResolvedValue({ message: "Zed authentication failed. Sign in again." });

    await expect(refreshZedQuota("zed-error", "token", {})).resolves.toBeNull();
    expect(getZedQuotaCache().get("zed-error")).toEqual({
      remainingPercentage: 0,
      resetAt: FUTURE_RESET,
    });
  });

  it("clears a stale block when the fresh reading is healthy", async () => {
    getZedQuotaCache().set("zed-refilled", { remainingPercentage: 0, resetAt: FUTURE_RESET });
    mocks.getZedUsage.mockResolvedValue(healthyUsage());

    await expect(refreshZedQuota("zed-refilled", "token", {})).resolves.toEqual(
      healthyUsage().quotas,
    );
    expect(getZedQuotaCache().get("zed-refilled")).toBeUndefined();
  });

  it("ignores token-billed unlimited readings — no block", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.getZedUsage.mockResolvedValue({
      plan: "Zed Student",
      quotas: {
        "Edit Predictions": {
          used: 0,
          total: 0,
          remainingPercentage: 100,
          resetAt: null,
          unlimited: true,
        },
      },
      message: "Hosted AI models are billed per token.",
    });

    try {
      await expect(handleZedQuotaError("zed-token", 402, MODEL, "token", {})).resolves.toBeNull();
      expect(getZedQuotaCache().get("zed-token")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the block after a successful request", async () => {
    getZedQuotaCache().set("zed-ok", { remainingPercentage: 0, resetAt: FUTURE_RESET });
    clearZedQuotaBlock("zed-ok");
    expect(getZedQuotaCache().get("zed-ok")).toBeUndefined();
  });

  it("detects token spend-limit errors", () => {
    expect(
      isZedSpendLimitError(403, "Zed token_spend_limit_reached: Student plan credits consumed."),
    ).toBe(true);
    expect(isZedSpendLimitError(403, "rate limit exceeded")).toBe(false);
    expect(isZedSpendLimitError(429, "Zed token_spend_limit_reached: credits consumed.")).toBe(
      false,
    );
  });

  it("blocks a spend-limit 403 until the cached billing-cycle reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    // Token-billed Student plan: no exhausted row, but rows carry the cycle reset.
    mocks.getZedUsage.mockResolvedValue({
      plan: "Zed Student",
      quotas: {
        "Edit Predictions": {
          used: 0,
          total: 0,
          remainingPercentage: 100,
          resetAt: FUTURE_RESET,
          unlimited: true,
        },
      },
      message: "Hosted AI models are billed per token.",
    });

    try {
      const resetMs = await handleZedQuotaError(
        "zed-spend",
        403,
        MODEL,
        "token",
        {},
        "Zed token_spend_limit_reached: Student plan credits consumed.",
      );
      expect(resetMs).toBe(Date.parse(FUTURE_RESET));
      expect(getZedQuotaCache().get("zed-spend")).toEqual({
        remainingPercentage: 0,
        resetAt: FUTURE_RESET,
      });

      // Auth pre-filter now skips this account until the cycle reset.
      mocks.getProviderConnections.mockResolvedValue([
        { id: "zed-spend", email: "spend@example.com", isActive: true },
        { id: "zed-next", email: "next@example.com", isActive: true },
      ]);
      await expect(getProviderCredentials("zed", null, MODEL)).resolves.toMatchObject({
        connectionId: "zed-next",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("spend-limit 403 without a future cycle reset falls back to generic backoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00.000Z"));
    mocks.getZedUsage.mockResolvedValue({
      plan: "Zed Student",
      quotas: {
        "Edit Predictions": {
          used: 0,
          total: 0,
          remainingPercentage: 100,
          resetAt: null,
          unlimited: true,
        },
      },
      message: "Hosted AI models are billed per token.",
    });

    try {
      await expect(
        handleZedQuotaError(
          "zed-spend-noreset",
          403,
          MODEL,
          "token",
          {},
          "Zed token_spend_limit_reached: Student plan credits consumed.",
        ),
      ).resolves.toBeNull();
      expect(getZedQuotaCache().get("zed-spend-noreset")).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
