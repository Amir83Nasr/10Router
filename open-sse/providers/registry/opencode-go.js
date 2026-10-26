export default {
  id: "opencode-go",
  priority: 210,
  alias: "opencode-go",
  aliases: ["ocg"],
  uiAlias: "ocg",
  display: {
    name: "OpenCode Go",
    icon: "terminal",
    color: "#E87040",
    textIcon: "OC",
    website: "https://opencode.ai/auth",
    notice: {
      text: "OpenCode Go: $10/mo, Go Plus $40/mo. Access to Kimi, GLM, Qwen, MiMo, MiniMax models.",
      apiKeyUrl: "https://opencode.ai/auth",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://opencode.ai/inference/go/openai/v1/chat/completions",
    headers: {},
    usage: {
      url: "https://opencode.ai/inference/go/v1/usage",
    },
  },
  // Multi-endpoint: pick the transport matching the client sourceFormat to skip
  // translation. Guarded per-model by `supportedFormats` (see chatCore) because
  // opencode-go models differ in endpoint support. Order is the fallback
  // preference when the client format has no endpoint on the model: Anthropic
  // first (Claude Code is the main client), then Chat Completions, then Responses.
  transports: [
    {
      format: "claude",
      baseUrl: "https://opencode.ai/inference/go/anthropic/v1/messages",
      auth: { combined: true, header: "x-api-key", scheme: "raw", anthropicVersion: true },
    },
    {
      format: "openai",
      baseUrl: "https://opencode.ai/inference/go/openai/v1/chat/completions",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
      // OpenAI dialect only: the gateway rejects `thinking`/`enable_thinking`
      // (400 unknown field "thinking"), so normalize reasoning to reasoning_effort.
      thinkingFormat: "openai",
    },
    {
      format: "openai-responses",
      baseUrl: "https://opencode.ai/inference/go/openai/v1/responses",
      auth: { combined: true, header: "Authorization", scheme: "bearer" },
      thinkingFormat: "openai",
    },
    {
      // Google protocol: the model id is a path segment, so the executor appends
      // `/{model}:generateContent` instead of using baseUrl as the full endpoint.
      format: "gemini",
      baseUrl: "https://opencode.ai/inference/go/google/v1beta/models",
      auth: { combined: true, header: "x-goog-api-key", scheme: "raw" },
    },
  ],
  // supportedFormats are the endpoints each model actually answers on. The docs table
  // is incomplete (it omits models a Go key can reach and lists protocols the gateway
  // rejects); these values were verified against the live Go endpoints. claude comes
  // first on purpose: most 10Router traffic is Claude Code, which then needs no
  // translation. Probes ran on one account, so "model unavailable" can mean the model
  // is disabled in that account's console — do not narrow a model's formats for it;
  // only ModelProtocolUnsupported proves an endpoint is unsupported.
  models: [
    {
      id: "deepseek-v4.1-flash",
      name: "DeepSeek V4.1 Flash",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "glm-5.3-flash",
      name: "GLM 5.3 Flash (Vision)",
      supportedFormats: ["openai", "openai-responses"],
    },
    { id: "glm-5.3", name: "GLM 5.3", supportedFormats: ["openai", "openai-responses"] },
    { id: "glm-5.2", name: "GLM 5.2", supportedFormats: ["openai", "openai-responses"] },
    { id: "glm-5.1", name: "GLM 5.1", supportedFormats: ["openai", "openai-responses"] },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      supportedFormats: ["openai", "openai-responses"],
    },
    { id: "kimi-k2.6", name: "Kimi K2.6", supportedFormats: ["openai", "openai-responses"] },
    {
      id: "kimi-k3",
      name: "Kimi K3",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "kimi-k3.1-pro",
      name: "Kimi K3.1 Pro",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "deepseek-v4-flash-vision-exp",
      name: "DeepSeek V4 Flash Vision (Exp)",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    { id: "longcat-2.0", name: "LongCat 2.0", supportedFormats: ["openai", "openai-responses"] },
    {
      id: "mimo-v2.6-flash",
      name: "MiMo V2.6 Flash",
      supportedFormats: ["openai", "openai-responses"],
    },
    {
      id: "mimo-v2.6-pro",
      name: "MiMo V2.6 Pro",
      supportedFormats: ["openai", "openai-responses"],
    },
    { id: "mimo-v2.5", name: "MiMo V2.5", supportedFormats: ["openai", "openai-responses"] },
    // "Unsupported model" on every wire: either retired or disabled in the account's
    // console, which the probe cannot tell apart. Keep the documented Chat Completions
    // route instead of narrowing what other accounts can use.
    { id: "mimo-v2.5-pro", name: "MiMo V2.5 Pro", supportedFormats: ["openai"] },
    {
      id: "minimax-m3",
      name: "MiniMax M3",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "minimax-m3.1-flash",
      name: "MiniMax M3.1 Flash",
      supportedFormats: ["claude", "openai"],
    },
    { id: "minimax-m2.7", name: "MiniMax M2.7", supportedFormats: ["claude"] },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", supportedFormats: ["claude"] },
    {
      id: "qwen3.8-max",
      name: "Qwen 3.8 Max",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "qwen3.8-flash",
      name: "Qwen 3.8 Flash",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    {
      id: "qwen3.7-plus",
      name: "Qwen 3.7 Plus",
      supportedFormats: ["claude", "openai", "openai-responses"],
    },
    { id: "hy4-preview", name: "Hy4 Preview", supportedFormats: ["openai", "openai-responses"] },
    { id: "hy3", name: "Hy3", supportedFormats: ["openai", "openai-responses"] },
    {
      id: "step-5-preview",
      name: "Step 5 Preview",
      supportedFormats: ["openai", "openai-responses"],
    },
    {
      id: "space-bunny-free",
      name: "Space Bunny Free",
      supportedFormats: ["openai"],
      tier: "free",
    },
    {
      id: "longcat-2.5-preview-free",
      name: "LongCat 2.5 Preview Free",
      supportedFormats: ["openai"],
      tier: "free",
    },
    {
      id: "beam-free",
      name: "Beam Free",
      supportedFormats: ["openai", "openai-responses"],
      tier: "free",
    },
    // Google wire only (documented). Every client format pivots through OpenAI to
    // gemini, and the executor builds `/{model}:generateContent` from the transport.
    {
      id: "gemini-4-argon",
      name: "Gemini 4 Argon",
      targetFormat: "gemini",
      supportedFormats: ["gemini"],
    },
    // Served by /inference/go/openai/v1/responses only — the responses-only entry forces chatCore
    // past the sourceFormat-matched transports into translation (see chatCore guard).
    {
      id: "grok-4.7",
      name: "Grok 4.7",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
    {
      id: "grok-4.6",
      name: "Grok 4.6",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
    {
      id: "gpt-6-luna",
      name: "GPT 6 Luna",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT 5.6 Luna",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
    {
      id: "muse-spark-1.2-contributor",
      name: "Muse Spark 1.2 Contributor",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
    {
      id: "muse-spark-1.3-contributor",
      name: "Muse Spark 1.3 Contributor",
      targetFormat: "openai-responses",
      supportedFormats: ["openai-responses"],
    },
  ],
  features: {
    usage: true,
    usageApikey: true,
  },
};
