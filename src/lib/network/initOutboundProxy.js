import { getSettings } from "@/lib/localDb";
import { applyResolvedOutboundProxy } from "@/lib/network/resolveOutboundProxy";

let initialized = false;

export async function ensureOutboundProxyInitialized() {
  if (initialized) return true;

  try {
    const settings = await getSettings();
    await applyResolvedOutboundProxy(settings);
    initialized = true;
  } catch (error) {
    console.error("[ServerInit] Error initializing outbound proxy:", error);
  }

  return initialized;
}

// Defer init so HTTP server accepts connections first
setImmediate(() => {
  ensureOutboundProxyInitialized().catch(console.log);
});

export default ensureOutboundProxyInitialized;
