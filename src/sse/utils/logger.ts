// Terminal logger for the request/runtime core.
//
// One line per event, plain ASCII (no emoji, no ANSI colors) so output stays
// greppable and pipe-safe. Two shapes:
//
//   [HH:MM:SS] LEVEL [scope] message          debug/info/warn/error
//   [HH:MM:SS] [reqid] EVENT message          correlated request lines
//
// Correlated lines share a short hex id per client session, so all lines of
// one conversation can be followed with grep. Errors go to stderr; everything
// else goes to stdout.

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
  console.log(`[${formatTime()}] [${tag}] ${event} ${message}`);
}

// Like line() but always printed regardless of LOG_LEVEL (errors must never be hidden)
export function errorLine(tag: string, event: string, message: string): void {
  console.error(`[${formatTime()}] [${tag}] ${event} ${message}`);
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
    console.log(`[${formatTime()}] DEBUG [${tag}] ${message}${dataStr}`);
  }
}

export function info(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.INFO) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.log(`[${formatTime()}] INFO [${tag}] ${message}${dataStr}`);
  }
}

export function warn(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.WARN) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.warn(`[${formatTime()}] WARN [${tag}] ${message}${dataStr}`);
  }
}

export function error(tag: string, message: string, data?: unknown): void {
  if (LEVEL <= LOG_LEVELS.ERROR) {
    const dataStr = data ? ` ${formatData(data)}` : "";
    console.error(`[${formatTime()}] ERROR [${tag}] ${message}${dataStr}`);
  }
}

export function request(method: string, path: string, extra?: unknown): void {
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  console.log(`[${formatTime()}] [http] --> ${method} ${path}${dataStr}`);
}

export function response(status: number, duration: number, extra?: unknown): void {
  const dataStr = extra ? ` ${formatData(extra)}` : "";
  const emit = status < 400 ? console.log : console.error;
  emit(`[${formatTime()}] [http] <-- ${status} ${duration}ms${dataStr}`);
}

export function stream(event: string, data?: unknown): void {
  const dataStr = data ? ` ${formatData(data)}` : "";
  console.log(`[${formatTime()}] [stream] ${event}${dataStr}`);
}

// Mask sensitive data
export function maskKey(key?: string | null): string {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
