// Claude Code auto-mode safety classifier detection.
//
// The classifier is an ordinary non-streaming /v1/messages call, but it sends
// `stop_sequences: ["</severity>"]` (current schema) or `["</block>"]` (legacy)
// to end its verdict early. Providers that implement `stop` by trimming the
// matched text from the completion return `<severity>0` instead of
// `<severity>0</severity>`, and the client cannot parse that verdict — auto
// mode then fails closed for every action.
//
// Detection is structural, never model-based: the classifier is the only
// utility call that carries a `<transcript>` block, asks for the verdict tag in
// its system prompt, and declares no tools. User content alone can never opt a
// request into this policy.

import { ROLE } from "../schema/index.js";

const TRANSCRIPT_MARKER = "<transcript>";
const SEVERITY_INSTRUCTION = "Output <severity>N</severity>";
const LEGACY_YES = "yes</block>";
const LEGACY_NO = "no</block>";

const SEVERITY_STOP = "</severity>";
const LEGACY_STOP = "</block>";

/** Concatenate the text of a Claude content value (string or block array). */
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => typeof block?.text === "string")
    .map((block) => block.text)
    .join("");
}

/**
 * Return the stop sequence a known auto-mode classifier owns, or null.
 *
 * @param {object} body - Claude Messages request body.
 * @returns {string|null} `"</severity>"`, `"</block>"`, or null.
 */
export function detectClassifierStopSequence(body) {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body.tools) && body.tools.length > 0) return null;

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const transcript = messages
    .filter((message) => message?.role !== ROLE.SYSTEM)
    .map((message) => textOf(message?.content))
    .join("\n");
  if (!transcript.includes(TRANSCRIPT_MARKER)) return null;

  const systemText = [
    textOf(body.system),
    ...messages.filter((message) => message?.role === ROLE.SYSTEM).map((m) => textOf(m.content)),
  ].join("\n");

  // Current schema wins when both known instructions appear.
  if (systemText.includes(SEVERITY_INSTRUCTION)) return SEVERITY_STOP;
  if (systemText.includes(LEGACY_YES) || systemText.includes(LEGACY_NO)) return LEGACY_STOP;
  return null;
}

/**
 * Drop the classifier-owned stop hint from a `stop_sequences` array.
 * Every other sequence passes through untouched.
 */
export function withoutClassifierStop(stopSequences, classifierStop) {
  if (!Array.isArray(stopSequences) || !classifierStop) return stopSequences;
  return stopSequences.filter((sequence) => sequence !== classifierStop);
}
