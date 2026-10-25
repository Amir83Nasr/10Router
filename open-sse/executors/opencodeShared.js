// Helpers shared by the OpenCode executors (free lane, Go, Zen).
//
// The three lanes speak the same Responses/Chat boundary rules; only their
// base URLs, session scopes and auth differ. Keeping the body-shaping rules
// here means a fix lands once instead of three times (and cannot drift).

import {
  clampResponsesCallId,
  coerceResponsesArguments,
  coerceResponsesOutput,
} from "../translator/formats/responsesApi.js";

export const MAX_TOOL_NAME_LEN = 128;
export const MAX_SESSION_LENGTH = 256;

export function normalizeSession(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_LENGTH) return null;
  return normalized;
}

/** Strip the thinking suffix "model(level)" so registry lookups hit the base id. */
export function baseModelId(model) {
  return String(model || "")
    .replace(/\([^()]+\)\s*$/, "")
    .trim();
}

/**
 * Normalize `body.tools` into the flat Responses shape and drop hosted/nameless
 * tools the /responses endpoint rejects.
 *
 * Freeform (`type: "custom"`) tools are preserved verbatim: Codex sends
 * `apply_patch`/`exec` with a grammar in `format` and no JSON schema, and
 * rewriting them as function tools loses that grammar — the model then calls a
 * parameterless function the client cannot execute, breaking the tool loop.
 */
export function normalizeResponsesTools(body) {
  if (!Array.isArray(body.tools)) return;
  const validNames = new Set();
  body.tools = body.tools.filter((tool) => {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) return false;

    if (tool.type === "custom") {
      const name =
        typeof tool.name === "string" ? tool.name.trim().slice(0, MAX_TOOL_NAME_LEN) : "";
      if (!name || validNames.has(name)) return false;
      tool.name = name;
      validNames.add(name);
      return true;
    }

    const fn =
      tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)
        ? tool.function
        : null;
    const rawName =
      typeof tool.name === "string" ? tool.name : typeof fn?.name === "string" ? fn.name : "";
    const name = rawName.trim();
    if (!name) return false;
    const finalName = name.slice(0, MAX_TOOL_NAME_LEN);
    // Two long names can collapse onto the same id after truncation; upstream
    // rejects duplicate declarations, so keep the first.
    if (validNames.has(finalName)) return false;
    const description =
      typeof tool.description === "string"
        ? tool.description
        : typeof fn?.description === "string"
          ? fn.description
          : "";
    let parameters =
      tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
        ? tool.parameters
        : fn?.parameters && typeof fn.parameters === "object" && !Array.isArray(fn.parameters)
          ? fn.parameters
          : { type: "object", properties: {} };
    // Mirror the request translator: {type:"object"} without properties is rejected
    // by strict Responses backends, so fill in the empty properties map.
    if (parameters.type === "object" && !parameters.properties)
      parameters = { ...parameters, properties: {} };
    for (const k of Object.keys(tool)) delete tool[k];
    tool.type = "function";
    tool.name = finalName;
    if (description) tool.description = description;
    tool.parameters = parameters;
    validNames.add(finalName);
    return true;
  });
  if (
    body.tool_choice &&
    typeof body.tool_choice === "object" &&
    !Array.isArray(body.tool_choice)
  ) {
    // Both {type:"function"} and {type:"custom"} name a declared tool.
    if (body.tool_choice.type === "function" || body.tool_choice.type === "custom") {
      const n = typeof body.tool_choice.name === "string" ? body.tool_choice.name.trim() : "";
      if (!n || !validNames.has(n)) delete body.tool_choice;
    }
  }
}

/**
 * Last line of defense for native Responses clients (sourceFormat === targetFormat
 * skips translation): coerce items in place so malformed tool payloads 400 here
 * with a clear shape instead of upstream as InputValidationError.
 */
export function sanitizeResponsesItems(body) {
  if (!Array.isArray(body.input)) return;
  body.input = body.input.filter((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return true;
    // Strip prior-turn reasoning items: OpenCode's lanes route to a pooled
    // upstream account, where reasoning `encrypted_content` cannot be validated
    // across rotated accounts or sessions (400 "not issued to this caller").
    // Stateless mode (store=false) then rejects the dangling item as deleted,
    // so dropping prior reasoning keeps multi-turn tool loops working.
    if (item.type === "reasoning") return false;
    delete item.encrypted_content;
    delete item.reasoning_encrypted_content;
    if (item.type === "function_call") {
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") return false;
      item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      item.call_id = clampResponsesCallId(item.call_id);
      item.arguments = coerceResponsesArguments(item.arguments);
      return true;
    }
    if (item.type === "function_call_output") {
      item.call_id = clampResponsesCallId(item.call_id);
      item.output = coerceResponsesOutput(item.output);
      return true;
    }
    // Freeform tool calls (custom tools above): keep them paired and named, but
    // never mint a call_id here — a regenerated id would stop matching its output.
    if (item.type === "custom_tool_call" || item.type === "custom_tool_call_output") {
      if (item.type === "custom_tool_call") {
        if (!item.name || typeof item.name !== "string" || !item.name.trim()) return false;
        item.name = item.name.trim().slice(0, MAX_TOOL_NAME_LEN);
      }
      if (typeof item.call_id === "string" && item.call_id) {
        item.call_id = clampResponsesCallId(item.call_id);
      }
      return true;
    }
    return true;
  });
}
