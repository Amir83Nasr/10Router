// OpenCode Console error contract (free lane + keyed Zen/Go lanes).
// Upstream shapes observed live:
//   429 { type: "error", error: { type: "FreeUsageLimitError",
//         message: "Free usage limit reached. Free models work in OpenCode ..." } }
//   429 { type: "error", error: { type: "FreeUsageLimitError",
//         message: "Rate limit exceeded. Please try again later." } }
//   402 { type: "error", error: { type: "api_error",
//         message: "Upstream request failed: Insufficient account funds" } }
//   400 { type: "error", error: { type: "MissingSessionID",
//         message: "Request is missing x-opencode-session ..." } }
export const OPENCODE_ERROR_TYPES = {
  FREE_USAGE_LIMIT: "FreeUsageLimitError",
  MISSING_SESSION_ID: "MissingSessionID",
};

export const OPENCODE_ERROR_KINDS = {
  ENTITLEMENT: "entitlement",
  QUOTA: "quota",
  INSUFFICIENT_FUNDS: "insufficient_funds",
  MISSING_SESSION: "missing_session",
};

export const OPENCODE_URLS = {
  home: "https://opencode.ai",
  go: "https://opencode.ai/go",
  billing: "https://opencode.ai/auth",
};

// Permanent plan gate: the account may not use free models through an API key.
export const OPENCODE_FREE_TIER_ENTITLEMENT_RE = /free models work in opencode/i;
// Temporary quota window (usually carries retry-after); safe to back off and retry.
export const OPENCODE_FREE_TIER_QUOTA_RE = /rate limit|too many requests/i;
export const OPENCODE_INSUFFICIENT_FUNDS_RE = /insufficient (?:account )?funds|insufficient_quota/i;
export const OPENCODE_MISSING_SESSION_RE = /x-opencode-session|missing\s*session\s*id/i;

// Go requests are routed by path; the same 400 from another lane is not a
// gateway session problem.
export const OPENCODE_GO_PATH_RE = /\/inference\/go\//i;

// Single source for the actionable text. `checkFallbackError` matches the
// "free models work in opencode" phrase and keeps the account out of rotation —
// this is a plan/entitlement gate, not an account failure.
export const OPENCODE_ENTITLEMENT_MESSAGE =
  `Free usage limit reached. Free models work in OpenCode only (${OPENCODE_URLS.home}) — ` +
  "an OpenCode API key cannot unlock them. Use the free `opencode` provider in 10Router, " +
  `subscribe to OpenCode Go (${OPENCODE_URLS.go}), or switch to a paid/top-up model or your own provider key.`;

export const OPENCODE_INSUFFICIENT_FUNDS_MESSAGE =
  "Insufficient account funds. Add credit or top up your OpenCode account at " +
  `${OPENCODE_URLS.billing}, then retry.`;

export const OPENCODE_MISSING_SESSION_MESSAGE =
  "OpenCode Go rejected the request with MissingSessionID: upstream requires the " +
  "`x-opencode-session` header (and its `x-opencode-session-id` mirror) on /inference/go " +
  "requests. Re-send the request with a session; do not strip these headers from the body/headers.";

export function isFreeTierEntitlementMessage(text) {
  return OPENCODE_FREE_TIER_ENTITLEMENT_RE.test(String(text || ""));
}
