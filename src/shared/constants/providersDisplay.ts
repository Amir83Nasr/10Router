// UI display config — all providers derive from registry.display.
import REGISTRY from "open-sse/providers/registry/index.js";

export const RISK_NOTICE: string =
  "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.";

// Resolve "RISK_NOTICE" token → real notice text (registry stores token to avoid import cycle)
const resolveDisplay = (d: Record<string, unknown>): Record<string, unknown> =>
  d.deprecationNotice === "RISK_NOTICE" ? { ...d, deprecationNotice: RISK_NOTICE } : d;

export const PROVIDER_DISPLAY: Record<string, Record<string, unknown>> = Object.fromEntries(
  REGISTRY.filter((r: { display?: unknown }) => r.display).map(
    (r: { id: string; display: Record<string, unknown> }) => [r.id, resolveDisplay(r.display)],
  ),
);
