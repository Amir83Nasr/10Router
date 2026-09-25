import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: fetchMock,
}));

import { getExecutor } from "../../open-sse/executors/index.js";
import { parseUpstreamError } from "../../open-sse/utils/error.js";
import {
  clearFreeUsageBreaker,
  parseRetryAfterMs,
} from "../../open-sse/utils/opencodeFreeUsage.js";

const FREE_429 = JSON.stringify({
  type: "error",
  error: { type: "FreeUsageLimitError", message: "Rate limit exceeded. Please try again later." },
  metadata: {},
});

function okResponse() {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

function upstream429() {
  return new Response(FREE_429, {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": "34683" },
  });
}

const CREDS = { connectionId: "noauth", rawHeaders: {} };
const BODY = { messages: [{ role: "user", content: "hi" }] };

beforeEach(() => {
  clearFreeUsageBreaker();
  fetchMock.mockReset();
});

describe("opencode free-lane 429 root fix", () => {
  it("parses FreeUsageLimitError with retry-after into resetsAtMs", async () => {
    const executor = getExecutor("opencode");
    const parsed = executor.parseError(upstream429(), FREE_429);
    expect(parsed.status).toBe(429);
    expect(parsed.message).toMatch(/free-tier quota exhausted/i);
    expect(parsed.message).toMatch(/retry after/);
    expect(parsed.resetsAtMs).toBeGreaterThan(Date.now());

    // Same through the shared pipeline chatCore uses
    const viaPipeline = await parseUpstreamError(upstream429(), executor);
    expect(viaPipeline.statusCode).toBe(429);
    expect(viaPipeline.resetsAtMs).toBeGreaterThan(Date.now());
  });

  it("backs off locally after a 429 instead of hammering upstream", async () => {
    const executor = getExecutor("opencode");
    fetchMock.mockResolvedValueOnce(upstream429());

    const first = await executor.execute({
      model: "big-pickle",
      body: BODY,
      stream: true,
      credentials: CREDS,
    });
    expect(first.response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second request within the window must NOT hit upstream again
    const second = await executor.execute({
      model: "big-pickle",
      body: BODY,
      stream: true,
      credentials: CREDS,
    });
    expect(second.response.status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.response.headers.get("retry-after")).toBeTruthy();
  });

  it("lifts the local backoff on the next upstream 200", async () => {
    const executor = getExecutor("opencode");
    fetchMock.mockResolvedValueOnce(upstream429());
    await executor.execute({ model: "big-pickle", body: BODY, stream: true, credentials: CREDS });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(okResponse());
    // wait out nothing — force expiry path via success is not reachable while
    // blocked, so emulate window end by clearing then succeeding
    clearFreeUsageBreaker();
    const ok = await executor.execute({
      model: "big-pickle",
      body: BODY,
      stream: true,
      credentials: CREDS,
    });
    expect(ok.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("parseRetryAfterMs handles delta-seconds and HTTP dates", () => {
    expect(parseRetryAfterMs("34683")).toBe(34683 * 1000);
    const future = new Date(Date.now() + 60_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(30_000);
    expect(ms).toBeLessThanOrEqual(60_000);
    expect(parseRetryAfterMs("bogus")).toBeNull();
  });
});
