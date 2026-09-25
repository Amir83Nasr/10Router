"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shutdown flow: fire POST (server exits ~500ms later, so the fetch reliably
// fails), show "server stopped" state, poll /api/health until the port goes
// dark or the timeout hits. Shared by HeaderMenu + profile page so both
// buttons behave the same.
const HEALTH_POLL_MS = 1000;
const HEALTH_TIMEOUT_MS = 15000;

export function useShutdown() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const pollUntilDown = useCallback(async () => {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) break;
      } catch {
        break; // connection refused = process exited
      }
      await new Promise((r) => {
        const t = setTimeout(r, HEALTH_POLL_MS);
        timers.current.push(t as unknown as number);
      });
    }
    if (Date.now() >= deadline - HEALTH_POLL_MS) setTimedOut(true);
    else setStopped(true);
  }, []);

  const confirm = useCallback(async () => {
    setShuttingDown(true);
    try {
      await fetch("/api/version/shutdown", { method: "POST" });
    } catch {
      // Expected: server exits mid-response
    }
    setConfirmOpen(false);
    pollUntilDown();
  }, [pollUntilDown]);

  const open = useCallback(() => {
    setTimedOut(false);
    setStopped(false);
    setConfirmOpen(true);
  }, []);

  const reset = useCallback(() => {
    setConfirmOpen(false);
    setShuttingDown(false);
    setStopped(false);
    setTimedOut(false);
  }, []);

  useEffect(() => {
    if (stopped || timedOut) setShuttingDown(false);
  }, [stopped, timedOut]);

  return { confirmOpen, shuttingDown, stopped, timedOut, open, confirm, reset };
}
