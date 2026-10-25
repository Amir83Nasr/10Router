import {
  OPENCODE_ERROR_KINDS,
  OPENCODE_ERROR_TYPES,
  OPENCODE_FREE_TIER_QUOTA_RE,
  OPENCODE_GO_PATH_RE,
  OPENCODE_INSUFFICIENT_FUNDS_MESSAGE,
  OPENCODE_INSUFFICIENT_FUNDS_RE,
  OPENCODE_MISSING_SESSION_MESSAGE,
  OPENCODE_MISSING_SESSION_RE,
  OPENCODE_ENTITLEMENT_MESSAGE,
  isFreeTierEntitlementMessage,
} from "../config/opencodeErrors.js";
import { readErrorEnvelope } from "./error.js";

export { readErrorEnvelope };

// Classify 402/400/entitlement 429 errors into a single actionable shape.
// Returns null for anything this module does not own so the shared parser (and
// the free-tier quota breaker) keeps its existing behaviour.
export function parseOpenCodeAccountError(response, bodyText, options = {}) {
  try {
    const status = response?.status;
    const { type, code, message } = readErrorEnvelope(bodyText);
    const combined = `${type} ${code} ${message}`;

    if (status === 429 && isFreeTierEntitlementMessage(message)) {
      return {
        status: 429,
        kind: OPENCODE_ERROR_KINDS.ENTITLEMENT,
        message: OPENCODE_ENTITLEMENT_MESSAGE,
      };
    }

    if (status === 402 && OPENCODE_INSUFFICIENT_FUNDS_RE.test(combined)) {
      return {
        status: 402,
        kind: OPENCODE_ERROR_KINDS.INSUFFICIENT_FUNDS,
        message: OPENCODE_INSUFFICIENT_FUNDS_MESSAGE,
      };
    }

    const goPath =
      options.go === true || OPENCODE_GO_PATH_RE.test(String(options.url || response?.url || ""));
    const missingSession =
      type === OPENCODE_ERROR_TYPES.MISSING_SESSION_ID ||
      OPENCODE_MISSING_SESSION_RE.test(combined);
    if (status === 400 && goPath && missingSession) {
      return {
        status: 400,
        kind: OPENCODE_ERROR_KINDS.MISSING_SESSION,
        message: OPENCODE_MISSING_SESSION_MESSAGE,
      };
    }

    return null;
  } catch {
    return null; // fail-open: never break error reporting
  }
}

export function isQuotaError(message) {
  return OPENCODE_FREE_TIER_QUOTA_RE.test(String(message || ""));
}
