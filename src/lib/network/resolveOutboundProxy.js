// Resolve the effective global outbound proxy target.
//
// A selected proxy pool (http type only) wins over the manual URL fields.
// Relay pools (vercel/cloudflare/deno) rewrite relay headers per request and
// can never work as an env HTTP_PROXY — skipped here, filtered in UI,
// rejected in the settings API.
import { getProxyPoolById } from "@/models";
import { applyOutboundProxyEnv } from "./outboundProxy.js";

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

export async function resolveOutboundProxyTarget(settings = {}) {
  const enabled = settings?.outboundProxyEnabled === true;
  const poolId = normalizeString(settings?.outboundProxyPoolId);

  if (poolId) {
    try {
      const pool = await getProxyPoolById(poolId);
      const type = pool?.type || "http";
      if (pool && pool.isActive === true && type === "http" && normalizeString(pool.proxyUrl)) {
        return {
          outboundProxyEnabled: enabled,
          outboundProxyUrl: pool.proxyUrl,
          outboundNoProxy: pool.noProxy || "",
        };
      }
    } catch {
      // Fail open to manual values — same convention as the RTK hooks.
    }
  }

  return {
    outboundProxyEnabled: enabled,
    outboundProxyUrl: settings?.outboundProxyUrl || "",
    outboundNoProxy: settings?.outboundNoProxy || "",
  };
}

// Resolve + apply in one step (settings PATCH, DB import, pool edit).
export async function applyResolvedOutboundProxy(settings = {}) {
  applyOutboundProxyEnv(await resolveOutboundProxyTarget(settings));
}
