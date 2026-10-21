// ── CLAUDE MESSAGE BODY ──────────────────────────────────────────────
// A Claude-format client (/v1/messages) must always receive an Anthropic
// `message` body, whichever wire format the upstream spoke. Claude Code reads
// `message.content[]`; a raw `chat.completion` makes it throw a TypeError,
// which auto mode surfaces as "Auto mode check unavailable" — every classifier
// call is a non-streaming /v1/messages request, so the whole mode fails closed.
//
// This module owns both directions and the Anthropic SSE aggregation used when
// a forced-streaming upstream has to answer a JSON client. It imports no
// handler, so both non-streaming paths can use it without a circular import.

import { FORMATS } from "../../translator/formats.js";
import { fromOpenAIFinish } from "../../translator/concerns/finishReason.js";
import { extractReasoningText } from "../../translator/concerns/reasoning.js";
import { ROLE, CLAUDE_BLOCK } from "../../translator/schema/index.js";

// ── HELPERS ─────────────────────────────────────────────────────────

function parseToolArguments(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Text carried by an OpenAI message whose `content` is a parts array. */
function textFromContentParts(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => typeof part?.text === "string")
    .map((part) => part.text)
    .join("");
}

function claudeUsageFromOpenAI(usage) {
  const cacheRead =
    usage.prompt_tokens_details?.cached_tokens || usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.prompt_tokens_details?.cache_creation_tokens || 0;
  // OpenAI counts cached tokens inside prompt_tokens; Anthropic reports them
  // outside input_tokens. Subtract so a client summing the three matches — but
  // only from prompt_tokens. An `input_tokens`-shaped body is already
  // cache-exclusive, and subtracting there would count the cache twice.
  const inputTokens =
    usage.prompt_tokens !== undefined
      ? Math.max(0, usage.prompt_tokens - cacheRead - cacheCreate)
      : usage.input_tokens || 0;

  const claudeUsage = {
    input_tokens: inputTokens,
    output_tokens: usage.completion_tokens || usage.output_tokens || 0,
  };
  if (cacheRead > 0) claudeUsage.cache_read_input_tokens = cacheRead;
  if (cacheCreate > 0) claudeUsage.cache_creation_input_tokens = cacheCreate;
  return claudeUsage;
}

// ── OPENAI CHAT → CLAUDE MESSAGE ────────────────────────────────────

/**
 * Convert an OpenAI Chat Completions body into an Anthropic `message`.
 * A body that is already Claude-shaped (has a `content` array) is passed through.
 *
 * Usage follows the Anthropic contract: `input_tokens` EXCLUDES cached tokens,
 * so the cache counters are surfaced separately (`cache_read_input_tokens`,
 * `cache_creation_input_tokens`) exactly as the streaming translator does.
 */
export function chatCompletionToClaudeMessage(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return responseBody;
  // Upstream error payload — keep it so the failure is not masked as an empty turn.
  if (responseBody.error) return responseBody;
  // Already a Claude message (e.g. an upstream that speaks Claude on the wire).
  if (Array.isArray(responseBody.content) && !responseBody.choices) return responseBody;

  const choice = responseBody?.choices?.[0];
  const message = choice?.message || {};
  const content = [];

  const reasoning = extractReasoningText(message);
  if (reasoning) {
    content.push({ type: CLAUDE_BLOCK.THINKING, thinking: reasoning });
  }
  const text =
    typeof message.content === "string" ? message.content : textFromContentParts(message.content);
  if (text.length > 0) {
    content.push({ type: CLAUDE_BLOCK.TEXT, text });
  }
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    const fn = toolCall.function || {};
    content.push({
      type: CLAUDE_BLOCK.TOOL_USE,
      id: toolCall.id || `toolu_${Date.now()}_${content.length}`,
      name: fn.name || toolCall.name || "",
      input: parseToolArguments(fn.arguments ?? toolCall.arguments),
    });
  }
  // A missing/empty choice still has to leave the client a readable message.
  if (content.length === 0) content.push({ type: CLAUDE_BLOCK.TEXT, text: "" });

  // Some upstreams omit finish_reason; tool calls imply a tool_use stop.
  const finishReason = choice?.finish_reason || (toolCalls.length ? "tool_calls" : "stop");

  return {
    id: String(responseBody.id || `msg_${Date.now()}`).replace(/^chatcmpl-/, ""),
    type: "message",
    role: ROLE.ASSISTANT,
    model: responseBody.model || "unknown",
    content,
    stop_reason: fromOpenAIFinish(finishReason, FORMATS.CLAUDE),
    stop_sequence: null,
    usage: claudeUsageFromOpenAI(responseBody.usage || {}),
  };
}

// ── CLAUDE MESSAGE → OPENAI CHAT COMPLETION ─────────────────────────

/**
 * Convert an Anthropic `message` into an OpenAI Chat Completions body.
 *
 * A body that already carries `choices` (an upstream that answers in chat shape
 * regardless of the requested format) is passed through, as is a body whose
 * `content` is not an array (some gateways return a bare string).
 */
export function claudeMessageToChatCompletion(responseBody) {
  if (!responseBody || typeof responseBody !== "object") return responseBody;
  if (responseBody.choices) return responseBody;
  if (responseBody.content && !Array.isArray(responseBody.content)) return responseBody;

  let textContent = "",
    thinkingContent = "";
  const toolCalls = [];

  for (const block of responseBody.content || []) {
    if (block.type === CLAUDE_BLOCK.TEXT) {
      // Strip markdown code block markers (e.g. kimi wraps JSON in ```json...```)
      const raw = block.text ?? "";
      const text = raw.replace(/^\s*```\s*json\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");
      textContent += text;
    } else if (block.type === CLAUDE_BLOCK.THINKING) thinkingContent += block.thinking || "";
    else if (block.type === CLAUDE_BLOCK.TOOL_USE) {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: { name: block.name, arguments: JSON.stringify(block.input || {}) },
      });
    }
  }

  const message = { role: ROLE.ASSISTANT };
  if (textContent) message.content = textContent;
  if (thinkingContent) message.reasoning_content = thinkingContent;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;
  if (!message.content && !message.tool_calls) message.content = "";

  let finishReason = responseBody.stop_reason || "stop";
  if (finishReason === "end_turn") finishReason = "stop";
  if (finishReason === "tool_use") finishReason = "tool_calls";

  const result = {
    id: `chatcmpl-${responseBody.id || Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: responseBody.model || "claude",
    choices: [{ index: 0, message, finish_reason: finishReason }],
  };

  const usage = responseBody.usage;
  if (usage) {
    result.usage = {
      prompt_tokens: usage.input_tokens || 0,
      completion_tokens: usage.output_tokens || 0,
      total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    };
    if (usage.cache_read_input_tokens)
      result.usage.prompt_tokens_details = {
        ...(result.usage.prompt_tokens_details || {}),
        cached_tokens: usage.cache_read_input_tokens,
      };
  }
  return result;
}

// ── CLAUDE SSE → CLAUDE MESSAGE ─────────────────────────────────────

function parseSSEPayloads(rawSSE) {
  const events = [];
  for (const line of String(rawSSE || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed && typeof parsed === "object") events.push(parsed);
    } catch {
      /* ignore malformed lines */
    }
  }
  return events;
}

function appendDelta(block, parts, delta) {
  switch (delta.type) {
    case "text_delta":
      parts.push(String(delta.text ?? ""));
      break;
    case "thinking_delta":
      parts.push(String(delta.thinking ?? ""));
      break;
    case "input_json_delta":
      parts.push(String(delta.partial_json ?? ""));
      break;
    case "signature_delta":
      block.signature = `${block.signature || ""}${delta.signature || ""}`;
      break;
    case "citations_delta":
      if (delta.citation) block.citations = [...(block.citations || []), delta.citation];
      break;
  }
}

/**
 * Assemble an Anthropic `message` from an Anthropic Messages SSE stream.
 *
 * Used when a forced-streaming provider speaks Claude on the wire (for example
 * opencode's `union-alpha`) but the client asked for JSON. Mirrors the
 * streaming translator's block model: text/thinking deltas concatenate, tool
 * `input_json_delta` fragments parse into `tool_use.input`, and usage is merged
 * so the cache counters from `message_start` survive the `message_delta` total.
 *
 * @returns {object|null} the message, `{ error }` on an `event: error`, or null
 *   when the stream carried no Anthropic event (the caller then aggregates it in
 *   the dialect the upstream actually used).
 */
export function parseClaudeSSEToMessage(rawSSE, fallbackModel) {
  const events = parseSSEPayloads(rawSSE);
  let streamError = null;
  let message = {};
  // Only an Anthropic lifecycle event proves the upstream spoke Claude.
  // (`completed` is not tracked separately: a truncated stream is still assembled
  // so a partial answer is not thrown away.)
  // `targetFormat` is what we asked for, not what came back: a provider can
  // answer its Claude transport in OpenAI dialect, and parsing that as Anthropic
  // would silently drop the answer.
  let sawAnthropicEvent = false;
  const blocks = new Map(); // index -> content block
  const parts = new Map(); // index -> accumulated delta strings

  for (const event of events) {
    const type = event.type;
    if (type === "error" || event.error) {
      streamError = event.error || {
        type: "api_error",
        message: event.message || "upstream error",
      };
      continue;
    }
    if (type === "message_start") {
      sawAnthropicEvent = true;
      if (event.message && typeof event.message === "object") message = { ...event.message };
    } else if (type === "content_block_start") {
      const idx = event.index;
      if (
        typeof idx === "number" &&
        event.content_block &&
        typeof event.content_block === "object"
      ) {
        sawAnthropicEvent = true;
        blocks.set(idx, { ...event.content_block });
        if (!parts.has(idx)) parts.set(idx, []);
      }
    } else if (type === "content_block_delta") {
      const idx = event.index;
      const delta = event.delta;
      if (typeof idx !== "number" || !delta || typeof delta !== "object") continue;
      // A delta alone is not proof of dialect — OpenAI chunks also carry one.
      // Only the Anthropic-typed `content_block_start` / `message_start` above
      // are.
      if (!blocks.has(idx)) {
        blocks.set(idx, { type: CLAUDE_BLOCK.TEXT, text: "" });
        parts.set(idx, []);
      }
      appendDelta(blocks.get(idx), parts.get(idx), delta);
    } else if (type === "message_delta") {
      const delta = event.delta;
      if (delta && typeof delta === "object") {
        if (delta.stop_reason) message.stop_reason = delta.stop_reason;
        if ("stop_sequence" in delta) message.stop_sequence = delta.stop_sequence;
      }
      if (event.usage && typeof event.usage === "object") {
        const merged = { ...(message.usage || {}) };
        for (const [key, value] of Object.entries(event.usage)) {
          if (value !== undefined) merged[key] = value;
        }
        message.usage = merged;
      }
    } else if (type === "message_stop") {
      sawAnthropicEvent = true;
    }
  }

  if (streamError) return { error: streamError };
  // No Anthropic lifecycle event at all: this is not our dialect (or there was
  // nothing to read). Returning null lets the caller aggregate it as a chat
  // stream instead of answering with the empty message this parser would build.
  if (!sawAnthropicEvent) return null;

  const content = [];
  for (const idx of [...blocks.keys()].sort((a, b) => a - b)) {
    const block = blocks.get(idx);
    const accumulated = (parts.get(idx) || []).join("");
    if (block.type === CLAUDE_BLOCK.TEXT) {
      block.text = `${block.text || ""}${accumulated}`;
    } else if (block.type === CLAUDE_BLOCK.THINKING) {
      block.thinking = `${block.thinking || ""}${accumulated}`;
    } else if (block.type === CLAUDE_BLOCK.TOOL_USE && accumulated) {
      let input;
      try {
        input = JSON.parse(accumulated);
      } catch {
        input = undefined;
      }
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        // The client cannot call a tool whose input is not an object; failing
        // here is better than emitting a half-parsed tool_use block.
        throw new Error("Claude tool_use input is not a JSON object");
      }
      block.input = input;
    }
    content.push(block);
  }

  // A stream that only carried message_start/stop keeps whatever it declared.
  if (content.length === 0 && Array.isArray(message.content) && message.content.length > 0) {
    content.push(...message.content);
  }

  const usage = message.usage && typeof message.usage === "object" ? { ...message.usage } : {};
  if (usage.input_tokens === undefined) usage.input_tokens = 0;
  if (usage.output_tokens === undefined) usage.output_tokens = 0;

  return {
    ...message,
    id: message.id || `msg_${Date.now()}`,
    type: "message",
    role: ROLE.ASSISTANT,
    model: message.model || fallbackModel || "unknown",
    content,
    stop_reason: message.stop_reason || "end_turn",
    stop_sequence: message.stop_sequence ?? null,
    usage,
  };
}
