// Provider icon paths under /public/providers.
// Alias related brands; session-cache 404s so one miss never spams again.

const ICON_ALIASES: Record<string, string> = {
  antigravity: "gemini",
  "perplexity-agent": "perplexity",
  "gitlab-duo": "gitlab",
  "vercel-ai-gateway": "vercel",
  "ollama-search": "ollama",
  "opencode-zen": "opencode",
};

// Runtime only — first 404 remembers id for the whole session
const failedIds = new Set<string>();

function normalizeId(providerId?: string): string {
  if (!providerId || typeof providerId !== "string") return "";
  return providerId.trim().toLowerCase();
}

/** Resolve icon file id (after alias). Empty if previously failed this session. */
export function resolveProviderIconId(providerId?: string): string {
  const id = normalizeId(providerId);
  if (!id) return "";
  if (failedIds.has(id)) return "";
  const aliased = ICON_ALIASES[id] || id;
  if (failedIds.has(aliased)) return "";
  return aliased;
}

/** `/providers/{id}.png` or null when previously failed. */
export function getProviderIconSrc(providerId?: string): string | null {
  const id = resolveProviderIconId(providerId);
  return id ? `/providers/${id}.png` : null;
}

/** Call from img onError so later mounts skip the request. */
export function markProviderIconMissing(providerId?: string): void {
  const id = normalizeId(providerId);
  if (id) failedIds.add(id);
  const aliased = ICON_ALIASES[id];
  if (aliased) failedIds.add(aliased);
}

// Host tokens carrying no brand signal — skipped when guessing an icon.
const GENERIC_HOST_TOKENS = new Set([
  "www",
  "api",
  "apis",
  "rest",
  "rpc",
  "gateway",
  "proxy",
  "llm",
  "chat",
  "v1",
  "v2",
  "ai",
  "app",
  "dev",
  "cloud",
  "com",
  "net",
  "org",
  "io",
  "co",
  "us",
  "eu",
  "cn",
]);

// Hostname token → icon id when the brand isn't a plain subdomain token.
const HOST_ICON_ALIASES: Record<string, string> = {
  generativelanguage: "gemini",
  googleapis: "gemini",
  x: "xai",
};

// All /public/providers/*.png basenames (lowercase, without extension).
// The brand guess below only returns ids from this set, so custom nodes with
// unknown hosts fall straight through to the API-family logo instead of 404ing
// once per page load (flash of initials on refresh, family logo after
// client-side navigation once the 404 is session-cached). Keep in sync when
// adding logo files — tests/unit/custom-provider-icon.test.js enforces it.
export const KNOWN_PROVIDER_ICON_IDS: ReadonlySet<string> = new Set([
  "agentrouter",
  "alicode",
  "alicode-intl",
  "alims-intl",
  "alitp-intl",
  "amp",
  "anthropic",
  "api-airforce",
  "assemblyai",
  "aws-polly",
  "azure",
  "baidu",
  "bazaarlink",
  "black-forest-labs",
  "blackbox",
  "bluesminds",
  "brave-search",
  "byteplus",
  "cartesia",
  "cerebras",
  "chutes",
  "claude",
  "clinepass",
  "codebuddy-cn",
  "codebuddy-intl",
  "codex",
  "cohere",
  "comfyui",
  "commandcode",
  "continue",
  "coqui",
  "cursor",
  "deepgram",
  "deepseek",
  "deepseek-tui",
  "devin-cli",
  "droid",
  "edge-tts",
  "elevenlabs",
  "exa",
  "fal-ai",
  "featherless",
  "firecrawl",
  "fireworks",
  "fish-audio",
  "gemini",
  "github",
  "gitlab",
  "glm",
  "glm-cn",
  "google-pse",
  "google-tts",
  "grok-cli",
  "grok-web",
  "groq",
  "hermes",
  "huggingface",
  "hyperbolic",
  "iflow",
  "inworld",
  "jcode",
  "jina-ai",
  "jina-reader",
  "kilo-gateway",
  "kilocode",
  "kimchi",
  "linkup",
  "llm7",
  "local-device",
  "longcat",
  "mimo-free",
  "minimax",
  "minimax-cn",
  "mistral",
  "mmf",
  "morph",
  "nanobanana",
  "nebius",
  "novita",
  "nvidia",
  "ollama",
  "ollama-local",
  "openai",
  "openclaw",
  "opencode",
  "opencode-go",
  "opendesign",
  "openrouter",
  "perplexity",
  "perplexity-agent",
  "perplexity-web",
  "playht",
  "poolside",
  "qoder",
  "qwen",
  "recraft",
  "reka",
  "roo",
  "runwayml",
  "sambanova",
  "sdwebui",
  "searchapi",
  "searxng",
  "selfhosted-embedding",
  "selfhosted-stt",
  "selfhosted-tts",
  "serper",
  "siliconflow",
  "stability-ai",
  "tavily",
  "tencent",
  "together",
  "tokenrouter",
  "topaz",
  "tortoise",
  "trae",
  "venice",
  "vercel",
  "vercel-ai-gateway",
  "volcengine-ark",
  "voyage-ai",
  "windsurf",
  "workbuddy",
  "xai",
  "xiaomi-mimo",
  "xiaomi-tokenplan",
  "xquik",
  "youcom",
  "zed",
]);

/**
 * Guess a `/providers/{id}.png` icon id from a custom node's baseUrl
 * ("https://api.deepseek.com/v1" → "deepseek"). Returns "" for local,
 * IP, invalid, or unknown-brand URLs so callers fall back to the API-family
 * logo or initials avatar without a doomed 404 request.
 */
export function guessProviderIconIdFromUrl(baseUrl?: string): string {
  let host = "";
  try {
    host = new URL(String(baseUrl || "")).hostname.toLowerCase();
  } catch {
    return "";
  }
  if (!host || host === "localhost" || host.startsWith("127.") || host.includes(":")) return "";
  if (host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return "";
  const tokens = host.split(".").filter(Boolean);
  const pick = tokens.find((t) => !GENERIC_HOST_TOKENS.has(t) && !/^\d+$/.test(t));
  if (!pick) return "";
  const id = HOST_ICON_ALIASES[pick] || ICON_ALIASES[pick] || pick;
  return KNOWN_PROVIDER_ICON_IDS.has(id) ? id : "";
}

/** Initials for the letter-avatar fallback ("My Proxy" → "MP"). */
export function getInitials(name?: string): string {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
