// ── TYPES ────────────────────────────────────────────────

// Log level — derived from console method + content signals.
/** @typedef {"debug" | "info" | "warn" | "error"} LogLevel */

// Coarse category for filtering + per-part coloring. "other" is the
// fallback so unclassified lines still render.
/**
 * @typedef {"request" | "done" | "usage" | "combo" | "token" | "rtk" | "stream" | "debug" | "auth" | "proxy" | "db" | "tunnel" | "other"} LogCategory
 */

// One structured log entry. `text` is the ANSI-stripped line as before;
// `level`/`category` are derived, never trusted from producers.
/**
 * @typedef {object} LogEntry
 * @property {number} ts
 * @property {LogLevel} level
 * @property {LogCategory} category
 * @property {string} text
 */

// Transport shape: entries go over SSE/REST as objects, but legacy
// plain-string lines are still accepted on the way in.
/** @typedef {string | { text?: unknown } | LogEntry} RawLogLine */

// ── CLASSIFIER ───────────────────────────────────────────

// Bracket tags producers already emit → category.
/** @type {Record<string, LogCategory>} */
const TAG_CATEGORY = {
  USAGE: "usage",
  STREAM: "stream",
  "STREAM USAGE": "usage",
  COMBO: "combo",
  FUSION: "combo",
  TOKEN: "token",
  RTK: "rtk",
  HEADROOM: "rtk",
  REQUEST: "request",
  PROXY: "proxy",
  AUTH: "auth",
  AG_QUOTA: "auth",
  DB: "db",
  TUNNEL: "tunnel",
  PROJECTID: "other",
};

// Console method → base level. Content signals can only escalate.
/** @type {Record<string, LogLevel>} */
const METHOD_LEVEL = {
  debug: "debug",
  info: "info",
  log: "info",
  warn: "warn",
  error: "error",
};

/** @type {Record<LogLevel, number>} */
const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * @param {LogLevel} base
 * @param {LogLevel} next
 * @returns {LogLevel}
 */
function escalate(base, next) {
  return LEVEL_RANK[next] > LEVEL_RANK[base] ? next : base;
}

/**
 * @param {string} method
 * @param {string} text
 * @returns {{ level: LogLevel; category: LogCategory }}
 */
export function classifyLogLine(method, text) {
  let /** @type {LogLevel} */ level = METHOD_LEVEL[method] ?? "info";
  let /** @type {LogCategory} */ category = "other";

  // Debug channel: [DBG:tag] / 🐛.
  if (/\[DBG:[^\]]+\]/.test(text) || text.includes("🐛")) {
    return { level: "debug", category: "debug" };
  }

  // New producer shapes:
  //   [HH:MM:SS] LEVEL [scope] msg        — LEVEL prefix is authoritative
  //   [HH:MM:SS] [reqid] EVENT msg        — EVENT is the 2nd bracket group
  //   [HH:MM:SS] [http] --> POST /path    — transport lines
  //   [HH:MM:SS] [stream] event
  const levelPrefix = text.match(/^\[\d{1,2}:\d{2}(:\d{2})?\]\s+(DEBUG|INFO|WARN|ERROR)\b/);
  if (levelPrefix) {
    const lv = levelPrefix[2].toLowerCase();
    if (LEVEL_RANK[lv] > LEVEL_RANK[level]) level = lv;
  }
  const reqEvent = text.match(/^\[\d{1,2}:\d{2}(:\d{2})?\]\s+\[[0-9a-f]{4}\]\s+([A-Z]+)\b/);
  if (reqEvent) {
    const ev = reqEvent[2];
    if (ev === "REQ") category = "request";
    else if (ev === "DONE") category = "done";
    else if (ev === "SAVERS") category = "rtk";
    else if (ev === "REFRESH") category = "token";
    else if (ev === "BLOCKED" || ev === "ABORT") category = "stream";
    else if (ev === "ERROR") {
      level = escalate(level, "error");
      if (category === "other") category = "request";
    }
  }
  if (category === "other" && /^\[\d{1,2}:\d{2}(:\d{2})?\]\s+\[(http|stream|usage)\]/i.test(text)) {
    const t = text.match(/^\[\d{1,2}:\d{2}(:\d{2})?\]\s+\[(http|stream|usage)\]/i)[2].toLowerCase();
    category = t === "http" ? "request" : t;
  }

  // Bracket tag, e.g. "[USAGE]", "[STREAM USAGE]", "[COMBO]".
  // NOTE: must scan ALL bracket groups — the first one may be a timestamp,
  // a LEVEL prefix, a reqid, or a transport tag, not the scope tag.
  const tagMatch = text.match(/\[([A-Z][A-Z _-]*)\]/g);
  if (tagMatch) {
    for (const m of tagMatch) {
      const tag = m.slice(1, -1).trim();
      if (TAG_CATEGORY[tag]) {
        category = TAG_CATEGORY[tag];
        break;
      }
      if (tag === "DBG" || tag.startsWith("DBG:")) return { level: "debug", category: "debug" };
    }
  }

  // Emoji markers producers already emit.
  if (text.includes("✗") || text.includes("❌")) {
    level = escalate(level, "error");
    if (category === "other") category = "request";
  } else if (text.includes("📊")) {
    if (text.includes("DONE")) category = "done";
    else if (category === "other") category = "usage";
  } else if (text.includes("⚠️")) {
    level = escalate(level, "warn");
  } else if (text.includes("🌊")) {
    if (category === "other") category = "stream";
  } else if (text.includes("🔑") || text.includes("TOKEN REFRESHED")) {
    if (category === "other") category = "token";
  } else if (text.includes("ℹ️") || text.includes("🔍")) {
    if (text.includes("🔍")) level = escalate(level, "debug");
  } else if (text.includes("📥")) {
    if (category === "other") category = "request";
  }

  // Request lines: HTTP verb ("POST model → provider/…", "POST /path …").
  if (category === "other" && /\b(POST|GET|PUT|DELETE|PATCH)\b/.test(text)) {
    category = "request";
  }

  // Keyword signals (errors must never be hidden).
  if (/\bERROR \d{3}\b/.test(text) || /\bFAILED\b/.test(text) || /\bBLOCKED\b/.test(text)) {
    level = escalate(level, "error");
  } else if (/\b(falling back|fallback|unavailable|skipped|retry)\b/i.test(text)) {
    level = escalate(level, "warn");
  }

  // Named subsystems without bracket tags.
  if (category === "other") {
    if (text.includes("[RTK]") || text.includes("HEADROOM") || text.includes("PXPIPE"))
      category = "rtk";
    else if (text.includes("[ProjectId]")) category = "other";
    else if (text.includes("[ProxyFetch]")) category = "proxy";
    else if (text.includes("[Tunnel]")) category = "tunnel";
    else if (text.includes("[DB]")) category = "db";
    else if (text.includes("[RequestDetail]")) category = "request";
    else if (text.includes("[STREAM]")) category = "stream";
    else if (text.includes("[TOKEN]")) category = "token";
    else if (text.includes("[COMBO]") || text.includes("[FUSION]")) category = "combo";
    else if (text.includes("[CHAT]")) category = "request";
  }

  return { level, category };
}

// ── ENTRY NORMALIZATION ──────────────────────────────────

// Normalize anything the buffer may hold (legacy string or entry) into
// a LogEntry. Backward-compatible: old string lines classify as info.
/**
 * @param {RawLogLine} line
 * @param {string} [method]
 * @returns {LogEntry}
 */
export function toLogEntry(line, method = "log") {
  if (typeof line === "string") {
    const { level, category } = classifyLogLine(method, line);
    return { ts: Date.now(), level, category, text: line };
  }
  if (line && typeof line === "object" && typeof line.text === "string") {
    const entry = /** @type {LogEntry} */ (line);
    if (typeof entry.ts === "number" && entry.level && entry.category) return entry;
    const { level, category } = classifyLogLine(method, entry.text);
    return {
      ts: typeof entry.ts === "number" ? entry.ts : Date.now(),
      level: entry.level ?? level,
      category: entry.category ?? category,
      text: entry.text,
    };
  }
  const text = String(line ?? "");
  const { level, category } = classifyLogLine(method, text);
  return { ts: Date.now(), level, category, text };
}
