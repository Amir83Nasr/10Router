// Re-export from open-sse with local logger
import * as log from "../utils/logger";
import { updateProviderConnection } from "../../lib/localDb.js";
import {
  getProjectIdForConnection,
  invalidateProjectId,
  removeConnection,
} from "open-sse/services/projectId.js";
import {
  TOKEN_EXPIRY_BUFFER_MS as BUFFER_MS,
  refreshAccessToken as _refreshAccessToken,
  refreshClaudeOAuthToken as _refreshClaudeOAuthToken,
  refreshGoogleToken as _refreshGoogleToken,
  refreshCodexToken as _refreshCodexToken,
  refreshIflowToken as _refreshIflowToken,
  refreshGitHubToken as _refreshGitHubToken,
  refreshCopilotToken as _refreshCopilotToken,
  getAccessToken as _getAccessToken,
  refreshTokenByProvider as _refreshTokenByProvider,
  formatProviderCredentials as _formatProviderCredentials,
  getAllAccessTokens as _getAllAccessTokens,
  getRefreshLeadMs as _getRefreshLeadMs,
} from "open-sse/services/tokenRefresh.js";
import {
  refreshProviderCredentials as _refreshProviderCredentials,
  shouldRefreshCredentials as _shouldRefreshCredentials,
} from "open-sse/services/oauthCredentialManager.js";

export const TOKEN_EXPIRY_BUFFER_MS: number = BUFFER_MS;

// ─── Re-exports wrapped with local logger ─────────────────────────────────────

export const refreshAccessToken = (
  provider: string,
  refreshToken: string,
  credentials: any,
): Promise<any> => _refreshAccessToken(provider, refreshToken, credentials, log);

export const refreshClaudeOAuthToken = (refreshToken: string): Promise<any> =>
  _refreshClaudeOAuthToken(refreshToken, log);

export const refreshGoogleToken = (
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<any> => _refreshGoogleToken(refreshToken, clientId, clientSecret, log);

export const refreshCodexToken = (refreshToken: string): Promise<any> =>
  _refreshCodexToken(refreshToken, log);

export const refreshIflowToken = (refreshToken: string): Promise<any> =>
  _refreshIflowToken(refreshToken, log);

export const refreshGitHubToken = (refreshToken: string): Promise<any> =>
  _refreshGitHubToken(refreshToken, log);

export const refreshCopilotToken = (githubAccessToken: string): Promise<any> =>
  _refreshCopilotToken(githubAccessToken, log);

export const getAccessToken = (provider: string, credentials: any): Promise<any> =>
  _getAccessToken(provider, credentials, log);

export const refreshTokenByProvider = (provider: string, credentials: any): Promise<any> =>
  _refreshTokenByProvider(provider, credentials, log);

export const formatProviderCredentials = (provider: string, credentials: any): any =>
  _formatProviderCredentials(provider, credentials, log);

export const getAllAccessTokens = (userInfo: any): Promise<any> =>
  _getAllAccessTokens(userInfo, log);

export const shouldRefreshCredentials = (provider: string, credentials: any): boolean =>
  _shouldRefreshCredentials(provider, credentials);

// ─── Lifecycle hook ───────────────────────────────────────────────────────────

/**
 * Call this when a connection is fully closed / removed.
 * Aborts any in-flight projectId fetch and evicts its cache entry,
 * preventing the module-level Maps from accumulating stale entries.
 */
export function releaseConnection(connectionId: string): void {
  if (!connectionId) return;
  removeConnection(connectionId);
  log.debug("TOKEN_REFRESH", "Released connection resources", { connectionId });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Compute an ISO expiry timestamp from a relative expiresIn (seconds).
 */
function toExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function normalizeExpiresAt(expiresAt?: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

/**
 * Providers that carry a real Google project ID.
 */
function needsProjectId(provider: string): boolean {
  return provider === "antigravity";
}

/**
 * Non-blocking: fetch the project ID for a connection after a token refresh and
 * persist it to localDb.  Invalidates the stale cached value first so the fetch
 * always retrieves a fresh one.
 */
function _refreshProjectId(provider: string, connectionId: string, accessToken: string): void {
  if (!needsProjectId(provider) || !connectionId || !accessToken) return;

  // Invalidate the stale cached entry so getProjectIdForConnection does a real fetch
  invalidateProjectId(connectionId);

  // Lazy resolution: Do not eagerly trigger onboardUser during background token refresh.
  // Eagerly fetching projectId across multiple accounts simultaneously triggers Google Cloud anti-abuse / rate limits.
  // Runtime handlers (e.g. chat handler) will lazily call getProjectIdForConnection() on demand.
  if (process.env.EAGER_PROJECT_ID_REFRESH === "true") {
    getProjectIdForConnection(connectionId, accessToken, provider)
      .then((projectId: string | null) => {
        if (!projectId) return;
        updateProviderCredentials(connectionId, { projectId }).catch((err: any) => {
          log.debug("TOKEN_REFRESH", "Failed to persist refreshed projectId", {
            connectionId,
            error: err?.message ?? err,
          });
        });
      })
      .catch((err: any) => {
        log.debug("TOKEN_REFRESH", "Failed to fetch projectId after token refresh", {
          connectionId,
          error: err?.message ?? err,
        });
      });
  }
}

// ─── Local-specific: persist credentials to localDb ──────────────────────────

/**
 * Persist updated credentials for a connection to localDb.
 * Only fields that are present in `newCredentials` are written.
 */
export async function updateProviderCredentials(
  connectionId: string,
  newCredentials: any,
): Promise<boolean> {
  try {
    const updates: Record<string, any> = {};

    if (newCredentials.accessToken) updates.accessToken = newCredentials.accessToken;
    if (newCredentials.refreshToken) updates.refreshToken = newCredentials.refreshToken;
    if (newCredentials.idToken) updates.idToken = newCredentials.idToken;
    if (newCredentials.lastRefreshAt) updates.lastRefreshAt = newCredentials.lastRefreshAt;
    if (newCredentials.expiresAt) updates.expiresAt = newCredentials.expiresAt;
    if (newCredentials.expiresIn) {
      updates.expiresAt = toExpiresAt(newCredentials.expiresIn);
      updates.expiresIn = newCredentials.expiresIn;
    } else if (newCredentials.expiresAt) {
      const expiresAt = normalizeExpiresAt(newCredentials.expiresAt);
      if (expiresAt) {
        updates.expiresAt = expiresAt;
        updates.expiresIn = Math.max(
          1,
          Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
        );
      }
    }
    if (newCredentials.providerSpecificData) {
      updates.providerSpecificData = {
        ...(newCredentials.existingProviderSpecificData || {}),
        ...newCredentials.providerSpecificData,
      };
    }
    if (newCredentials.copilotToken || newCredentials.copilotTokenExpiresAt) {
      updates.providerSpecificData = {
        ...(updates.providerSpecificData || newCredentials.existingProviderSpecificData || {}),
        ...(newCredentials.copilotToken ? { copilotToken: newCredentials.copilotToken } : {}),
        ...(newCredentials.copilotTokenExpiresAt
          ? { copilotTokenExpiresAt: newCredentials.copilotTokenExpiresAt }
          : {}),
      };
    }
    if (newCredentials.projectId) updates.projectId = newCredentials.projectId;

    const result = await updateProviderConnection(connectionId, updates);
    log.info("TOKEN_REFRESH", "Credentials updated in localDb", {
      connectionId,
      success: !!result,
    });
    return !!result;
  } catch (error: any) {
    log.error("TOKEN_REFRESH", "Error updating credentials in localDb", {
      connectionId,
      error: error.message,
    });
    return false;
  }
}

// ─── Local-specific: proactive token refresh ─────────────────────────────────

/**
 * Check whether the provider token (and, for GitHub, the Copilot token) is
 * about to expire and refresh it proactively.
 *
 * force=true skips the on-request lead check
 *   (used by background scheduler which applies a larger lead). Request path omits this.
 */
export async function checkAndRefreshToken(
  provider: string,
  credentials: any,
  options: { force?: boolean } = {},
): Promise<any> {
  let creds = { ...credentials };
  if (!creds.connectionId && creds.id) {
    creds.connectionId = creds.id;
  }

  const force = options?.force === true;

  // ── 1. Regular access-token expiry ────────────────────────────────────────
  if (force || _shouldRefreshCredentials(provider, creds)) {
    const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : null;
    const remaining = expiresAt ? expiresAt - Date.now() : null;
    const refreshLead = _getRefreshLeadMs(provider);

    log.info("TOKEN_REFRESH", "Refreshing provider credentials proactively", {
      provider,
      expiresIn: remaining === null ? null : Math.round(remaining / 1000),
      refreshLeadMs: refreshLead,
      lastRefreshAt: creds.lastRefreshAt || null,
    });

    const newCreds = await _refreshProviderCredentials(provider, creds, log);
    if (newCreds?.accessToken || newCreds?.apiKey || newCreds?.copilotToken) {
      const mergedCreds = {
        ...newCreds,
        existingProviderSpecificData: creds.providerSpecificData,
      };

      // Persist to DB (non-blocking path continues below)
      await updateProviderCredentials(creds.connectionId, mergedCreds);

      creds = {
        ...creds,
        ...newCreds,
        expiresAt: newCreds.expiresIn
          ? toExpiresAt(newCreds.expiresIn)
          : normalizeExpiresAt(newCreds.expiresAt) || newCreds.expiresAt || creds.expiresAt,
        providerSpecificData: newCreds.providerSpecificData
          ? { ...creds.providerSpecificData, ...newCreds.providerSpecificData }
          : creds.providerSpecificData,
      };

      // Non-blocking: refresh projectId with the new access token
      _refreshProjectId(provider, creds.connectionId, creds.accessToken);
    }
  }

  // ── 2. GitHub Copilot token expiry ────────────────────────────────────────
  if (provider === "github") {
    const copilotToken = creds.providerSpecificData?.copilotToken;
    const copilotExpiresAt = creds.providerSpecificData?.copilotTokenExpiresAt
      ? creds.providerSpecificData.copilotTokenExpiresAt * 1000
      : 0;
    const now = Date.now();
    const remaining = copilotExpiresAt - now;

    if (!copilotToken || remaining < TOKEN_EXPIRY_BUFFER_MS) {
      log.info("TOKEN_REFRESH", "Copilot token expiring soon or missing, refreshing proactively", {
        provider,
        expiresIn: copilotToken ? Math.round(remaining / 1000) : "missing",
      });

      const copilotTokenResult = await refreshCopilotToken(creds.accessToken);
      if (copilotTokenResult) {
        const updatedSpecific = {
          ...creds.providerSpecificData,
          copilotToken: copilotTokenResult.token,
          copilotTokenExpiresAt: copilotTokenResult.expiresAt,
        };

        await updateProviderCredentials(creds.connectionId, {
          providerSpecificData: updatedSpecific,
        });

        creds.providerSpecificData = updatedSpecific;
        creds.copilotToken = copilotTokenResult.token;
      }
    }
  }

  return creds;
}

// ─── Local-specific: combined GitHub + Copilot refresh ───────────────────────

/**
 * Refresh the GitHub OAuth token and immediately exchange it for a fresh
 * Copilot token.
 *
 * @returns merged credentials or the raw GitHub credentials on Copilot failure
 */
export async function refreshGitHubAndCopilotTokens(credentials: {
  refreshToken: string;
}): Promise<any> {
  const newGitHubCreds = await refreshGitHubToken(credentials.refreshToken);
  if (!newGitHubCreds?.accessToken) return newGitHubCreds;

  const copilotToken = await refreshCopilotToken(newGitHubCreds.accessToken);
  if (!copilotToken) return newGitHubCreds;

  return {
    ...newGitHubCreds,
    providerSpecificData: {
      copilotToken: copilotToken.token,
      copilotTokenExpiresAt: copilotToken.expiresAt,
    },
  };
}
