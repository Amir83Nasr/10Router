// Terminal logger for the request/runtime core.
//
// One line per event, ANSI-colored (NO_COLOR-aware) for terminal readability.
// Two shapes:
//
//   [HH:MM:SS] LEVEL [scope] message          debug/info/warn/error
//   [HH:MM:SS] [reqid] EVENT message          correlated request lines
//
// Correlated lines share a short hex id per client session, so all lines of
// one conversation can be followed with grep. Colors wrap tokens only, so
// grep still matches; the dashboard strips ANSI on ingest. Errors go to
// stderr; everything else goes to stdout.

// ANSI colors, emitted unconditionally (except NO_COLOR) so background log
// files keep colors for `10router logs` tailing.
const NO_COLOR = typeof process !== "undefined" && "NO_COLOR" in (process.env ?? {});
const ansi = (code: string): string => (NO_COLOR ? "" : `\x1b[${code}m`);
const RESET = ansi("0");
const BOLD = ansi("1");
const DIM = ansi("2");
const RED = ansi("31");
const GREEN = ansi("32");
const YELLOW = ansi("33");
const CYAN = ansi("36");
const GRAY = ansi("90");

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: GRAY,
  INFO: CYAN,
  WARN: YELLOW,
  ERROR: RED,
};

const EVENT_COLORS: Record<string, string> = {
  REQ: CYAN,
  DONE: GREEN,
  REFRESH: YELLOW,
  SAVERS: GRAY,
  BLOCKED: RED,
  ABORT: RED,
  ERROR: RED,
};

const LOG_LEVELS: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase?.() || ""] ?? LOG_LEVELS.INFO;

// Longest inline payload before truncation (keeps lines readable).
const MAX_DATA_CHARS = 500;

function formatTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

let tagCursor = 0;

// Allocate next rotating id (fallback when no session seed available)
export function nextTag(): string {
  tagCursor++;
  return tagCursor.toString(16).padStart(4, "0");
}

// Stable id derived from a session/connection seed: same seed always maps to
// the same id, so one CLI conversation keeps one id across requests
export function tagForSession(seed?: string | null): string {
  if (!seed) return nextTag();
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, "0").slice(-4);
}

type ThinkIntent = { mode?: string; budget?: number; level?: string };

// Print one correlated line: [time] [reqid] EVENT message
export function line(tag: string, event: string, message: string): void {
  if (LEVEL > LOG_LEVELS.INFO) return;
  const color = EVENT_COLORS[event] ?? "";
  console.log(
    `${DIM}[${formatTime()}]${RESET} [${tag}] ${color}${BOLD}${event}${RESET} ${message}`,
  );
}

// Like line() but always printed regardless of LOG_LEVEL (errors must never be hidden)
export function errorLine(tag: string, event: string, message: string): void {
  console.error(
    `${DIM}[${formatTime()}]${RESET} [${tag}] ${RED}${BOLD}${event}${RESET} ${message}`,
  );
}

// Format thinking intent for the request line ("high(10k)" / "off" / "auto")
export function fmtThink(intent?: ThinkIntent | null): string | null {
  if (!intent || !intent.mode) return null;
  if (intent.mode === "none") return "off";
  if (intent.mode === "auto") return "auto";
  if (intent.mode === "budget") {
    const k =
      intent.budget && intent.budget >= 1000
        ? `${Math.round(intent.budget / 1000)}k`
        : `${intent.budget}`;
    return k as string;
  }
  if (intent.mode === "level") return intent.level || null;
  return null;
}

function formatData(data: unknown): string {
  if (!data) return "";
  let s: string;
  if (typeof data === "string") s = data;
  else if (data instanceof Error) s = data.stack || data.message;
  else {
    try {
      s = JSON.stringify(data);
    } catch {
      s = String(data);
    }
  }
  if (s.length > MAX_DATA_CHARS)
    s = `${s.slice(0, MAX_DATA_CHARS)} ...(+${s.length - MAX_DATA_CHARS} chars)`;
  return s;
}

export function debug(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.DEBUG) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(
      `${DIM}[${formatTime()}]${RESET} ${GRAY}DEBUG${RESET} ${DIM}[${tag}]${RESET} ${message}${dataStr}`,
    );
  }
}

export function info(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.INFO) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(
      `${DIM}[${formatTime()}]${RESET} ${CYAN}INFO${RESET} ${DIM}[${tag}]${RESET} ${message}${dataStr}`,
    );
  }
}

export function warn(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.WARN) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.warn(
      `${DIM}[${formatTime()}]${RESET} ${YELLOW}WARN${RESET} ${DIM}[${tag}]${RESET} ${message}${dataStr}`,
    );
  }
}

export function error(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.ERROR) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.error(
      `${DIM}[${formatTime()}]${RESET} ${RED}ERROR${RESET} ${DIM}[${tag}]${RESET} ${message}${dataStr}`,
    );
  }
}

export function request(method: string, path: string, extra?: unknown): void {
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(
    `${DIM}[${formatTime()}]${RESET} ${DIM}[http]${RESET} ${CYAN}-->${RESET} ${BOLD}${method}${RESET} ${path}${dataStr}`,
  );
}

export function response(status: number, duration: number, extra?: unknown): void {
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  const emit = status < 400 ? console.log : console.error;
  const color = status < 400 ? GREEN : RED;
  emit(
    `${DIM}[${formatTime()}]${RESET} ${DIM}[http]${RESET} ${color}<--${RESET} ${color}${BOLD}${status}${RESET} ${duration}ms${dataStr}`,
  );
}

export function stream(event: string, data?: unknown): void {
  const dataStr = data ? ` ${formatData(data)}` : "";
  console.log(`${DIM}[${formatTime()}]${RESET} ${DIM}[stream]${RESET} ${event}${dataStr}`);
}

// Mask sensitive data
export function maskKey(key?: string | null): string {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
