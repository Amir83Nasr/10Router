// OpenCode Go subscription facts, display-only. Source: https://opencode.ai/v2/docs/console/go
// Limits and model access are enforced server-side; nothing here gates requests.
export const OPENCODE_GO_DOCS_URL = "https://opencode.ai/v2/docs/console/go";

// Wire formats the connection probe covers, matching registry transport `format`
// values. The Google wire (`/google/v1beta/models/{model}`) is served for a single
// model and is not probed, because its URL depends on that model's availability.
export const OPENCODE_GO_ENDPOINTS = [
  {
    format: "openai",
    label: "OpenAI-compatible",
    url: "https://opencode.ai/inference/go/openai/v1/chat/completions",
    note: "Chat Completions. GPT and Muse Spark models use /openai/v1/responses instead.",
  },
  {
    format: "claude",
    label: "Anthropic-compatible",
    url: "https://opencode.ai/inference/go/anthropic/v1/messages",
    note: "Messages API. max_tokens is required on every request.",
  },
];

export const OPENCODE_GO_PLANS = [
  { id: "go", name: "Go", price: "$10/mo" },
  { id: "go-plus", name: "Go Plus", price: "$40/mo" },
];

// Console settings that change which Go models answer. Surfaced because a missing
// setting shows up as an upstream rejection, not as a 10Router error.
export const OPENCODE_GO_SETUP_NOTES = [
  "Go and Go Plus need a single-member workspace (the default Personal workspace). Workspaces with a Go subscription cannot invite members.",
  "DeepSeek V4.1 Flash and V4 Pro need Global under Settings › Privacy › Regions (owner or admin).",
  'Muse Spark 1.2 and 1.3 Contributor need "Allow paid endpoints that train on request data" turned on (owner or admin).',
  "Free models (for example Beam Free) are not available in every region.",
];
