// Shared translator default values (magic strings used across multiple translators).

// Fallback model id when upstream chunk omits one.
export const MODEL_FALLBACK = "unknown";

// Default image mime when source omits it (base64 blobs without a declared type).
export const DEFAULT_IMAGE_MIME = "image/png";

// Placeholder for a tool result with no text (image-only, empty array, or a
// missing response). OpenAI-dialect wires reject `role:"tool"` with empty
// content. Deliberately not JSON-shaped: a leading "[" reads as a raw-JSON
// stringification bug to callers inspecting the bridge.
export const EMPTY_TOOL_RESULT = "(no output)";
