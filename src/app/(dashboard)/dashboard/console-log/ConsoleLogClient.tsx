"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pause, Play, Trash2, Search, ArrowDown } from "lucide-react";
import { CONSOLE_LOG_CONFIG } from "@/shared/constants/config";
import { toLogEntry } from "@/lib/logLine.js";
import type { LogCategory, LogEntry, LogLevel } from "@/lib/logLine.js";

// ── LEVEL META ───────────────────────────────────────────

const LEVEL_BADGE: Record<LogLevel, "default" | "secondary" | "destructive"> = {
  debug: "default",
  info: "secondary",
  warn: "secondary",
  error: "destructive",
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

const ALL_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const CATEGORY_LABEL: Record<LogCategory | "all", string> = {
  all: "All categories",
  request: "Request",
  done: "Done",
  usage: "Usage",
  combo: "Combo",
  token: "Token",
  rtk: "RTK",
  stream: "Stream",
  debug: "Debug",
  auth: "Auth",
  proxy: "Proxy",
  db: "DB",
  tunnel: "Tunnel",
  other: "Other",
};

const CATEGORY_ORDER: LogCategory[] = [
  "request",
  "done",
  "usage",
  "combo",
  "token",
  "rtk",
  "stream",
  "debug",
  "auth",
  "proxy",
  "db",
  "tunnel",
  "other",
];

// Matches a producer timestamp prefix ("[10:00:00] ...") so the viewer can
// show the uniform capture time without duplicating it.
const PRODUCER_TS_RE = /^\[\d{1,2}:\d{2}(:\d{2})?(\s?[AP]M)?\]\s*/;

function formatClock(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

function stripProducerTs(text: string) {
  return text.replace(PRODUCER_TS_RE, "");
}

// ── MESSAGE HIGHLIGHT ────────────────────────────────────

// Inline segments of one log message, rendered with per-part colors:
// durations (ms), key=value pairs, token counts, stack traces.
type Segment =
  | { kind: "plain"; text: string }
  | { kind: "duration"; text: string }
  | { kind: "kv"; key: string; value: string }
  | { kind: "tokens"; text: string };

// Splits off a trailing stack trace ("    at ..." / multi-line error body)
// into its own collapsible part. Returns [headline, rest].
function splitTrace(text: string): [string, string | null] {
  const nl = text.indexOf("\n");
  if (nl === -1) return [text, null];
  return [text.slice(0, nl), text.slice(nl + 1)];
}

// Tokenize one headline into colored segments. Order matters: token counts
// first (IN 100, OUT 50), then durations (1200ms), then key=value.
const HIGHLIGHT_RE =
  /\b(IN|OUT) \d[\d,]*( \(CACHE [^)]*\))?|\b\d[\d,]*ms\b|\b[A-Za-z_][\w.-]*=[^\s·|,]+/g;

function highlightMessage(headline: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of headline.matchAll(HIGHLIGHT_RE)) {
    const match = m[0];
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ kind: "plain", text: headline.slice(last, idx) });
    if (/^(IN|OUT) /.test(match)) segments.push({ kind: "tokens", text: match });
    else if (/ms$/.test(match)) segments.push({ kind: "duration", text: match });
    else {
      const eq = match.indexOf("=");
      segments.push({ kind: "kv", key: match.slice(0, eq + 1), value: match.slice(eq + 1) });
    }
    last = idx + match.length;
  }
  if (last < headline.length) segments.push({ kind: "plain", text: headline.slice(last) });
  if (segments.length === 0) segments.push({ kind: "plain", text: headline });
  return segments;
}

// ── LOG ROW ──────────────────────────────────────────────

function LogMessage({ text, isError }: { text: string; isError: boolean }) {
  const [headline, trace] = useMemo(() => splitTrace(text), [text]);
  const segments = useMemo(() => highlightMessage(stripProducerTs(headline)), [headline]);

  return (
    <span className="break-words">
      {segments.map((seg, i) => {
        if (seg.kind === "duration")
          return (
            <span key={i} className="font-semibold text-amber-700">
              {seg.text}
            </span>
          );
        if (seg.kind === "tokens")
          return (
            <span key={i} className="font-semibold text-emerald-700">
              {seg.text}
            </span>
          );
        if (seg.kind === "kv")
          return (
            <span key={i}>
              <span className="text-muted-foreground">{seg.key}</span>
              <span className="font-medium text-sky-700">{seg.value}</span>
            </span>
          );
        return <span key={i}>{seg.text}</span>;
      })}
      {trace && (
        <details className="mt-1">
          <summary
            className={`cursor-pointer text-[11px] font-medium ${
              isError ? "text-red-600" : "text-muted-foreground"
            } hover:underline`}
          >
            Stack trace
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap text-muted-foreground">
            {trace}
          </pre>
        </details>
      )}
    </span>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const isError = entry.level === "error";
  const isDone = entry.category === "done";

  return (
    <div
      className={`flex items-start gap-2 px-3 py-1.5 leading-relaxed ${
        isError
          ? "border-l-2 border-red-500 bg-red-500/5"
          : isDone
            ? "border-l-2 border-green-500 bg-green-500/5"
            : "border-l-2 border-transparent hover:bg-muted/50"
      }`}
    >
      <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {formatClock(entry.ts)}
      </span>
      <Badge variant={LEVEL_BADGE[entry.level]} className="shrink-0">
        {LEVEL_LABEL[entry.level]}
      </Badge>
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
        {CATEGORY_LABEL[entry.category]}
      </span>
      <span className="min-w-0 flex-1 text-foreground">
        <LogMessage text={entry.text} isError={isError} />
      </span>
    </div>
  );
}

// ── CONSOLE LOG VIEWER ───────────────────────────────────

type LogMessageEvent =
  | { type: "init"; logs: Array<string | LogEntry> }
  | { type: "line"; line: string | LogEntry }
  | { type: "lines"; lines: Array<string | LogEntry> }
  | { type: "clear" };

function normalizeLines(lines: Array<string | LogEntry>): LogEntry[] {
  return lines.map((l) => toLogEntry(l));
}

export default function ConsoleLogClient() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const [levels, setLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [category, setCategory] = useState<LogCategory | "all">("all");
  const logRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const handleClear = async () => {
    try {
      await fetch("/api/translator/console-logs", { method: "DELETE" });
      // UI cleared via SSE "clear" event
    } catch (err) {
      console.error("Failed to clear console logs:", err);
    }
  };

  useEffect(() => {
    const es = new EventSource("/api/translator/console-logs/stream");

    es.onopen = () => setConnected(true);

    es.onmessage = (e: MessageEvent) => {
      if (pausedRef.current) return;
      const msg = JSON.parse(e.data) as LogMessageEvent;
      if (msg.type === "init") {
        setLogs(normalizeLines(msg.logs).slice(-CONSOLE_LOG_CONFIG.maxLines));
      } else if (msg.type === "line") {
        const entry = toLogEntry(msg.line);
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > CONSOLE_LOG_CONFIG.maxLines
            ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
            : next;
        });
      } else if (msg.type === "lines") {
        const entries = normalizeLines(msg.lines);
        setLogs((prev) => {
          const next = [...prev, ...entries];
          return next.length > CONSOLE_LOG_CONFIG.maxLines
            ? next.slice(-CONSOLE_LOG_CONFIG.maxLines)
            : next;
        });
      } else if (msg.type === "clear") {
        setLogs([]);
      }
    };

    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const toggleLevel = (level: LogLevel) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (!levels.has(entry.level)) return false;
      if (category !== "all" && entry.category !== category) return false;
      if (q && !entry.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, levels, category, search]);

  const errorCount = useMemo(() => logs.filter((l) => l.level === "error").length, [logs]);
  const warnCount = useMemo(() => logs.filter((l) => l.level === "warn").length, [logs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="sr-only">Console logs</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={
                  connected ? "size-2 rounded-full bg-green-500" : "size-2 rounded-full bg-red-500"
                }
              />
            </TooltipTrigger>
            <TooltipContent>{connected ? "Connected" : "Disconnected"}</TooltipContent>
          </Tooltip>
          <span className="text-xs text-muted-foreground">
            {filtered.length}/{logs.length} lines
            {errorCount > 0 && (
              <span className="font-semibold text-red-600"> · {errorCount} errors</span>
            )}
            {warnCount > 0 && (
              <span className="font-semibold text-yellow-600"> · {warnCount} warnings</span>
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs…"
                className="h-7 w-44 pl-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-1">
              {ALL_LEVELS.map((level) => (
                <Tooltip key={level}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => toggleLevel(level)}
                      className={`cursor-pointer transition-opacity ${
                        levels.has(level) ? "opacity-100" : "opacity-30 grayscale"
                      }`}
                    >
                      <Badge variant={LEVEL_BADGE[level]}>{LEVEL_LABEL[level]}</Badge>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{`Toggle ${LEVEL_LABEL[level]}`}</TooltipContent>
                </Tooltip>
              ))}
            </div>
            <Select value={category} onValueChange={(v) => setCategory(v as LogCategory | "all")}>
              <SelectTrigger className="h-7 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{CATEGORY_LABEL.all}</SelectItem>
                {CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => setPaused((p) => !p)}>
              {paused ? <Play /> : <Pause />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={autoScroll ? "secondary" : "outline"}
                  onClick={() => setAutoScroll((a) => !a)}
                >
                  <ArrowDown />
                  Follow
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-scroll to newest</TooltipContent>
            </Tooltip>
            <Button size="sm" variant="outline" onClick={handleClear}>
              <Trash2 />
              Clear
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          ref={logRef}
          className="h-[calc(100vh-220px)] overflow-y-auto rounded-b-lg border border-border bg-card p-2 font-mono text-xs"
        >
          {logs.length === 0 ? (
            <span className="text-muted-foreground">No console logs yet.</span>
          ) : filtered.length === 0 ? (
            <span className="text-muted-foreground">No logs match the current filters.</span>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((entry, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable id
                <LogRow key={i} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
